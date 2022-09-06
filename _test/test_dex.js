const { ethers, waffle, network, upgrades } = require("hardhat");
const { expect, util } = require("chai");
const colors = require("colors")
//const { FakeContract, smock } = require("@defi-wonderland/smock");

const { utils } = require("ethers");
const { abi: pairAbi } = require("../artifacts/contracts/core/CrossPair.sol/CrossPair.json");

let factory, router, wbnb, crss, mock, crss_mockPair, crss_ethPair, devTo, buybackTo, swapAmount;
const magnifier = 100000

describe("Cross Comprehensive Test", async () => {
  /**
   * Everything in this block is only run once before all tests.
   * This is the home for setup methodss
   */

  before(async () => {
    [deployer, alice, bob, carol, david, evan, fiona, georgy] = await ethers.getSigners();
    devTo = david.address;
    buybackTo = evan.address;
    liquidity = fiona.address;
    treasuryAddr = georgy.address;

    console.log("\nDeploying...\n".cyan);
    const Factory = await ethers.getContractFactory("CrossFactory");
    factory = await Factory.deploy(deployer.address);
    console.log("- Factory Deployed: ".green, factory.address);

    const WBNB = await ethers.getContractFactory("WBNB");
    wbnb = await WBNB.deploy();

    const Maker = await ethers.getContractFactory("CrossMaker");
    maker = await Maker.deploy(factory.address, wbnb.address);
    console.log("- Maker Deployed: ".green, maker.address);

    const Taker = await ethers.getContractFactory("CrossTaker");
    taker = await Taker.deploy(factory.address, wbnb.address);
    console.log("- Taker Deployed: ".green, taker.address);

    factory.setTaker(taker.address);
    console.log("\tTaker Set Factory: ", taker.address);

    factory.setMaker(maker.address);
    console.log("\tMaker Set Factory: ", maker.address);

    const Crss = await ethers.getContractFactory("CrssToken");
    crss = await upgrades.deployProxy(Crss, [[devTo, buybackTo, liquidity, treasuryAddr], maker.address, taker.address]);
    console.log("- crss Deployed: ".green, crss.address);

    await maker.setToken(crss.address);
    await maker.setLiquidityChangeLimit(5000); // 5%
    console.log("\tMaker set Token: ", crss.address);

    await taker.setToken(crss.address);
    await taker.setPriceChangeLimit(5000); 5%
    console.log("\tTaker set Token:", crss.address);

    const MockToken = await ethers.getContractFactory("MockToken");
    mock = await MockToken.deploy("Mock", "MCK");
    console.log("- Mock token deployed: ".green, mock.address);

    // Deploy Farm
    const crssPerBlock = "100";
    startBlock = await ethers.provider.getBlock("latest");
    console.log("\tStartBlock for Masterchef Deploy: ", startBlock.number)

    // Deploy XCrss
    const xCrss = await ethers.getContractFactory("xCrssToken");
    xcrss = await upgrades.deployProxy(xCrss, [crss.address]);

    console.log("- XCrssToken deployed: ".green, xcrss.address);

    // Deploy Referral
    const Referral = await ethers.getContractFactory("CrssReferral");
    referral = await upgrades.deployProxy(Referral, []);
    console.log("- CrossReferral Deployed: ".green, referral.address);

    const FarmLib = await ethers.getContractFactory("FarmLibrary");
    FarmLibrary = await FarmLib.deploy();

    const CrossFarm = await ethers.getContractFactory("CrossFarm", {
      libraries: {
          FarmLibrary: FarmLibrary.address
      }
  });
    farm = await upgrades.deployProxy(CrossFarm, [
      crss.address,
      treasuryAddr,
      maker.address,
      taker.address,
      utils.parseEther(crssPerBlock),
      startBlock.number + 10,
    ], {
      unsafeAllow: ["external-library-linking"]
    });

    console.log("- Farm deployed: ".green, farm.address)

    await crss.setFarm(farm.address)
    console.log("\tCrss set Farm: ", farm.address)

    await xcrss.setFarm(farm.address);
    console.log("\tXCRSS set Farm: ", xcrss.address);

    await farm.setToken(crss.address)
    console.log("\tFarm set Crss: ", crss.address)

    await farm.setXToken(xcrss.address);
    console.log("\tFarm set xCrss: ", xcrss.address)

    await farm.setCrssReferral(referral.address);
    console.log("\tFarm set Referral: ", referral.address)

    console.log("\tFactory Code Hash: ", await factory.INIT_CODE_PAIR_HASH());
    console.log("\nTesting Start\n".cyan);

    console.log("\t----------------------------------------------------------".green)
    console.log("\t---                                                   ----".green)
    console.log("\t---      Text in White color is what Expected!        ----".green)
    console.log("\t---                                                   ----".green)
    console.log("\t---      Text in Yello color is what Real!            ----".green)
    console.log("\t---                                                   ----".green)
    console.log("\t----------------------------------------------------------".green)
  });

  async function tokenMint(token, account, accountName, amount) {
    await token.mint(account, utils.parseEther(amount))
    const balance = await token.balanceOf(account)
    console.log(`\t${accountName} has ${utils.formatEther(balance)} of ${await token.name()} Token`.yellow)
    expect(balance).to.equal(utils.parseEther(amount))
  }

  async function tokenApprove(token, from, fromName, to, toName, amount) {
    await token.connect(from).approve(to, utils.parseEther(amount));
    const allowance = await token.allowance(from.address, to)
    console.log(`\t${fromName} approved ${utils.formatEther(allowance)} of ${await token.name()} Token to ${toName}`.yellow);
  }

  async function addLiquidityFirst(token0, token1, amount0, amount1, amount0Min, amount1Min, to) {
    const block = await ethers.provider.getBlock("latest");
    await maker.addLiquidity(
      token0.address,
      token1.address,
      utils.parseEther(amount0),
      utils.parseEther(amount1),
      amount0Min,
      amount1Min,
      to,
      block.timestamp + 1000
    );

    const pairAddr = factory.getPair(token0.address, token1.address);
    crss_mockPair = new ethers.Contract(pairAddr, pairAbi, deployer);
    const lpBalance = await crss_mockPair.balanceOf(deployer.address);

    const expectedLP = sqrt(utils.parseEther(amount0).mul(utils.parseEther(amount1))).sub(1000);
    console.log(`\tLP balance calculated is ${utils.formatEther(expectedLP)}`);
    console.log(`\tReal LP Balance of ${to} is ${utils.formatEther(lpBalance)}`.yellow);

    expect(lpBalance).to.equal(expectedLP);
  }

  async function addLiquidityEtherFirst(token0, amount0, amount1, amount0Min, amount1Min, to) {
    const block = await ethers.provider.getBlock("latest");
    await maker.addLiquidityETH(
      token0.address,
      utils.parseEther(amount0),
      amount0Min,
      amount1Min,
      to,
      block.timestamp + 1000,
      {
        value: utils.parseEther(amount1),
      }
    );

    const pairAddr = factory.getPair(crss.address, wbnb.address);
    crss_ethPair = new ethers.Contract(pairAddr, pairAbi, deployer);
    const lpBalance = await crss_ethPair.balanceOf(deployer.address);

    const expectedLP = sqrt(utils.parseEther(amount0).mul(utils.parseEther(amount1))).sub(1000);
    console.log(`\tLP balance calculated is ${utils.formatEther(expectedLP)}`);
    console.log(`\tReal LP Balance of ${to} is ${utils.formatEther(lpBalance)}`.yellow);

    expect(lpBalance).to.equal(expectedLP);
  }

  async function swapExactTokensForETHRevert(token, amount, amountMin, to, revertStr) {
    const block = await ethers.provider.getBlock("latest");
    await crss.approve(taker.address, utils.parseEther(amount));
    await expect(
      taker.swapExactTokensForETH(
        utils.parseEther(amount),
        amountMin,
        [token.address, wbnb.address],
        to,
        block.timestamp + 1000
      )
    ).to.be.revertedWith(revertStr);
    console.log(`\tSwap Token to Eth is reversted with string "${revertStr}"`.yellow)
  }

  async function balanceCheck(token, address, expected) {
    const bal = await token.balanceOf(address)
    console.log(`\t${address} has ${utils.formatEther(bal)} amount of ${await token.name()}`.yellow)
    expect(bal).to.equal(expected)
  }

  async function removeLiquidityRevert(lpToken, token, amount, amountMin, amountEthMin, to, revertStr) {
    const block = await ethers.provider.getBlock("latest");
    await lpToken.approve(maker.address, amount)
    await expect(maker.removeLiquidityETH(token.address, amount, amountMin, amountEthMin, to, block.timestamp + 1000)).to.revertedWith(revertStr)

  }

  it("Deployer got 1e6 Crss minted", async () => {
    console.log("\n")
    const crssMinted = await crss.balanceOf(deployer.address);
    console.log("\tCrssToken Contract mints 100,000 Crss to Deployer for testing")
    console.log(`\tDeployer has ${utils.formatEther(crssMinted)} Amount of Crss Token`.yellow);
    expect(crssMinted).to.equal(utils.parseEther((1e6).toString()));
  });

  it("Mint Mock Token to Deployer", async () => {
    console.log("\n")
    const amount = "10000"
    console.log(`\tMint ${amount} Mock Token to Deployer to test Dex Actions`);
    await tokenMint(mock, deployer.address, "Deployer", amount)
  })

  it("Approve Crss Token and Mock Token", async () => {
    console.log("\n")
    const mockAmount = "10000";
    const crssAmount = "100000";
    console.log(`\tApprove Crss Token to Router for Add liquidity`)
    await tokenApprove(crss, deployer, "Deployer", maker.address, "Router", crssAmount)
    console.log(`\tApprove Mock Token to Router for Add liquidity`)
    await tokenApprove(mock, deployer, "Deployer", maker.address, "Router", mockAmount)
  });

  it("Crss-MCK Add Liquidity", async () => {
    console.log("\n")
    const crssAmount = "500"
    const mockAmount = "500"
    console.log(`\tExecute Add Liquidity with ${crssAmount} Crss Token and ${mockAmount} Mock Token`)
    await addLiquidityFirst(crss, mock, crssAmount, mockAmount, 0, 0, deployer.address);
    console.log("\tLP Balance calculated outside must be the same as the real balance got from contract")
  });

  it("Crss-BNB LP Balance should be 10000", async () => {
    console.log("\n")
    const crssAmount = "1000"
    const ethAmount = "100"
    console.log(`\tExecute Add LiquidityEther with ${crssAmount} Crss Token and ${ethAmount} BNB`)
    await addLiquidityEtherFirst(crss, crssAmount, ethAmount, 0, 0, deployer.address);
    console.log("\tLP Balance calculated outside must be the same as the real balance got from contract")
  });

  it("Swap Crss for BNB is reverted", async () => {
    console.log("\n")
    const amount = "100";
    const revertStr = "Excessive deviation from previous price"
    console.log(`\tThis is for price check, if price change in the pool exceeds limit, it will be reverted with string "${revertStr}"`)
    await swapExactTokensForETHRevert(crss, amount, 0, deployer.address, revertStr)
  });

  it("Swap Crss for BNB", async () => {
    console.log("\n")
    const block = await ethers.provider.getBlock("latest");
    await crss.approve(taker.address, utils.parseEther("100"));
    swapAmount = 0.01;
    console.log("\tSwap Crss to BNB")
    await taker.swapExactTokensForETH(
      utils.parseEther(swapAmount.toString()),
      0,
      [crss.address, wbnb.address],
      deployer.address,
      block.timestamp + 1000
    )
  });

  it(`DevTo Balance should be 0.04% of Swap Amount`, async () => {
    console.log("\n")
    const devFeeExpect = swapAmount / magnifier * 40;
    console.log(`\tDevTo Address should have ${devFeeExpect} amount of Crss token`)
    await balanceCheck(crss, devTo, utils.parseEther(devFeeExpect.toString()))
  });

  it(`BuyBackTo Balance should be 0.03% of Swap Amount`, async () => {
    console.log("\n")
    const buybackFeeExpect = swapAmount / magnifier * 30;
    console.log(`\tBuyback Address should have ${buybackFeeExpect} amount of Crss token`)
    await balanceCheck(crss, buybackTo, utils.parseEther(buybackFeeExpect.toString()))
  });

  it(`Liquify Balance should be 0.03% of Swap Amount`, async () => {
    console.log("\n")
    const liquifyFeeExpect = swapAmount / magnifier * 30;
    console.log(`\tLiquify Address should have ${liquifyFeeExpect} amount of Crss token`)
    await balanceCheck(crss, liquidity, utils.parseEther(liquifyFeeExpect.toString()))
  });

  it("Remove liquidity Reverted", async () => {
    console.log("\n")
    const bal = await crss_ethPair.balanceOf(deployer.address)
    const revertStr = 'Excessive deviation from previous liquidity'
    console.log(`\tRemove 1/100 of the LP - ${utils.formatEther(bal.div(100))} in the pool, but it will fail because of exceed liquidity change limit`)
    await removeLiquidityRevert(crss_ethPair, crss, bal.div(100), 0, 0, deployer.address, revertStr)
  })

  it("Remove liquidity", async () => {
    console.log("\n")
    const block = await ethers.provider.getBlock("latest");
    const bal = await crss_ethPair.balanceOf(deployer.address)
    await crss_ethPair.approve(maker.address, bal)
    console.log(`\tRemove 1/10000 of the LP - ${utils.formatEther(bal.div(10000))} in the pool, it will succeed`)
    await maker.removeLiquidityETH(crss.address, bal.div(10000), 0, 0, deployer.address, block.timestamp + 1000)
  })
});

async function delay() {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve("OK");
    }, 5000);
  });
}

const ONE = ethers.BigNumber.from(1);
const TWO = ethers.BigNumber.from(2);

function sqrt(value) {
  x = value;
  let z = x.add(ONE).div(TWO);
  let y = x;
  while (z.sub(y).isNegative()) {
    y = z;
    z = x.div(z).add(z).div(TWO);
  }
  return y;
}
