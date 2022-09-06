const { ethers, waffle, network, upgrades } = require("hardhat");
const { expect, util } = require("chai");
const { utils, BigNumber } = require("ethers");
require("colors");

const crssPerBlock = 1;
const crssPerRepayBlock = 0.35;

const CrossPairArtifacts = require("../artifacts/contracts/core/CrossPair.sol/CrossPair.json");
const ERC20Abi = require("../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json");

const {
  deployWireLibrary,
  deployCrss,
  deployWBNB,
  deployFactory,
  deployFarmLibrary,
  deployFarm,
  deployCenter,
  deployRouterLibrary,
  deployMaker,
  deployTaker,
  deployXCrss,
  deployReferral,
  deployMockToken,
  deployRCrss,
  deployRSyrup,
  deployRepay,
  verifyContract,
  verifyUpgradeable,
  getCreate2Address,
  sqrt,
} = require("./utils");
const { assert } = require("console");
const { yellow, cyan } = require("colors");
const { zeroAddress } = require("ethereumjs-util");
const { doesNotMatch } = require("assert");
const zero_address = "0x0000000000000000000000000000000000000000";

let wireLib, factory, wbnb, center, routerLib, maker, taker, crss, mock, mock2, farm, farmLib, xCrss, referral, rCrss, rSyrup, repay;
let crss_bnb, crss_mck, crss_mck2;
let owner, alice, bob, carol, dev, buyback, liquidity, treasury;
let tx;

const MINIMUM_LIQUIDITY = BigNumber.from(10).pow(3);
const TEST_ADDRESSES = ["0x1000000000000000000000000000000000000000", "0x2000000000000000000000000000000000000000"];
const FeeMagnifier = Number(1e5); // 
const DECIMALS = 18;
const INITIAL_SUPPLY = 1e6;

function weiToEthEn(wei) {
  return Number(utils.formatUnits(BigInt(wei).toString(), DECIMALS)).toLocaleString("en");
}

function weiToEth(wei) {
  return Number(utils.formatUnits(BigInt(wei).toString(), DECIMALS));
}

function ethToWei(eth) {
  return utils.parseUnits(eth.toString(), DECIMALS);
}

function mega(wei) {
  return Number(utils.formatUnits(BigInt(wei / 1e6).toString(), DECIMALS)).toString() + "M";
}

function uiAddr(address) {
  return "{0x" + address.substring(2, 6).concat("...") + "}";
}

function stringify(strValue) {
  return strValue.toString();
}

async function expectRevertedWith(tx, withMsg) {
  await expect(tx).to.be.revertedWith(withMsg);
}

async function expectNotReverted(tx) {
  await expect(tx).to.be.not.reverted;
}

async function expectReverted(tx) {
  await expect(tx).to.be.reverted;
}

async function getTokenTotalSupply(token) {
  return await token.totalSupply();
}

async function getTokenBalanceOfAddress(token, addr) {
  return await token.balanceOf(addr);
}

function getTransferAmountWithOutFee(transferAmount) {
  return ethToWei(BigNumber.from(transferAmount)).mul(999).div(1000);
}

async function getLastestBlock() {
  return await ethers.provider.getBlock("latest");
}

async function tokenMint(token, to, amount) {
  let tx = token.mint(to, ethToWei(amount));
  await expectNotReverted(tx);
}

async function tokenApprove(token, approver, spender, amount) {
  let tx = token.connect(approver).approve(spender.address, ethToWei(amount));
  await expectNotReverted(tx);
}

async function tokenIncreaseAllowance(token, approver, spender, amount) {
  let tx = token.connect(approver).increaseAllowance(spender.address, ethToWei(amount));
  await expectNotReverted(tx);
}

async function tokenDecreaseAllowance(token, approver, spender, amount) {
  let tx = token.connect(approver).decreaseAllowance(spender.address, ethToWei(amount));
  await expectNotReverted(tx);
}

async function getTokenAllowance(token, approver, spender) {
  return await token.allowance(approver.address, spender.address);
}

async function eventTrigger(factory, tx, eventName, args) {
  await expect(tx)
    .to.emit(factory, eventName)
    .withArgs(...args);
}

function expectEqual(a, b) {
  expect(a).to.be.eq(b);
}

function expectNotEqual(a, b) {
  expect(a).to.be.not.eq(b);
}

function consoleLogWithTab(str) {
  console.log(`\t${str}`);
}

function addLiquidityETH(maker, token, amountTokenDesired, amountTokenMin, amountEthMin, to, deadline, ethValue) {
  return maker.addLiquidityETH(
    token.address,
    ethToWei(amountTokenDesired),
    ethToWei(amountTokenMin),
    ethToWei(amountEthMin),
    to.address,
    deadline,
    { value: ethToWei(ethValue) }
  );
}

function addLiquidity(maker, tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline) {
  return maker.addLiquidity(
    tokenA.address,
    tokenB.address,
    ethToWei(amountADesired),
    ethToWei(amountBDesired),
    ethToWei(amountAMin),
    ethToWei(amountBMin),
    to.address,
    deadline
  );
}

async function test_addLiquidity(tokenA, amountA, tokenB, amountB, caller, to, log) {
  let report = "";
  let pairToReturn;
  const symbolA = await tokenA.symbol();
  const symbolB = await tokenB.symbol();

  console.log("\t%s is going to add liquidity (%s %s, %s %s) to %s' account".yellow, caller.name, amountA, symbolA, amountB, symbolB, to.name);

  const isNewPair = (await factory.getPair(tokenA.address, tokenB.address)) == zero_address ? true : false;

  let liquidityBalance0, reserveA0, reserveB0;
  if (!isNewPair) {
    let pairAddr = await factory.getPair(tokenA.address, tokenB.address);
    let pair = new ethers.Contract(pairAddr, CrossPairArtifacts.abi, caller);
    liquidityBalance0 = await pair.balanceOf(to.address);
    [reserveA0, reserveB0] = await pair.getReserves();
    if (tokenA.address != (await pair.token0())) {
      let temp = reserveA0;
      reserveA0 = reserveB0;
      reserveB0 = temp;
    }
  } else {
    (liquidityBalance0 = 0), (reserveA0 = 0), (reserveB0 = 0);
  }
  let tokenABalance0 = await tokenA.balanceOf(caller.address);
  expect(tokenABalance0).to.be.gt(utils.parseEther(amountA.toString()));
  console.log(
    `\tCaller %s's balance %s %s is greater than %s %s`,
    caller.name, weiToEthEn(tokenABalance0), symbolA, amountA, symbolA);
  let tokenBBalance0;
  if (tokenB == wbnb) {
    // Ether
    tokenBBalance0 = await ethers.provider.getBalance(caller.address);
  } else {
    tokenBBalance0 = await tokenB.balanceOf(caller.address);
  }
  expect(tokenBBalance0).to.be.gt(utils.parseEther(amountB.toString()));
  console.log(`\tCaller %s's balance %s %s is greater than %s %s`,
    caller.name, weiToEthEn(tokenBBalance0), symbolB, amountB, symbolB);
  tokenA = tokenA.connect(caller);
  await tokenA.approve(maker.address, utils.parseEther((amountA * 1.001).toString()));
  allowance = (await tokenA.allowance(caller.address, maker.address)).toString();
  expectEqual(allowance, utils.parseEther((amountA * 1.001).toString()));
  console.log(
    "\tCaller %s approved Maker %s to spend %s %s.",
    caller.name, uiAddr(maker.address), (amountA * 1.001), symbolA);
  if (tokenB != wbnb) {
    tokenB = tokenB.connect(caller);
    await tokenB.approve(maker.address, utils.parseEther((amountB * 1.001).toString()));
    allowance = (await tokenB.allowance(caller.address, maker.address)).toString();
    expectEqual(allowance, utils.parseEther((amountB * 1.001).toString()));
    console.log(
      "\tCaller %s approved Maker %s to spend %s %s.",
      caller.name, uiAddr(maker.address), (amountB * 1.001), symbolB);
  }
  // Get last block.
  let block = await ethers.provider.getBlock("latest");
  let bytecode = CrossPairArtifacts.bytecode;
  let lengthPairs = await factory.allPairsLength();
  let create2Address = getCreate2Address(factory.address, [tokenA.address, tokenB.address], bytecode);
  maker = maker.connect(caller);
  console.log("\t%s is calling addLiquidity to add (%s %s, %s %s) ...".green,
    caller.name, amountA, symbolA, amountB, symbolB);
  if (tokenB == wbnb) {
    tx = await maker.addLiquidityETH(
      tokenA.address, utils.parseEther(amountA.toString()),
      0, 0, to.address, block.timestamp + 1000, { value: utils.parseEther(amountB.toString()) }
    );
  } else {
    tx = await maker.addLiquidity(
      tokenA.address, tokenB.address, utils.parseEther(amountA.toString()),
      utils.parseEther(amountB.toString()), 0, 0, to.address, block.timestamp + 1000
    );
  }

  tx.wait();

  let token0, token1;
  [token0, token1] = tokenA.address < tokenB.address ? [tokenA.address, tokenB.address] : [tokenB.address, tokenA.address];

  if (isNewPair) {
    await expect(tx)
      .to.emit(factory, "PairCreated")
    //.withArgs(token0, token1, create2Address);
  }
  console.log("\taddLiquidity successful.");

  let tokenABalance1;
  if (tokenA == wbnb) {
    // Ether
    tokenABalance1 = await ethers.provider.getBalance(caller.address);
  } else {
    tokenABalance1 = await tokenA.balanceOf(caller.address);
  }

  let delta = Number(tokenABalance0) - Number(tokenABalance1);
  let tokenBBalance1;
  if (tokenB == wbnb) {
    // Ether
    tokenBBalance1 = await ethers.provider.getBalance(caller.address);
  } else {
    tokenBBalance1 = await tokenB.balanceOf(caller.address);
  }
  let liquidityBalance1, reserveA1, reserveB1;

  let pairAddr = await factory.getPair(tokenA.address, tokenB.address);
  pairToReturn = new ethers.Contract(pairAddr, CrossPairArtifacts.abi, caller);

  liquidityBalance1 = await pairToReturn.balanceOf(to.address);
  [reserveA1, reserveB1] = await pairToReturn.getReserves();
  if (tokenA.address != (await pairToReturn.token0())) {
    let temp = reserveA1;
    reserveA1 = reserveB1;
    reserveB1 = temp;
  }
  console.log(`\tPair %s gained %s %s`, uiAddr(pairAddr), weiToEthEn(reserveA1.sub(reserveA0)), symbolA);
  console.log(`\tPair %s gained %s %s`, uiAddr(pairAddr), weiToEthEn(reserveB1.sub(reserveB0)), symbolB);
  console.log(
    `\t%s gained %s SQRT(%s x %s)`,
    to.name,
    weiToEthEn(liquidityBalance1.sub(liquidityBalance0)),
    symbolA,
    symbolB
  );
  await expect(tx).to.emit(pairToReturn, "Mint");
  //.withArgs(caller.address, (reserveA1 - reserveA0), (reserveB1 - reserveB0));
  report = "Successful";
  return [pairToReturn, report];
}

async function test_removeLiquidity(tokenA, tokenB, liquidity, caller, to, log) {
  let report = "";
  const symbolA = await tokenA.symbol();
  const symbolB = await tokenB.symbol();

  console.log("\t%s is going to remove liquidity %s SQRT(%s x %s) to %s' account".yellow, caller.name, liquidity, symbolA, symbolB, to.name);

  const isNewPair = (await factory.getPair(tokenA.address, tokenB.address)) == zero_address ? true : false;
  let liquidityBalance0, reserveA0, reserveB0;
  if (!isNewPair) {
    let pairAddr = await factory.getPair(tokenA.address, tokenB.address);
    let pair = new ethers.Contract(pairAddr, CrossPairArtifacts.abi, caller);
    liquidityBalance0 = await pair.balanceOf(caller.address);
    [reserveA0, reserveB0] = await pair.getReserves();
    if (tokenA.address != (await pair.token0())) {
      let temp = reserveA0;
      reserveA0 = reserveB0;
      reserveB0 = temp;
    }
  }
  if (isNewPair) {
    console.log(`\tYou cannot remove liquidity from a non-existing pair.`);
  } else {
    let pairAddr = await factory.getPair(tokenA.address, tokenB.address);
    let pair = new ethers.Contract(pairAddr, CrossPairArtifacts.abi, caller);
    await pair.approve(maker.address, utils.parseEther(liquidity.toString()));
    // Get last block.
    let block = await ethers.provider.getBlock("latest");
    let bytecode = CrossPairArtifacts.bytecode;
    maker = maker.connect(caller);
    console.log("\t%s is calling removeLiquidityETH to subtract %s SQRT(%s x %s) ...".green,
      caller.name, liquidity, symbolA, symbolB);
    if (tokenB == wbnb) {
      tx = await maker.removeLiquidityETH(
        tokenA.address,
        utils.parseEther(liquidity.toString()),
        0,
        0,
        to.address,
        block.timestamp + 1000
      );
    } else {
      tx = await maker.removeLiquidity(
        tokenA.address,
        tokenB.address,
        utils.parseEther(liquidity.toString()),
        0,
        0,
        to.address,
        block.timestamp + 1000
      );
    }
    tx.wait();

    let liquidityBalance1, reserveA1, reserveB1;
    liquidityBalance1 = await pair.balanceOf(caller.address);
    [reserveA1, reserveB1] = await pair.getReserves();
    if (tokenA.address != (await pair.token0())) {
      let temp = reserveA1;
      reserveA1 = reserveB1;
      reserveB1 = temp;
    }
    console.log(`\tPair %s lost %s %s`, uiAddr(pairAddr), weiToEthEn(reserveA0 - reserveA1), symbolA);
    console.log(`\tPair %s lost %s %s`, uiAddr(pairAddr), weiToEthEn(reserveB0 - reserveB1), symbolB);
    console.log(
      `\t%s lost %s SQRT(%s x %s)`,
      caller.name,
      weiToEthEn(liquidityBalance0 - liquidityBalance1),
      symbolA,
      symbolB
    );
  }
  report = "Successful";
  return report;
}

const NodeTypes = ["Token", "Center", "Maker", "Taker", "Farm", "Factory", "XToken", "Repay"]; // DO not change the order.

async function test_swap(tokenA, amountA, tokenB, amountB, caller, to, log) {
  let report = "", computedAmount;
  const symbolA = await tokenA.symbol();
  const symbolB = await tokenB.symbol();

  if (amountA != undefined) {
    console.log("\t%s is going to swap %s %s for undefined %s, with the beneficiary being %s".yellow, caller.name, amountA, symbolA, symbolB, to.name);
  } else if (amountB != undefined) {
    console.log("\t%s is going to swap undefined %s for %s %s , with the beneficiary being %s".yellow, caller.name, symbolA, amountB, symbolB, to.name);
  } else {
    console.log("\t%s is going to swap, with wrong parameters".yellow);
  }

  let totalLiquidity0, reserveA0, reserveB0;
  const isNewPair = (await factory.getPair(tokenA.address, tokenB.address)) == zero_address ? true : false;
  if (!isNewPair) {
    let pairAddr = await factory.getPair(tokenA.address, tokenB.address);
    let pair = new ethers.Contract(pairAddr, CrossPairArtifacts.abi, caller);
    totalLiquidity0 = await pair.totalSupply();
    [reserveA0, reserveB0] = await pair.getReserves();
    if (tokenA.address != (await pair.token0())) {
      let temp = reserveA0;
      reserveA0 = reserveB0;
      reserveB0 = temp;
    }
  }
  if (isNewPair) {
    console.log(`\tYou cannot swap on a non-existing pair.`);
  } else {
    let pairAddr = await factory.getPair(tokenA.address, tokenB.address);
    let pair = new ethers.Contract(pairAddr, CrossPairArtifacts.abi, caller);
    // Get last block.
    let block = await ethers.provider.getBlock("latest");

    taker = taker.connect(caller);
    if (tokenA == wbnb) {
      assert(tokenB != wbnb);

      if (amountA != undefined) {
        assert(amountB == undefined);
        await taker.swapExactETHForTokens(0, [tokenA.address, tokenB.address], to.address, block.timestamp + 100, { value: utils.parseEther(amountA.toString()) });
      } else {
        assert(amountB != undefined);
        let balanceEth = await ethers.provider.getBalance(caller.address);
        await taker.swapETHForExactTokens(utils.parseEther(amountB.toString()), [tokenA.address, tokenB.address], to.address, block.timestamp + 100, { value: utils.parseEther(balanceEth.toString()) });
      }

    } else {
      tokenA = tokenA.connect(caller);

      if (tokenB == wbnb) {
        if (amountA != undefined) {
          assert(amountB == undefined);
          await tokenA.approve(taker.address, utils.parseEther(amountA.toString()));
          await taker.swapExactTokensForETH(utils.parseEther(amountA.toString()), 0, [tokenA.address, tokenB.address], to.address, block.timestamp + 100);
        } else {
          assert(amountB != undefined);
          await tokenA.approve(taker.address, utils.parseEther((2 ** 256 - 1).toString()));
          await taker.swapTokensForExactETH(utils.parseEther(amountB.toString()), BigInt(2 ** 256 - 1), [tokenA.address, tokenB.address], to.address, block.timestamp + 100);
          await tokenA.approve(taker.address, utils.parseEther((0).toString()));
        }

      } else {
        if (amountA != undefined) {
          assert(amountB == undefined);
          await tokenA.approve(taker.address, utils.parseEther(amountA.toString()));
          await taker.swapExactTokensForTokens(utils.parseEther(amountA.toString()), 0, [tokenA.address, tokenB.address], to.address, block.timestamp + 100);
        } else {
          assert(amountB != undefined);
          await tokenA.approve(taker.address, utils.parseEther((2 ** 256 - 1).toString()));
          await taker.swapTokensForExactTokens(utils.parseEther(amountB.toString()), BigInt(2 ** 256 - 1), [tokenA.address, tokenB.address], to.address, block.timestamp + 100);
          await tokenA.approve(taker.address, utils.parseEther((0).toString()));
        }
      }
    }

    let totalLiquidity1, reserveA1, reserveB1;
    totalLiquidity1 = await pair.totalSupply();
    [reserveA1, reserveB1] = await pair.getReserves();
    if (tokenA.address != (await pair.token0())) {
      let temp = reserveA1;
      reserveA1 = reserveB1;
      reserveB1 = temp;
    }
    console.log(`\tPair %s gained %s %s from %s`, uiAddr(pairAddr), weiToEthEn(reserveA1 - reserveA0), symbolA, caller.name);
    console.log(`\tPair %s lost %s %s to %s`, uiAddr(pairAddr), weiToEthEn(reserveB0 - reserveB1), symbolB, to.name);

    // Check caller's and to.address's balance changes.

    if (totalLiquidity0 <= totalLiquidity1) {
      console.log(`\tPair %s gained %s SQRT(%s x %s)`, uiAddr(pairAddr), weiToEthEn(totalLiquidity1 - totalLiquidity0), symbolA, symbolB);
    } else {
      console.log(`\tPair %s lost %s SQRT(%s x %s)`, uiAddr(pairAddr), weiToEthEn(totalLiquidity0 - totalLiquidity1), symbolA, symbolB);
    }

    if (amountA == undefined) {
      computedAmount = weiToEth(reserveA1 - reserveA0); // Note this conversion degrades precision significantly.
    } else if (amountB == undefined) {
      computedAmount = weiToEth(reserveB0 - reserveB1); // Note this conversion degrades precision significantly.
    } else {
      computedAmount = weiToEth(0); // not sure.
    }
  }

  report = "Successful";
  return [report, computedAmount];
}


const ListStatus = ["None", "Cleared", "Enlisted", "Delisted"]; // DO NOT change the order.

async function setupNodeChain() {
  //======================= Wire ==========================
  console.log("\n\tWiring contracts...".green);

  tx = crss.connect(alice).wire(repay.address, maker.address); //-------------------- expectReverted
  expectReverted(tx);
  console.log("\tAlice couldn't wire nodes", xCrss.address, maker.address);

  tx = crss.connect(owner).wire(repay.address, center.address);
  (await tx).wait();
  console.log("\tCrss token was wired: repay - O - center", repay.address, center.address);

  tx = center.connect(owner).wire(crss.address, maker.address);
  (await tx).wait();
  console.log("\tControlCenter was wired: crss - O - maker", crss.address, maker.address);

  tx = maker.connect(owner).wire(center.address, taker.address);
  (await tx).wait();
  console.log("\tmaker was wired: center - O - taker", crss.address, taker.address);

  tx = taker.connect(owner).wire(maker.address, farm.address);
  (await tx).wait();
  console.log("\ttaker was wired: maker - O - farm", maker.address, farm.address);

  tx = farm.connect(owner).wire(taker.address, factory.address);
  (await tx).wait();
  console.log("\tfarm was wired: taker - O - factory", taker.address, factory.address);

  tx = factory.connect(owner).wire(farm.address, xCrss.address);
  (await tx).wait();
  console.log("\tfactory was wired: farm - O - xCrss", farm.address, xCrss.address);

  tx = xCrss.connect(owner).wire(factory.address, repay.address);
  (await tx).wait();
  console.log("\txCrss was wired: factory - O - repay", factory.address, repay.address);

  tx = repay.connect(owner).wire(xCrss.address, crss.address);
  (await tx).wait();
  console.log("\trepay was wired: xCrss - O - crss", xCrss.address, crss.address);


  //======================= Setting contracts ==========================
  console.log("\n\tSetting contracts...".green);

  tx = crss.connect(owner).setNode(NodeTypes.indexOf("Token"), crss.address, zero_address);
  (await tx).wait();
  console.log("\txCrss was set to the node chain");

  tx = crss.connect(alice).setNode(NodeTypes.indexOf("Token"), crss.address, zero_address); //-------------------- expectReverted
  expectReverted(tx);
  console.log("\tAlice couldn't set a node");

  tx = crss.connect(owner).setNode(NodeTypes.indexOf("Center"), center.address, zero_address);
  (await tx).wait();
  console.log("\tCenter was set to the node chain");

  tx = crss.connect(owner).setNode(NodeTypes.indexOf("Maker"), maker.address, zero_address);
  (await tx).wait();
  console.log("\tMaker was set to the node chain");

  tx = crss.connect(owner).setNode(NodeTypes.indexOf("Taker"), taker.address, zero_address);
  (await tx).wait();
  console.log("\tTaker was set to the node chain");

  tx = crss.connect(owner).setNode(NodeTypes.indexOf("Farm"), farm.address, zero_address);
  (await tx).wait();
  console.log("\tFarm was set to the node chain");

  tx = crss.connect(owner).setNode(NodeTypes.indexOf("Factory"), factory.address, zero_address);
  (await tx).wait();
  console.log("\tFactory was set to the node chain");

  tx = crss.connect(owner).setNode(NodeTypes.indexOf("XToken"), xCrss.address, zero_address);
  (await tx).wait();
  console.log("\txToken was fed to the node chain");

  tx = crss.connect(owner).setNode(NodeTypes.indexOf("Repay"), repay.address, zero_address);
  (await tx).wait();
  console.log("\trepay was fed to the node chain");

  //======================= List tokens =============================

  tx = factory.connect(bob).changeTokenStatus(wbnb.address, ListStatus.indexOf("Enlisted"));
  expectReverted(tx);
  console.log("\tBob couldn't list a token");

  tx = factory.connect(owner).changeTokenStatus(wbnb.address, ListStatus.indexOf("Enlisted"));
  (await tx).wait();
  console.log("\twbnb was listed");

  tx = factory.connect(owner).changeTokenStatus(crss.address, ListStatus.indexOf("Enlisted"));
  (await tx).wait();
  console.log("\tcrss was listed");

  tx = factory.connect(owner).changeTokenStatus(mock.address, ListStatus.indexOf("Enlisted"));
  (await tx).wait();
  console.log("\tmock was listed");

  tx = factory.connect(owner).changeTokenStatus(mock2.address, ListStatus.indexOf("Enlisted"));
  (await tx).wait();
  console.log("\tmock2 was listed");

  //======================= Configure fees ==========================
  console.log("\n\tConfiguring fees...".green);

  const developer = "0x5cA00f843cd9649C41fC5B71c2814d927D69Df95"; // Set it a wallet address.
  const buyback = "0x03002f489a8D7fb645B7D5273C27f2262E38b3a1"; // Set it a wallet address.
  const liquidity = "0x10936b9eBBB82EbfCEc8aE28BAcC557c0A898E43"; // Set it a wallet address.
  const treasury = "0x5cA00f843cd9649C41fC5B71c2814d927D69Df95"; // Set it a wallet address.

  const feeStores = [developer, buyback, liquidity, treasury];
  tx = crss.connect(owner).setFeeStores(feeStores, zero_address);
  (await tx).wait();
  console.log("\tFeeStores were fed to the node chain");

  tx = crss.connect(alice).setFeeStores(feeStores, zero_address); //-------------------- expectReverted
  expectReverted(tx);
  console.log("\tAlice couldn't feed FeeStores to the node chain");

  const FeeRates = [
    //(Developer, Buyback, Liquidity, Treasury). Order is critical.
    [FeeMagnifier, 0, 0, 0], // None. (A tool to let them pay 100% fee if they are suspicious.)
    [40, 30, 30, 0], // Transfer: 0.04%, 0.03%, 0.03%
    [40, 30, 30, 30], // Swap:
    [40, 30, 30, 0], // AddLiquidity
    [40, 30, 30, 0], // RemoveLiquidity
    [40, 30, 30, 0], // Deposit
    [40, 30, 30, 0], // Withdraw
    [40, 30, 30, 0], // CompoundAccumulated
    [40, 30, 30, 0], // VestAccumulated
    [40, 30, 30, 0], // HarvestAccumulated
    [40, 30, 30, 0], // StakeAccumulated
    [40, 30, 30, 0], // MassHarvestRewards
    [40, 30, 30, 0], // MassStakeRewards
    [40, 30, 30, 0], // MassCompoundRewards
    [40, 30, 30, 0], // WithdrawVest
    [40, 30, 30, 0], // UpdatePool
    [40, 30, 30, 0], // EmergencyWithdraw
    [0, 0, 0, 0],  // SwitchCollectOption
    [0, 0, 0, 0]  // HarvestRepay
  ];

  tx = crss.connect(alice).setFeeRates(0, FeeRates[0], zero_address);
  expectReverted(tx);
  console.log("\tAlice couldn't feed setFeeRates to the node chain");

  for (let st = 0; st < FeeRates.length; st++) {
    console.log(FeeRates[st]);
    tx = crss.connect(owner).setFeeRates(st, FeeRates[st], zero_address);
    (await tx).wait();
  }
  console.log("\tFeeRates were fed to the node chain");

  const stakeholders = "0x23C6D84c09523032B08F9124A349760721aF64f6"; // Set it a wallet address.
  tx = farm.connect(owner).setFeeParams(
    treasury,
    stakeholders,
    referral.address, // crssReferral
    100, // 0.1%, referralCommissionRate
    25000, // 25.0%, nonVestBurnRate
    5000 // 5%, compoundFeeRate
  );

  (await tx).wait();
  console.log("\tFarmFeeParams were set");

  const backendCaller = carol.address; // Set it a wallet address.
  tx = farm.connect(owner).setBackendCaller(backendCaller);
  (await tx).wait();
  console.log("\tBackend caller was set");

}

describe("====================== Preface ======================\n".yellow, async function () {
  it("\n".green, async function () {
    console.log("\tA test script is to run on Crosswise contracts, with auto-generated test reports coming below.".yellow);
    console.log("\tThe contracts will be deployed and running on a local HardHat test chain, for logical test only.".green);
    console.log("\tThe versions of the contracts and test script is as of % ".green, new Date().toLocaleString());
    console.log("\tContracts link: \n\t%s".green,
      "https://github.com/crosswise-finance/crosswise-contracts-post-audit/tree/master/contracts");
    console.log("\tTest script link: \n\t%s".green,
      "https://github.com/crosswise-finance/crosswise-contracts-post-audit/blob/master/test-dex/comprehensive%202.js");
  });
});

describe("====================== Stage 1: Deploy contracts ======================\n".yellow, async function () {
  it("Main contracts are deployed.\n".green, async function () {
    [owner, alice, bob, carol, dev, buyback, liquidity, treasury] = await ethers.getSigners();
    owner.name = "Owner"; alice.name = "Alice"; bob.name = "Bob"; carol.name = "Carol"; liquidity.name = "Liquidity"; treasury.name = "Treasury";

    console.log("\tOwner address: ".cyan, owner.address);
    console.log("\tAlice address: ".cyan, alice.address);
    console.log("\tBob address: ".cyan, bob.address);
    console.log("\tCarol address: ".cyan, carol.address);

    //========================== Deploy ============================
    console.log("\n\tDeploying contracts...".green);


    // WireLibrary Deployment for Farm, Crss, Maker, and Taker.
    wireLib = await deployWireLibrary(owner);
    consoleLogWithTab(`WireLibrary deployed at: ${wireLib.address}`);

    // Factory Deployment.
    factory = await deployFactory(owner, wireLib.address);
    consoleLogWithTab(`Factory deployed at: ${factory.address}`);

    console.log("\tCrossFactory contract was deployed at: ", factory.address);
    console.log("\t!!! Pair's bytecode hash = \n\t", (await factory.INIT_CODE_PAIR_HASH()).substring(2));
    console.log("\t!!! Please make sure the pairFor(...) function of CrossLibrary.sol file has the same hash.");

    // WBNB Deployment.
    wbnb = await deployWBNB(owner);
    consoleLogWithTab(`WBNB deployed at: ${wbnb.address}`);

    center = await deployCenter(owner, wireLib.address);
    center.address = center.address;
    consoleLogWithTab(`ContralCenter deployed at: ${center.address}`);

    // RouterLibrary Deployment for Maker and Taker.
    routerLib = await deployRouterLibrary(owner);
    consoleLogWithTab(`RouterLibrary deployed at: ${routerLib.address}`);

    // Maker Deployment.
    maker = await deployMaker(owner, wbnb.address, wireLib.address, routerLib.address);
    consoleLogWithTab(`Maker deployed at: ${maker.address}`);

    // Taker Deployment.
    taker = await deployTaker(owner, wbnb.address, wireLib.address, routerLib.address);
    consoleLogWithTab(`Taker deployed at: ${taker.address}`);

    // CRSS Deployment.
    crss = await deployCrss(owner, wireLib.address);
    consoleLogWithTab(`CRSS Token deployed at: ${crss.address}`);

    // Referral Deployment.
    referral = await deployReferral(owner);
    consoleLogWithTab(`Referral deployed at: ${referral.address}`);

    // FarmLibrary Deployment for Farm.
    farmLib = await deployFarmLibrary(owner);
    consoleLogWithTab(`FarmLibrary deployed at: ${farmLib.address}`);

    // Farm Deployment.
    const startBlock = (await ethers.provider.getBlock("latest")).number + 10;
    farm = await deployFarm(owner, crss.address, ethToWei(crssPerBlock), startBlock, wireLib.address, farmLib.address);
    consoleLogWithTab(`Farm deployed at: ${farm.address}`);

    // XCRSS Deployment.
    xCrss = await deployXCrss(owner, "Crosswise xCrss Token", "xCRSS", wireLib.address);
    consoleLogWithTab(`XCRSS deployed at: ${xCrss.address}`);

    // Mock Token Deployment.
    mock = await deployMockToken(owner, "Mock", "MCK");
    consoleLogWithTab(`mock deployed at: ${mock.address}`);

    // Mock Token Deployment.
    mock2 = await deployMockToken(owner, "Mock2", "MCK2");
    consoleLogWithTab(`mock2 deployed at: ${mock2.address}`);

    //-------------------- compensation contracts -----------

    // rCrss Deployment.
    rCrss = await deployRCrss(owner);
    consoleLogWithTab(`rCrss deployed at: ${rCrss.address}`);

    // rCrss Deployment.
    rSyrup = await deployRSyrup(owner, crss.address);
    rSyrup.address = rSyrup.address;
    consoleLogWithTab(`rSyrup deployed at: ${rSyrup.address}`);

    // repay Deployment.
    const startRepayBlock = (await ethers.provider.getBlock("latest")).number;
    repay = await deployRepay(owner, crss.address, rCrss.address, rSyrup.address, ethToWei(crssPerRepayBlock), startRepayBlock, wireLib.address);
    consoleLogWithTab(`repay deployed at: ${repay.address}`);

    tx = rSyrup.connect(owner).transferOwnership(repay.address); // Permanent. Irrevocable.
    (await tx).wait();
    console.log("\trepay became the owner of rSyrupBar");

    tx = rCrss.connect(owner).changeRepay(repay.address);
    (await tx).wait();
    console.log("\trCrss is equipped with repay's address");

    await center.setLiquidityChangeLimit(5000); // set it 5%.
    await center.setPriceChangeLimit(5000); // set it 5%

    await setupNodeChain(); // ========================================

    await crss.begin(zero_address);

  });

});


async function showUserInfoRepay(_user) {

  let deposit, pendingCrss, lpBalance, crssBalance;
  [deposit, pendingCrss, lpBalance, crssBalance]
    = await repay.getUserState(_user.address);

  console.log(`\t= %s, depo: %s, pending Crss: %s, rCrss: %s, Crss balance: %s`,
    _user.name, deposit, pendingCrss, lpBalance, crssBalance);

  return { deposit: deposit, pending: pendingCrss, rCrss: lpBalance, crss: crssBalance };
}

async function harvestRepay(caller, amount) {

  console.log("\t%s is going to withdraw %s %s from repay pool".yellow, caller.name, amount, "Crss");
  //await showPoolInfoRepay();

  let pending0, crss0, pending1, crss1, deposit0, deposit1;
  ret = await showUserInfoRepay(caller);
  pending0 = ret.pending; crss0 = ret.crss; deposit0 = ret.deposit;

  // Tolerable now.
  // if (amount > weiToEth(deposit0) ) {
  //   amount = weiToEth(deposit0) * 0.99;
  //   console.log("\tAmount to withdraw is reduced to %s %s".green, amount, symbol);
  // }

  console.log(`\tWithdrawing now... taking pending rewards first.`.green);
  (await repay.connect(caller).harvestRepay(ethToWei(amount))).wait();

  //await showPoolInfo(pid);
  ret = await showUserInfoRepay(caller);
  pending1 = ret.pending; crss1 = ret.crss; deposit1 = ret.deposit;

  console.log(`\t%s's Repay deposit decreased %s %s`.cyan, caller.name, deposit0 - deposit1, "REPAY");
  console.log(`\t%s's Crss pending decreased %s %s`.cyan, caller.name, pending0 - pending1, "Crss");
  console.log(`\t%s's Crss balance increased %s %s`.cyan, caller.name, crss1 - crss0, "Crss");
  console.log(`\tA few more blocks minted may lead to an a little more deposit decrease.`.cyan);
  console.log(`\tNote of the transaction fee.`.cyan);
}

describe("====================== Stage 2: Test CrossFactory ======================\n".yellow, async function () {
  it("Initial values were checked.\n".green, async function () {
    let feeTo = await factory.feeTo();
    expectEqual(feeTo, zero_address);
    consoleLogWithTab("Initial feeTo value is zero address.");

    let pairsLength = await factory.allPairsLength();
    expectEqual(pairsLength, 0);
    consoleLogWithTab("There, initially, are no pairs created.");

    let factoryOwner = await factory.getOwner();
    consoleLogWithTab("Owner is deployer.");
    expectEqual(factoryOwner, owner.address);
    consoleLogWithTab(`Owner address is ${factoryOwner}.`);
  });

  it("setFeeTo function was checked.\n".green, async function () {
    let tx = factory.connect(alice).setFeeTo(bob.address);
    await expectRevertedWith(tx, "Caller != owner");
    consoleLogWithTab("Alice, a non-owner, setting feeTo to Bob reverted with <Caller != owner>");

    tx = factory.setFeeTo(owner.address);
    await expectNotReverted(tx);
    consoleLogWithTab("The current owner could set feeTo to Bob.");

  });

  // it("createPair function was checked.\n".green, async function () {
  //   const tokens = TEST_ADDRESSES;
  //   const bytecode = CrossPairArtifacts.bytecode;
  //   const create2Address = getCreate2Address(factory.address, tokens, bytecode);

  //   tx = factory.createPair(tokens[0], tokens[0]);
  //   await expectRevertedWith(tx, "Identical tokens");
  //   consoleLogWithTab("Creating pair with the same two tokens reverted with <Identical tokens>.");

  //   let pairsLength = await factory.allPairsLength(); // Calculate pairs length before create new pair.
  //   tx = factory.createPair(...tokens);
  //   (await tx).wait(); //expectNotReverted(tx);
  //   consoleLogWithTab("Create pair from different two token addresses succeeded.");

  //   let args = [tokens[0], tokens[1], create2Address, BigNumber.from(pairsLength + 1)];
  //   await eventTrigger(factory, tx, "PairCreated", args);
  //   consoleLogWithTab("And it emitted a <PairCreated> event.");

  //   // Check address of newly created pair.
  //   let newPairAddr = await factory.getPair(tokens[0], tokens[1]);
  //   consoleLogWithTab(`Newly created pair's address: ${newPairAddr}.`);

  //   pairsLength = await factory.allPairsLength();
  //   consoleLogWithTab(`Pairs length: ${pairsLength}.`);

  //   consoleLogWithTab("Check new pair's factory value.");
  //   const pair = await ethers.getContractAt(CrossPairArtifacts.abi, create2Address, owner);
  //   const pairFactory = await pair.factory();
  //   expectEqual(pairFactory, factory.address);
  //   consoleLogWithTab("The pair returned the address of the factory that created the pair.");

  //   let tokenA = await pair.token0();
  //   let tokenB = await pair.token1();
  //   let token0 = tokens[0] > tokens[1] ? tokens[1] : tokens[0];
  //   let token1 = tokens[0] > tokens[1] ? tokens[0] : tokens[1];
  //   expectEqual(tokenA, token0);
  //   expectEqual(tokenB, token1);
  //   consoleLogWithTab("The pair returned the token addresses that the pair was created with.");

  //   tx = factory.createPair(...tokens);
  //   await expectRevertedWith(tx, "Existing pair");
  //   consoleLogWithTab("Creating a pair again with the used tokens reverted with <Existing pair>.");

  //   tx = factory.createPair(ethers.constants.AddressZero, tokens[0]);
  //   await expectRevertedWith(tx, "Zero address token");
  //   consoleLogWithTab("Creating a new pair with a zero address of token reverted with <Zero address token>.");
  // });
});

describe("====================== Stage 3: Test Dex functionalities. ======================\n".yellow,
  async function () {
    it("Crss token name, symbol and decimals were checked.\n".green, async function () {
      const name = await crss.name();
      consoleLogWithTab(`CRSS token's name: ${name}.`);
      expectEqual(name, "Crosswise Token");

      const symbol = await crss.symbol();
      consoleLogWithTab(`CRSS symbol: ${symbol}`);
      expectEqual(symbol, "CRSS");

      const decimals = await crss.decimals();
      consoleLogWithTab(`CRSS decimals: ${decimals}.`);
      expectEqual(decimals, 18);
    });

    it("Total supply and owner balance of CRSS are checked.\n".green, async function () {
      const totalSupply = await getTokenTotalSupply(crss);
      consoleLogWithTab(`CRSS total supply: ${weiToEthEn(totalSupply)}.`);
      expectEqual(weiToEth(totalSupply), INITIAL_SUPPLY);

      consoleLogWithTab(`Total supply amount was minted to owner.`);
      const ownerCrssBalance = await getTokenBalanceOfAddress(crss, owner.address);
      consoleLogWithTab(`CRSS owner balance: ${weiToEthEn(ownerCrssBalance)}.`);
      expectEqual(weiToEth(ownerCrssBalance), INITIAL_SUPPLY);
    });

    it("1e6 Mock(MCK) tokens were minted to owner.\n".green, async function () {
      let mockOwnerBalance = await getTokenBalanceOfAddress(mock, owner.address);
      consoleLogWithTab(`Owner's mock token balance: ${weiToEthEn(mockOwnerBalance)}.`);
      consoleLogWithTab(`Mint 1e6 MCK tokens to owner.`);
      await tokenMint(mock, owner.address, ethToWei(1e6));
      mockOwnerBalance = await getTokenBalanceOfAddress(mock, owner.address);
      consoleLogWithTab(`Owner's mock token balance after mint: ${weiToEthEn(mockOwnerBalance)}.`);
    });

    it("1e6 Mock2(MCK2) tokens were minted to owner.\n".green, async function () {
      let mockOwnerBalance = await getTokenBalanceOfAddress(mock2, owner.address);
      consoleLogWithTab(`Owner's mock2 token balance: ${weiToEthEn(mockOwnerBalance)}.`);
      consoleLogWithTab(`Mint 1e6 MCK2 tokens to owner.`);
      await tokenMint(mock2, owner.address, ethToWei(1e6));
      mockOwnerBalance = await getTokenBalanceOfAddress(mock2, owner.address);
      consoleLogWithTab(`Owner's mock2 token balance after mint: ${weiToEthEn(mockOwnerBalance)}.`);
    });

    it("Allowance control functions were checked.\n".green, async function () {
      consoleLogWithTab("Approve owner-alice to 1000 for CRSS.");
      await tokenApprove(crss, owner, alice, 1000);

      let allowanceOwnerAlice = await getTokenAllowance(crss, owner, alice);
      consoleLogWithTab(`allowance[owner][alice] is ${weiToEthEn(allowanceOwnerAlice)}`);
      expectEqual(weiToEth(allowanceOwnerAlice), 1000);

      consoleLogWithTab(`Increase it by 1000.`);
      await tokenIncreaseAllowance(crss, owner, alice, 1000);
      allowanceOwnerAlice = await getTokenAllowance(crss, owner, alice);
      consoleLogWithTab(`allowance[owner][alice] is ${weiToEthEn(allowanceOwnerAlice)}`);
      expectEqual(weiToEth(allowanceOwnerAlice), 2000);

      consoleLogWithTab(`Decrease it by 1000.`);
      await tokenDecreaseAllowance(crss, owner, alice, 1000);
      allowanceOwnerAlice = await getTokenAllowance(crss, owner, alice);
      consoleLogWithTab(`allowance[owner][alice] is ${weiToEthEn(allowanceOwnerAlice)}`);
      expectEqual(weiToEth(allowanceOwnerAlice), 1000);
    });

    // --------------------------------- Liquidity -------------------------------

    it("Add liquidity and remove liquidity were checked.\n".green, async function () {
      //======================================== Tokenomic parameters =======================================
      let initialCrssPrice = 1;
      let initialCrssBnbValue = 140000;
      let initialCrssMckValue = 140000;
      let bnbPrice = 500, mckPrice = 1;

      console.log(`\t==========================================================================================================`.yellow);
      console.log(`\tAssuming the following tokenomics parameters:`.yellow);
      console.log(`\tCrss/USD price initially targeted:`.cyan.bold, initialCrssPrice);
      console.log(`\tCrss/Bnb pool's assets value in USD, initially targeted:`.cyan.bold, initialCrssBnbValue);
      console.log(`\tCrss/Mck pool's assets value in USD, initially targeted:`.cyan.bold, initialCrssMckValue);
      console.log(`\tBnb/USD price at the time of Crss/Bnb pool deployment:`.cyan.bold, bnbPrice);
      console.log(`\tMck/USD price at the time of Crss/Mck pool deployment:`.cyan.bold, mckPrice);
      console.log(`\t==========================================================================================================`.yellow);

      let poolValue = initialCrssBnbValue;
      let crssAmount = poolValue / 2 / initialCrssPrice;
      let bnbAmount = poolValue / 2 / bnbPrice;
      [crss_bnb, report] = await test_addLiquidity(crss, crssAmount / 3, wbnb, bnbAmount / 3, owner, alice, true);
      [crss_bnb, report] = await test_addLiquidity(crss, crssAmount / 3, wbnb, bnbAmount / 3, owner, bob, true);
      [crss_bnb, report] = await test_addLiquidity(crss, crssAmount / 3, wbnb, bnbAmount / 3, owner, carol, true);

      [report, crssAmount] = await test_swap(wbnb, 0.01, crss, undefined, alice, bob, true);
      [report, bnbAmount] = await test_swap(crss, crssAmount * 0.99, wbnb, undefined, bob, alice, true);
      let liquidityAmount = 0.001;
      report = await test_removeLiquidity(crss, wbnb, liquidityAmount, alice, alice, true);

      poolValue = initialCrssMckValue;
      crssAmount = poolValue / 2 / initialCrssPrice;
      let mckAmount = poolValue / 2 / mckPrice;
      [crss_mck, report] = await test_addLiquidity(crss, crssAmount, mock, mckAmount, owner, alice, true);
      [crss_mck, report] = await test_addLiquidity(crss, crssAmount, mock, mckAmount, owner, bob, true);
      [crss_mck, report] = await test_addLiquidity(crss, crssAmount, mock, mckAmount, owner, carol, true);

      [crss_mck2, report] = await test_addLiquidity(crss, crssAmount, mock2, mckAmount, owner, alice, true);
      [crss_mck2, report] = await test_addLiquidity(crss, crssAmount, mock2, mckAmount, owner, bob, true);
      [crss_mck2, report] = await test_addLiquidity(crss, crssAmount, mock2, mckAmount, owner, carol, true);

      await crss.connect(owner).transfer(alice.address, ethToWei(15));
      [report, mockAmount] = await test_swap(crss, 10, mock, undefined, alice, alice, true);
      [report, crssAmount] = await test_swap(mock, mockAmount * 0.99, crss, undefined, alice, bob, true);
      liquidityAmount = 0.001;
      report = await test_removeLiquidity(crss, mock, liquidityAmount, alice, alice, true);

      await crss.connect(owner).transfer(alice.address, ethToWei(15));
      [report, mockAmount] = await test_swap(crss, 10, mock2, undefined, alice, alice, true);
      [report, crssAmount] = await test_swap(mock2, mockAmount * 0.99, crss, undefined, alice, bob, true);
      liquidityAmount = 0.001;
      report = await test_removeLiquidity(crss, mock2, liquidityAmount, alice, alice, true);


    });

    //     it("Transfer function was checked.\n".green, async function () {
    //       // consoleLogWithTab("Transfer 1000 tokens from owner to Alice should be failed with <Exceed MaxTransferAmount>.");
    //       // let tx = crss.transfer(alice.address, ethToWei(1000));
    //       // await expectRevertedWith(tx, "Exceed MaxTransferAmount");

    //       let maxTransferAmount = await crss.maxTransferAmount();
    //       consoleLogWithTab(`Because maxTransferAmount value is ${weiToEth(await crss.maxTransferAmount())}.`);

    //       consoleLogWithTab("Transfer 100 tokens from owner to Alice.");
    //       let transferAmount = 100;
    //       let ownerCrssBalance = await getTokenBalanceOfAddress(crss, owner.address);
    //       consoleLogWithTab(`Before transfer, owner has ${weiToEthEn(ownerCrssBalance)} CRSS tokens.`);
    //       let aliceCrssBalance = await getTokenBalanceOfAddress(crss, alice.address);
    //       consoleLogWithTab(`Before transfer, alice has ${weiToEthEn(aliceCrssBalance)} CRSS tokens.`);

    //       tx = crss.transfer(alice.address, ethToWei(transferAmount));
    //       await expectNotReverted(tx);

    //       let afterOwnerCrssBalance = await getTokenBalanceOfAddress(crss, owner.address);
    //       consoleLogWithTab(`After transfer, owner has ${weiToEthEn(ownerCrssBalance)} CRSS tokens.`);
    //       let afterAliceCrssBalance = await getTokenBalanceOfAddress(crss, alice.address);
    //       consoleLogWithTab(`After transfer, alice has ${weiToEthEn(aliceCrssBalance)} CRSS tokens.`);

    //       consoleLogWithTab(`Owner CRSS balance is reduced by ${transferAmount}.`);
    //       expectEqual(ownerCrssBalance.sub(afterOwnerCrssBalance), ethToWei(transferAmount));

    //       let transferAmountWithOutFee = getTransferAmountWithOutFee(transferAmount);
    //       consoleLogWithTab(
    //         `Alice CRSS balance is increased by ${weiToEthEn(
    //           transferAmountWithOutFee
    //         )} expect tranfer fee from ${transferAmount}.`
    //       );
    //       expectEqual(afterAliceCrssBalance.sub(aliceCrssBalance), transferAmountWithOutFee);

    //       consoleLogWithTab(`Cannot transfer over its balance.`);
    //       tx = crss.connect(alice).transfer(bob.address, afterAliceCrssBalance.add(ethToWei(1)));
    //       await expectRevertedWith(tx, "Exceeds balance");
    //     });

    //     it("TransferFrom function was checked.\n".green, async function () {
    //       const maxTransferAmount = await crss.maxTransferAmount();
    //       consoleLogWithTab(`Max transfer amount is ${weiToEthEn(maxTransferAmount)}`);

    //       consoleLogWithTab(`Approve for bob to tranfer from owner as maxTransferAmount + 100.`);
    //       let tx = crss.approve(bob.address, maxTransferAmount.add(ethToWei(100)));
    //       await expectNotReverted(tx);

    //       let allowance = await crss.allowance(owner.address, bob.address);
    //       consoleLogWithTab(`allowance[owner][bob] is ${weiToEthEn(allowance)}`);

    //       tx = crss.connect(bob).transferFrom(owner.address, carol.address, allowance.add(ethToWei(1)));
    //       await expectRevertedWith(tx, "Transfer exceeds allowance");
    //       consoleLogWithTab(
    //         "TransferFrom-ing over allowance amount reverted with <Transfer exceeds allowance>."
    //       );


    //       tx = crss.connect(bob).transferFrom(owner.address, carol.address, allowance.sub(ethToWei(1)));
    //       await expectRevertedWith(tx, "Exceed MaxTransferAmount");
    //       consoleLogWithTab(
    //         "Transfer-ring over maxTransferAmount reverted with <Exceed MaxTransferAmount>."
    //       );
    //       let ownerCrssBalance = await getTokenBalanceOfAddress(crss, owner.address);
    //       consoleLogWithTab(`Owner CRSS balance before transfer: ${weiToEthEn(ownerCrssBalance)}`);
    //       let carolCrssBalance = await getTokenBalanceOfAddress(crss, carol.address);
    //       consoleLogWithTab(`Carol's CRSS balance before transfer: ${weiToEthEn(carolCrssBalance)}`);
    //       consoleLogWithTab("Transfer from less than allowance and maxTransferAmount will be succeed.");

    //       tx = crss.connect(bob).transferFrom(owner.address, carol.address, maxTransferAmount.sub(ethToWei(100)));
    //       await expectNotReverted(tx);

    //       ownerCrssBalance = await getTokenBalanceOfAddress(crss, owner.address);
    //       consoleLogWithTab(`Owner CRSS balance after transfer: ${weiToEthEn(ownerCrssBalance)}`);
    //       carolCrssBalance = await getTokenBalanceOfAddress(crss, carol.address);
    //       consoleLogWithTab(`Carol's CRSS balance after transfer: ${weiToEthEn(carolCrssBalance)}`);

    //       let afterAllowance = await crss.allowance(owner.address, bob.address);
    //       consoleLogWithTab(`allowance[owner][bob] after transfer is ${weiToEthEn(afterAllowance)}`);
    //       consoleLogWithTab(`It would be reduced by transfer amount.`);
    //       expectEqual(allowance.sub(afterAllowance), maxTransferAmount.sub(ethToWei(100)));
    //     });
  }
);


// describe("=========================== Compensation Test =======================\n".yellow, async function () {

//   it("Compensation test.\n".green, async function () {

//     tx = rCrss.connect(owner).initialize();
//     (await tx).wait();
//     console.log("\tRepay Token is initialized with loss data");

//     tx = repay.connect(owner).setUpRepayPool();
//     (await tx).wait();
//     console.log("\tRepay Tokens are deposited to the Repay Pool");

//     mintBlocks(100);

//     await harvestRepay(alice, 10);
//     await harvestRepay(bob, 10);
//     await harvestRepay(carol, 10);

//     await harvestRepay(alice, 1000);
//     await harvestRepay(bob, 1000);
//     await harvestRepay(carol, 1000);

//     tx = repay.connect(alice).pause();
//     expectReverted(tx);
//     console.log("\tAlice couldn't pause the repay farm".yellow);

//     tx = repay.connect(alice).resume();
//     expectReverted(tx);
//     console.log("\tAlice couldn't resume the repay farm".yellow);

//     tx = repay.connect(owner).pause();
//     (await tx).wait();
//     console.log("\tOwner paused the repay farm".yellow);

//     tx = repay.connect(alice).harvestRepay(ethToWei(1));
//     expectReverted(tx);
//     console.log("\tAlice couldn't harvest repay while the farm is paused".yellow);

//     tx = repay.connect(owner).resume();
//     (await tx).wait();
//     console.log("\tOwner resumed the repay farm".yellow);

//     tx = repay.connect(alice).harvestRepay(ethToWei(10));
//     (await tx).wait();
//     console.log("\tAlice could harvest repay while the farm is resumed".yellow);

//   });

// });

async function mintBlocks(blocks) {
  let bn0 = (await ethers.provider.getBlock("latest")).number;
  for (let n = 0; n < blocks; n++) {
    await network.provider.send("evm_mine");
  }
  let bn1 = (await ethers.provider.getBlock("latest")).number;
  console.log(`\tminted %s/%s blocks. bn = `.green, bn1 - bn0, blocks, bn1);
}

async function mintTime(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
}

async function userAmount(pid, user) {
  return (await farm.userInfo(pid, user.address)).amount;
}

async function subPool(pid, spName) {
  let crssPool = await farm.poolInfo(pid);
  return crssPool[spName];
}

async function showPoolInfo(pid) {
  let pool = await farm.poolInfo(pid);
  let pair = new ethers.Contract(pool.lpToken, CrossPairArtifacts.abi, owner);
  console.log(`\t= pool: %s, alloc: %s / %s, accCrss/Share: %s, depositFee = %s %, lpSuppy: %s`,
    pid, pool.allocPoint, (await farm.farmParams()).totalAllocPoint, pool.accCrssPerShare, pool.depositFeeRate / FeeMagnifier * 100, await pair.balanceOf(farm.address));

  console.log("\tOnOff - Comp.bulk: %s, PreComp.bulk: %s", pool.OnOff.Comp.bulk, pool.OnOff.PreComp.bulk);
  console.log("\tOnOn - Comp.bulk: %s, PreComp.bulk: %s, Vest.bulk: %s", pool.OnOn.Comp.bulk, pool.OnOn.PreComp.bulk, pool.OnOn.Vest.bulk);
  console.log("\tOffOn - Vest.bulk: %s, Accum.bulk: %s", pool.OffOn.Vest.bulk, pool.OffOn.Accum.bulk);
  console.log("\tOffOff - Accum.bulk: %s", pool.OffOff.Accum.bulk);
}

async function showBranchInfo(pid, _branch) {
  let pool = await farm.poolInfo(pid);

  let branch, subPool1, subPool1_name, subPool2, subPool2_name;
  if (_branch == "OnOff") {
    branch = pool.OnOff;
    subPool1 = branch.Comp;
    subPool1_name = "Comp";
  } else if (_branch == "OnOn") {
    branch = pool.OnOn;
    subPool1 = branch.Comp;
    subPool1_name = "Comp";
    subPool2 = branch.Vest;
    subPool2_name = "Vest";
  } else if (_branch == "OffOn") {
    branch = pool.OffOn;
    subPool1 = branch.Vest;
    subPool1_name = "Vest";
    subPool2 = branch.Accum;
    subPool2_name = "Accum";
  } else if (_branch == "OffOff") {
    branch = pool.OffOff;
    subPool1 = branch.Accum;
    subPool1_name = "Accum";
  }

  //console.log("\t= branch: %s, sumAmount: %s,  rewardDebt: %s", _branch, branch.sumAmount, branch.rewardDebt);
  console.log("\t- %s, bulk: %s, accPerShare: %s", subPool1_name, subPool1.bulk, subPool1.accPerShare);
  if (subPool2_name != undefined)
    console.log("\t- %s, bulk: %s, accPerShare: %s", subPool2_name, subPool2.bulk, subPool2.accPerShare);
}

async function showUserInfo(pid, _user) {
  let ret = await getPoolConstants(pid, _user);
  let pool = ret.pool; let pair = ret.pair; let symbol = ret.symbol;

  let collectOption, deposit, accRewards, totalVest, totalMatureVest, pendingCrss, rewardPayroll, lpBalance, crssBalance, totalAccRewards;
  [collectOption, deposit, accRewards, totalVest, totalMatureVest, pendingCrss, rewardPayroll, lpBalance, crssBalance, totalAccRewards]
    = await farm.getUserState(pid, _user.address);

  console.log(`\t= %s, option: %s, depo: %s, accum: %s, vest: %s, wVest: %s`,
    _user.name, CollectOptions[collectOption], deposit, accRewards, totalVest, totalMatureVest);
  console.log(`\t\tpending: %s, payroll: %s, lp: %s %s, crss: %s`,
    pendingCrss, rewardPayroll, lpBalance, symbol, crssBalance);

  return {
    symbol: symbol, deposit: deposit, accReward: accRewards, tVest: totalVest, wVest: totalMatureVest,
    pending: pendingCrss, payroll: rewardPayroll, lp: lpBalance, crss: crssBalance, tAccRewards: totalAccRewards
  };
}

async function getPoolConstants(pid, caller) {
  let pool = await farm.poolInfo(pid);
  let pair = new ethers.Contract(pool.lpToken, CrossPairArtifacts.abi, caller);

  let symbol;
  if (pid == 0) {
    symbol = "Crss";
  } else {
    let token0 = new ethers.Contract(await pair.token0(), ERC20Abi.abi, caller); // adding caller is essential.
    let token1 = new ethers.Contract(await pair.token1(), ERC20Abi.abi, caller);
    symbol = "ROOT(" + await token0.symbol() + "*" + await token1.symbol() + ")";
  }
  return { pool: pool, pair: pair, symbol: symbol };
}

const CollectOptions = ["OffOff", "OnOff", "OnOn", "OffOn"]; // DO NOT change the order.

async function switchCollectOption(pid, caller, newOption) {
  let ret = await getPoolConstants(pid, caller);
  let pool = ret.pool; let pair = ret.pair; let symbol = ret.symbol;
  assert(CollectOptions.includes(newOption));
  let user = await farm.userInfo(pid, caller.address);
  console.log("\t%s is going to switch from %s to %s on pool %s (%s)".yellow, caller.name, CollectOptions[user.collectOption], newOption, pid, symbol);

  await showPoolInfo(pid);
  await showBranchInfo(pid, CollectOptions[user.collectOption]);
  await showBranchInfo(pid, newOption);
  await showUserInfo(pid, caller);

  console.log(`\tSwitching now... taking pending rewards first.`.green);
  tx = (await farm.connect(caller).switchCollectOption(pid, CollectOptions.indexOf(newOption))).wait();

  await showPoolInfo(pid);
  await showBranchInfo(pid, CollectOptions[user.collectOption]);
  await showBranchInfo(pid, newOption);
  await showUserInfo(pid, caller);
}

async function patrol(caller) {
  console.log("\t%s is going to patrol".yellow, caller.name);

  (await farm.connect(caller).periodicPatrol()).wait();
}

async function deposit(pid, caller, amount, revert) {
  let ret = await getPoolConstants(pid, caller);
  let pool = ret.pool; let pair = ret.pair; let symbol = ret.symbol;

  console.log("\t%s is going to deposit %s %s to pool %s".yellow, caller.name, amount, symbol, pid);
  await showPoolInfo(pid);

  let lp0, lp1, deposit0, deposit1;
  ret = await showUserInfo(pid, caller);
  lp0 = ret.lp; deposit0 = ret.deposit;

  console.log("\tBalance: ".blue, await pair.balanceOf(caller.address))
  console.log(`\tDepositing now... taking pending rewards first.`.green);
  (await pair.connect(caller).approve(farm.address, ethToWei(amount))).wait();

  (await farm.connect(caller).deposit(pid, ethToWei(amount))).wait();

  await showPoolInfo(pid);
  ret = await showUserInfo(pid, caller);
  lp1 = ret.lp; deposit1 = ret.deposit;

  console.log(`\t%s's lp balance decreased %s %s`.cyan, caller.name, BigInt(lp0) - BigInt(lp1), symbol);
  console.log(`\t%s's deposit increased %s %s`.cyan, caller.name, BigInt(deposit1) - BigInt(deposit0), symbol);
  console.log(`\tNote of transaction and deposit fees.`.cyan);
}

async function withdraw(pid, caller, amount) {
  let ret = await getPoolConstants(pid, caller);
  let pool = ret.pool; let pair = ret.pair; let symbol = ret.symbol;

  console.log("\t%s is going to withdraw %s %s from pool %s".yellow, caller.name, amount, symbol, pid);
  await showPoolInfo(pid);

  let lp0, lp1, deposit0, deposit1;
  ret = await showUserInfo(pid, caller);
  lp0 = ret.lp; deposit0 = ret.deposit;

  console.log(`\tWithdrawing now... taking pending rewards first.`.green);
  (await farm.connect(caller).withdraw(pid, ethToWei(amount))).wait();

  await showPoolInfo(pid);
  ret = await showUserInfo(pid, caller);
  lp1 = ret.lp; deposit1 = ret.deposit;

  console.log(`\t%s's deposit decreased %s %s`.cyan, caller.name, deposit0 - deposit1, symbol);
  console.log(`\t%s's lp balance increased %s %s`.cyan, caller.name, lp1 - lp0, symbol);
  console.log(`\tA few more blocks minted may lead to an a little more deposit decrease.`.cyan);
  console.log(`\tNote of the transaction fee.`.cyan);
}

async function withdrawVest(pid, caller, amount) {
  let ret = await getPoolConstants(pid, caller);
  let pool = ret.pool; let pair = ret.pair; let symbol = ret.symbol;

  console.log("\t%s is going to withdrawVest %s %s from pool %s".yellow, caller.name, amount, symbol, pid);
  await showPoolInfo(pid);

  let crss0, crss1, wVest0, wVest1;
  ret = await showUserInfo(pid, caller);
  crss0 = ret.crss; wVest0 = ret.wVest;

  console.log(`\tWithdrawVesting now... taking pending rewards first.`.green);
  (await pair.connect(caller).approve(farm.address, ethToWei(amount))).wait();
  (await farm.connect(caller).withdrawVest(pid, ethToWei(amount))).wait();

  await showPoolInfo(pid);
  ret = await showUserInfo(pid, caller);
  crss1 = ret.crss; wVest1 = ret.wVest;

  console.log(`\t%s's withdrawable vest decreased %s %s`.cyan, caller.name, wVest0 - wVest1, "Crss");
  console.log(`\t%s's wallet balance increased %s %s`.cyan, caller.name, crss1 - crss0, "Crss");
  console.log(`\tNote of the transaction fee.`.cyan);
}


async function vestAccumulated(pid, caller) {
  let ret = await getPoolConstants(pid, caller);
  let pool = ret.pool; let pair = ret.pair; let symbol = ret.symbol;

  let user = await farm.userInfo(pid, caller.address);
  console.log("\t%s is going to vest their pending + accumulated rewards %s %s".yellow, caller.name, user.accumulated, symbol);
  await showPoolInfo(pid);

  let vest0, vest1;
  ret = await showUserInfo(pid, caller);
  vest0 = ret.tVest;

  console.log(`\tVesting now... taking pending`.green);
  (await farm.connect(caller).vestAccumulated(pid)).wait();

  await showPoolInfo(pid);
  ret = await showUserInfo(pid, caller);
  vest1 = ret.tVest;

  console.log(`\t%s's total vest increased %s Crss`.cyan, caller.name, vest1 - vest0);
  console.log(`\tA few more blocks minted may lead to an a little more vest increase.`.cyan);
}


async function compoundAccumulated(pid, caller) {
  let ret = await getPoolConstants(pid, caller);
  let pool = ret.pool; let pair = ret.pair; let symbol = ret.symbol;

  let user = await farm.userInfo(pid, caller.address);
  console.log("\t%s is going to compound their pending + accumulated rewards %s %s".yellow, caller.name, user.accumulated, symbol);
  await showPoolInfo(pid);

  let deposit0, deposit1;
  ret = await showUserInfo(pid, caller);
  deposit0 = ret.deposit;

  console.log(`\tCompounding now... taking pending`.green);
  (await farm.connect(caller).compoundAccumulated(pid)).wait();

  await showPoolInfo(pid);
  ret = await showUserInfo(pid, caller);
  deposit1 = ret.deposit;

  console.log(`\t%s's deposit increased %s Crss`.cyan, caller.name, deposit1 - deposit0);
  console.log(`\tA few more blocks minted may lead to an a little more deposit increase.`.cyan);
}


async function harvestAccumulated(pid, caller) {
  let ret = await getPoolConstants(pid, caller);
  let pool = ret.pool; let pair = ret.pair; let symbol = ret.symbol;

  let user = await farm.userInfo(pid, caller.address);
  console.log("\t%s is going to harvest their pending + accumulated reward %s %s.".yellow, caller.name, user.accumulated, symbol);
  await showPoolInfo(pid);

  let crssBalance0, crssBalance1;
  ret = await showUserInfo(pid, caller);
  crssBalance0 = ret.crss;

  console.log(`\tHarvesting now...  taking pending`.green);
  (await farm.connect(caller).harvestAccumulated(pid)).wait();

  await showPoolInfo(pid);
  ret = await showUserInfo(pid, caller);
  crssBalance1 = ret.crss;

  console.log(`\t%s's Crss balance increased %s Crss`.cyan, caller.name, crssBalance1 - crssBalance0);
  console.log(`\tA few more blocks minted may lead to an a little more balance increase.`.cyan);
}

async function stakeAccumulated(pid, caller) {
  let ret = await getPoolConstants(pid, caller);
  let pool = ret.pool; let pair = ret.pair; let symbol = ret.symbol;

  let user = await farm.userInfo(pid, caller.address);
  console.log("\t%s is going to stake their pending + accumulated reward %s %s.".yellow, caller.name, user.accumulated, symbol);
  await showPoolInfo(0);

  let deposit0, deposit1;
  ret = await showUserInfo(0, caller);
  deposit0 = ret.deposit;

  console.log(`\tStaking now...  taking pending`.green);
  tx = farm.connect(caller).stakeAccumulated(pid);
  (await tx).wait();

  await showPoolInfo(0);
  ret = await showUserInfo(0, caller);
  deposit1 = ret.deposit;

  console.log(`\t%s's Crss deposit increased %s Crss`.cyan, caller.name, deposit1 - deposit0);
  console.log(`\tA few more blocks minted may lead to an a little more balance increase.`.cyan);
}

async function massHarvestRewards(caller) {
  console.log("\t%s is going to mass harvest.".yellow, caller.name);

  let crssBalance0, crssBalance1;
  ret = await showUserInfo(0, caller);
  crssBalance0 = ret.crss;

  console.log(`\tmassHarvestRewards now...  taking pending`.green);
  (await farm.connect(caller).massHarvestRewards()).wait();

  ret = await showUserInfo(0, caller);
  crssBalance1 = ret.crss;

  console.log(`\t%s's balance increased %s Crss`.cyan, caller.name, crssBalance1 - crssBalance0);
  console.log(`\tA few more blocks minted may lead to an a little more balance increase.`.cyan);
}

async function massStakeRewards(caller) {
  console.log("\t%s is going to mass stake.".yellow, caller.name);

  let stake0, stake1;
  ret = await showUserInfo(0, caller);
  stake0 = ret.deposit;

  console.log(`\tmassStakeRewards now...  taking pending`.green);
  (await farm.connect(caller).massStakeRewards()).wait();

  ret = await showUserInfo(0, caller);
  stake1 = ret.deposit;

  console.log(`\t%s's Crss stake increased %s Crss`.cyan, caller.name, stake1 - stake0);
  console.log(`\tA few more blocks minted may lead to an a little more stake increase.`.cyan);
}

async function massCompoundRewards(caller) {
  console.log("\t%s is going to mass compound.".yellow, caller.name);

  console.log(`\tmassCompoundRewards now...  taking pending`.green);
  (await farm.connect(caller).massCompoundRewards()).wait();
}

async function emergencyWithdraw(pid, caller) {
  let ret = await getPoolConstants(pid, caller);
  let pool = ret.pool; let pair = ret.pair; let symbol = ret.symbol;

  console.log("\t%s is going to emergency withdraw from pool %s".yellow, caller.name, pid);
  await showPoolInfo(pid);

  let lp0, lp1, deposit0, deposit1;
  ret = await showUserInfo(pid, caller);
  lp0 = ret.lp; deposit0 = ret.deposit;

  console.log(`\temergency Withdrawing now... taking pending rewards first.`.green);
  (await farm.connect(caller).emergencyWithdraw(pid)).wait();

  await showPoolInfo(pid);
  ret = await showUserInfo(pid, caller);
  lp1 = ret.lp; deposit1 = ret.deposit;

  console.log(`\t%s's deposit decreased %s %s`.cyan, caller.name, deposit0 - deposit1, symbol);
  console.log(`\t%s's lp balance increased %s %s`.cyan, caller.name, lp1 - lp0, symbol);
  console.log(`\tA few more blocks minted may lead to an a little more deposit decrease.`.cyan);
  console.log(`\tNote of the transaction fee.`.cyan);
}

const ListStatus_ = ["None", "Cleared", "Enlisted", "Delisted"];

async function enlistToken(token, caller) {
  console.log("\t%s is going to enlist the token %s".yellow, caller.name, uiAddr(token.address));
  (await factory.connect(caller).changeTokenStatus(token.address, ListStatus.indexOf("Enlisted"))).wait();
}

async function delistToken(token, caller) {
  console.log("\t%s is going to delist the token %s".yellow, caller.name, uiAddr(token.address));
  (await factory.connect(caller).changeTokenStatus(token.address, ListStatus.indexOf("Delisted"))).wait();
}

async function clearToken(token, caller) {
  console.log("\t%s is going to clear the token %s".yellow, caller.name, uiAddr(token.address));
  (await factory.connect(caller).changeTokenStatus(token.address, ListStatus.indexOf("Cleared"))).wait();
}


describe("====================== Stage 5: Test CrossFarm ======================\n".yellow,
  function () {

    // it("Farm has Crss staking pool initially.\n".green, async function () {
    //   await showPoolInfo(0);
    // });


    //       it("How the initial empty Crss staking pool works with rewards.\n".green, async function () {
    //         let amount = 100;
    //         crss = crss.connect(owner);
    //         crss.transfer(alice.address, ethToWei(amount * 1.05));
    //         crss.transfer(bob.address, ethToWei(amount * 1.05));

    //         await switchCollectOption(0, alice, "OnOff");
    //         await switchCollectOption(0, bob, "OnOff");

    //         await showUserInfo(0, alice);
    //         await showUserInfo(0, bob);

    //         await deposit(0, alice, 10);
    //         await deposit(0, bob, 10);

    //         await showUserInfo(0, alice);
    //         await showUserInfo(0, bob);

    //         await mintBlocks(1000);

    //         await showUserInfo(0, alice);
    //         await showUserInfo(0, bob); // 60% payroll diff at 500 mints

    //         await deposit(0, alice, 0);

    //         await mintBlocks(1000);
    //         await deposit(0, bob, 0);

    //         await showUserInfo(0, alice);
    //         await showUserInfo(0, bob);

    //         console.log("----------------------------------------------------------------------------------------------------");

    //         await deposit(0, alice, 10);
    //         await withdraw(0, alice, 5);

    //         await mintBlocks(100);      

    //         await deposit(0, alice, 0);

    //         await deposit(0, alice, 0);
    //         await withdraw(0, alice, 0);

    //         await mintBlocks(10);

    //         await deposit(0, bob, 10);
    //         await deposit(0, carol, 10);
    //         await withdraw(0, bob, 9);
    //         await withdraw(0, carol, 9);

    //         await switchCollectOption(0, alice, "OnOff");

    //         await mintBlocks(10);

    //         await deposit(0, alice, 10);
    //         await withdraw(0, alice, 5);

    //         await deposit(0, alice, 0);
    //         await withdraw(0, alice, 0);

    //         await deposit(0, bob, 10);
    //         await deposit(0, carol, 10);
    //         await withdraw(0, bob, 9);
    //         await withdraw(0, carol, 9);

    //         await mintBlocks(10);
    //         await switchCollectOption(0, bob, "OnOn");

    //         await deposit(0, alice, 10);
    //         await withdraw(0, alice, 5);

    //         await deposit(0, alice, 0);
    //         await withdraw(0, alice, 0);

    //         await mintBlocks(10);

    //         await deposit(0, bob, 10);
    //         await deposit(0, carol, 10);
    //         await withdraw(0, bob, 9);
    //         await withdraw(0, carol, 9);

    //         await switchCollectOption(0, carol, "OffOn");

    //         await deposit(0, alice, 10);
    //         await withdraw(0, alice, 5);

    //         await mintBlocks(10);

    //         await deposit(0, alice, 0);
    //         await withdraw(0, alice, 0);

    //         await deposit(0, bob, 10);
    //         await deposit(0, carol, 10);
    //         await withdraw(0, bob, 9);
    //         await withdraw(0, carol, 9);

    //         await mintBlocks(10);

    //         await (0, bob, "OffOn");  // OnOn
    //         await switchCollectOption(0, carol, "OffOn");      // ok

    //         mintBlocks(100);
    //         await deposit(0, alice, 10);  // ok
    //         await deposit(0, alice, 10);  // ok
    //         await deposit(0, alice, 10);  // ok
    //         await vestAccumulated(0, alice);  // ok
    //         //await compoundAccumulated(0, bob);  // ok
    //         await harvestAccumulated(0, carol); // ok
    //         await withdraw(0, alice, 10); // ok

    //         await deposit(0, alice, 10);  // ok
    //       });

    //       it("How the initial empty Crss/Bnb staking pool works with rewards.\n".green, async function () {
    //         tx = farm.connect(owner).add(8000, crss_bnb.address, true, 2000);
    //         (await tx).wait();

    //         await deposit(1, alice, 10);
    //         await withdraw(1, alice, 5);

    //         await mintBlocks(10);

    //         await deposit(1, alice, 0);
    //         await withdraw(1, alice, 0);

    //         await deposit(1, bob, 10);
    //         await deposit(1, carol, 10);
    //         await withdraw(1, bob, 9);
    //         await withdraw(1, carol, 9);

    //         await deposit(0, alice, 10);  // ok ----------------------------------------------

    //         await mintBlocks(10);
    //         await switchCollectOption(1, alice, "OnOff"); // ok

    //         //
    //         await deposit(1, alice, 15);  // ok ----------------------------------------------- ????????????????
    //         //await deposit(1, alice, 10);  // ok
    //         //await withdraw(1, alice, 10);  // ok

    //         await deposit(0, alice, 10);  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    //         await withdraw(1, alice, 20); // ok

    //         await mintBlocks(10);

    // //        await deposit(0, alice, 10);  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    //         await deposit(1, bob, 10);  // ok

    //         await withdraw(1, alice, 5);  // ok

    //         await deposit(1, alice, 0); // ok
    //         await withdraw(1, alice, 0);  // ok

    //         await mintBlocks(10);

    // //        await deposit(0, alice, 10);  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    //         await deposit(1, bob, 10);  // ok
    //         await deposit(1, carol, 10);  // ok
    //         await withdraw(1, bob, 9);  // ok
    //         await withdraw(1, carol, 9);  // ok

    //         await switchCollectOption(1, bob, "OnOn");  // ok

    //         await deposit(1, alice, 10);  // ok
    //         await deposit(1, alice, 0); // ok
    //         await deposit(1, alice, 15);  // ok
    //         await withdraw(1, alice, 10); // ok

    //         await mintBlocks(10);

    //         console.log("========================================================================================================================================")
    //         await stakeAccumulated(1, alice);
    //         await stakeAccumulated(0, alice);   
    //         await stakeAccumulated(1, bob);
    //         await stakeAccumulated(0, bob);
    //         await stakeAccumulated(0, carol);
    //         await stakeAccumulated(1, carol);

    //         await deposit(1, bob, 10);  // ok

    //         await withdraw(1, alice, 5);  // ok

    //         await deposit(1, alice, 0); // ok
    //         await withdraw(1, alice, 0);  // ok

    //         await mintBlocks(10);

    //         await deposit(0, alice, 10);  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    //         await deposit(1, bob, 10);
    //         await deposit(1, carol, 10);
    //         await withdraw(1, bob, 9);
    //         await withdraw(1, carol, 9);

    //         await switchCollectOption(1, carol, "OffOn");

    //         await deposit(1, alice, 10);
    //         await deposit(1, alice, 0);
    //         await deposit(1, alice, 15);

    //         mintBlocks(100);
    //         await vestAccumulated(1, alice);
    //         //await compoundAccumulated(1, bob);
    //         await harvestAccumulated(1, carol);

    //         await deposit(0, alice, 10);
    //         await deposit(1, bob, 10);
    //       });


    //       it("---------------------- Intentionally left blank ---------------------.\n".green, async function () {
    //       });

    //       it("Switching collect options.\n".green, async function () {
    //         // If you see the amount error, it's due to fees subtracted.
    //         await switchCollectOption(0, alice, "OnOn"); 
    //         await switchCollectOption(0, alice, "OffOn");

    //       });

    //       it("Vesting accumulated rewards.\n".green, async function () {
    //         await vestAccumulated(0, alice);
    //         await vestAccumulated(1, alice);

    //       });

    //       it("Claim accumulated rewards.\n".green, async function () {
    //         await harvestAccumulated(1, alice, "Alice");

    //       });


    //       it("Alice, Bob, and Carol each were minted Mock tokens.\n".green, async function () {
    //         tx = farm.connect(owner).add(1600, crss_mck.address, true, 1000);
    //         (await tx).wait();

    //         let mckMount = 1e6;
    //         await mock.connect(owner).mint(alice.address, ethToWei(mckMount));
    //         await mock.connect(owner).mint(bob.address, ethToWei(mckMount));
    //         await mock.connect(owner).mint(carol.address, ethToWei(mckMount));
    //         console.log(`\tAlice, Bob, and Carol each were minted %s Mck`.cyan);

    //         await deposit(0, alice, 10);
    //         await deposit(1, bob, 10);
    //         await deposit(2, carol, 10);
    //       });


    //       it("Round 1. Alice, Bob, and Carol swapped a big amount of Bnb for Crss, and staked the Crss tokens.\n".green, async function () {
    //         let report, crssAmount, safeOne = 0.99999;
    //         console.log(`\tThe swap amount of Bnb to swap is chosen not to violate price control`.green);

    //         [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(alice.address))/100000,  crss, undefined, alice, alice, true);
    //         await deposit(1, alice, weiToEth(await crss_bnb.balanceOf(alice.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(alice.address))/100000, crss, undefined, alice, alice, true);
    //         await deposit(2, alice, weiToEth(await crss_mck.balanceOf(alice.address))/10 );

    //          [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(bob.address))/100000,  crss, undefined, bob, bob, true);
    //         await deposit(1, bob, weiToEth(await crss_bnb.balanceOf(bob.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(bob.address))/100000, crss, undefined, bob, bob, true);
    //         await deposit(2, bob, weiToEth(await crss_mck.balanceOf(bob.address))/10 );

    //         [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(carol.address))/100000,  crss, undefined, carol, carol, true);
    //         await deposit(1, carol, weiToEth(await crss_bnb.balanceOf(carol.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(carol.address))/100000, crss, undefined, carol, carol, true);
    //         await deposit(2, carol, weiToEth(await crss_mck.balanceOf(carol.address))/10 );

    //         await deposit(0, alice, 10);
    //         await deposit(1, bob, 10);
    //         await deposit(2, carol, 10);
    //       });

    //       it("Round 2. Alice, Bob, and Carol swapped a big amount of Bnb for Crss, and staked the Crss tokens.\n".green, async function () {
    //         let report, crssAmount, safeOne = 0.99999;
    //         console.log(`\tThe swap amount of Bnb to swap is chosen not to violate price control`.green);

    //         [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(alice.address))/100000,  crss, undefined, alice, alice, true);
    //         await deposit(1, alice, weiToEth(await crss_bnb.balanceOf(alice.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(alice.address))/100000, crss, undefined, alice, alice, true);
    //         await deposit(2, alice, weiToEth(await crss_mck.balanceOf(alice.address))/10 );

    //          [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(bob.address))/100000,  crss, undefined, bob, bob, true);
    //         await deposit(1, bob, weiToEth(await crss_bnb.balanceOf(bob.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(bob.address))/100000, crss, undefined, bob, bob, true);
    //         await deposit(2, bob, weiToEth(await crss_mck.balanceOf(bob.address))/10 );

    //         [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(carol.address))/100000,  crss, undefined, carol, carol, true);
    //         await deposit(1, carol, weiToEth(await crss_bnb.balanceOf(carol.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(carol.address))/100000, crss, undefined, carol, carol, true);
    //         await deposit(2, carol, weiToEth(await crss_mck.balanceOf(carol.address))/10 );

    //         await deposit(0, alice, 10);
    //         await deposit(1, bob, 10);
    //         await deposit(2, carol, 10);

    //       });

    //       it("Round 3. Alice, Bob, and Carol swapped a big amount of Bnb for Crss, and staked the Crss tokens.\n".green, async function () {
    //         let report, crssAmount, safeOne = 0.99999;
    //         console.log(`\tThe swap amount of Bnb to swap is chosen not to violate price control`.green);

    //         [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(alice.address))/100000,  crss, undefined, alice, alice, true);
    //         await deposit(1, alice, weiToEth(await crss_bnb.balanceOf(alice.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(alice.address))/100000, crss, undefined, alice, alice, true);
    //         await deposit(2, alice, weiToEth(await crss_mck.balanceOf(alice.address))/10 );

    //          [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(bob.address))/100000,  crss, undefined, bob, bob, true);
    //         await deposit(1, bob, weiToEth(await crss_bnb.balanceOf(bob.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(bob.address))/100000, crss, undefined, bob, bob, true);
    //         await deposit(2, bob, weiToEth(await crss_mck.balanceOf(bob.address))/10 );

    //         [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(carol.address))/100000,  crss, undefined, carol, carol, true);
    //         await deposit(1, carol, weiToEth(await crss_bnb.balanceOf(carol.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(carol.address))/100000, crss, undefined, carol, carol, true);
    //         await deposit(2, carol, weiToEth(await crss_mck.balanceOf(carol.address))/10 );

    //         await deposit(0, alice, 10);
    //         await deposit(1, bob, 10);
    //         await deposit(2, carol, 10);
    //       });


    //       it("WithdrawVest, MassHarvest, MassStake, MassCompound.\n".green, async function () {
    //         switchCollectOption(2, alice, "OffOff");
    //         switchCollectOption(1, bob, "OffOff");
    //         switchCollectOption(0, carol, "OffOff");
    //         mintBlocks(100);

    //         await stakeAccumulated(1, alice);
    //         await stakeAccumulated(2, alice);   
    //         await stakeAccumulated(0, bob);
    //         await stakeAccumulated(0, bob);
    //         await stakeAccumulated(1, carol);
    //         await stakeAccumulated(2, carol);

    //         await deposit(0, alice, 10);

    //         await massHarvestRewards(alice);
    //         await mintBlocks(10);
    //         await massHarvestRewards(alice);
    //         await mintBlocks(10);
    //         await massCompoundRewards(bob);
    //         await mintBlocks(10);
    //         await massCompoundRewards(carol);
    //         await mintBlocks(10);
    //         await massStakeRewards(alice);
    //         await mintBlocks(10);
    //         await massStakeRewards(bob);
    //         await mintBlocks(10);
    //         await massCompoundRewards(carol);


    //         await massHarvestRewards(alice);
    //         await massHarvestRewards(alice);
    //         await massCompoundRewards(bob);
    //         await massCompoundRewards(carol);
    //         await massStakeRewards(alice);
    //         await massStakeRewards(bob);
    //         await massCompoundRewards(carol);

    //       });

    //       it("Round 4. Alice, Bob, and Carol swapped a big amount of Bnb for Crss, and staked the Crss tokens.\n".green, async function () {
    //         let report, crssAmount, safeOne = 0.99999;
    //         console.log(`\tThe swap amount of Bnb to swap is chosen not to violate price control`.green);

    //         [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(alice.address))/100000,  crss, undefined, alice, alice, true);
    //         await deposit(1, alice, weiToEth(await crss_bnb.balanceOf(alice.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(alice.address))/100000, crss, undefined, alice, alice, true);
    //         await deposit(2, alice, weiToEth(await crss_mck.balanceOf(alice.address))/10 );

    //          [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(bob.address))/100000,  crss, undefined, bob, bob, true);
    //         await deposit(1, bob, weiToEth(await crss_bnb.balanceOf(bob.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(bob.address))/100000, crss, undefined, bob, bob, true);
    //         await deposit(2, bob, weiToEth(await crss_mck.balanceOf(bob.address))/10 );

    //         [report, crssAmount] = await test_swap(wbnb, weiToEth(await ethers.provider.getBalance(carol.address))/100000,  crss, undefined, carol, carol, true);
    //         await deposit(1, carol, weiToEth(await crss_bnb.balanceOf(carol.address))/10 );
    //         [report, crssAmount] = await test_swap(mock, weiToEth(await mock.balanceOf(carol.address))/100000, crss, undefined, carol, carol, true);
    //         await deposit(2, carol, weiToEth(await crss_mck.balanceOf(carol.address))/10 );

    //         await deposit(0, alice, 10);
    //         await deposit(1, bob, 10);
    //         await deposit(2, carol, 10);
    //       });


    //       it("WithdrawVest, MassHarvest, MassStake, MassCompound.\n".green, async function () {
    //         switchCollectOption(0, alice, "OffOff");
    //         switchCollectOption(1, bob, "OffOff");
    //         switchCollectOption(2, carol, "OffOff");
    //         mintBlocks(100);

    //         await deposit(1, alice, 10);

    //         // await withdrawVest(0, alice, 10);
    //         // await withdrawVest(0, alice, 100000);
    //         // await withdrawVest(0, bob, 10000000);
    //         // await withdrawVest(0, bob, 1000000);
    //         // await withdrawVest(1, carol, 1000000);
    //         // await withdrawVest(1, carol, 1000000);

    //         // await withdrawVest(2, alice, 10);
    //         // await withdrawVest(1, alice, 100000);
    //         // await withdrawVest(2, bob, 10000000);
    //         // await withdrawVest(0, bob, 1000000);
    //         // await withdrawVest(1, carol, 1000000);
    //         // await withdrawVest(0, carol, 1000000);

    //       });

    //       it("Crss/Bnb staking pool works with rewards.\n".green, async function () {

    //         await deposit(1, alice, 10);
    //         await withdraw(1, alice, 5);

    //         await mintBlocks(10);

    //         await deposit(1, alice, 0);
    //         await withdraw(1, alice, 0);

    //         await deposit(1, bob, 10);
    //         await deposit(1, carol, 10);
    //         await withdraw(1, bob, 9);
    //         await withdraw(1, carol, 9);

    //         await deposit(0, alice, 10);  // ok ----------------------------------------------

    //         await mintBlocks(10);
    //         await switchCollectOption(1, alice, "OffOff"); // ok

    //         //
    //         await deposit(1, alice, 15);  // ok ----------------------------------------------- ????????????????
    //         //await deposit(1, alice, 10);  // ok
    //         //await withdraw(1, alice, 10);  // ok

    //         await deposit(0, alice, 10);  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    //         await withdraw(1, alice, 20); // ok

    //         await mintBlocks(10);

    // //        await deposit(0, alice, 10);  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    //         await deposit(1, bob, 10);  // ok

    //         await withdraw(1, alice, 5);  // ok

    //         await deposit(1, alice, 0); // ok
    //         await withdraw(1, alice, 0);  // ok

    //         await mintBlocks(10);

    //         await patrol(carol);

    // //        await deposit(0, alice, 10);  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    //         await deposit(1, bob, 10);  // ok
    //         await deposit(1, carol, 10);  // ok
    //         await withdraw(1, bob, 9);  // ok
    //         await withdraw(1, carol, 9);  // ok

    //         await switchCollectOption(1, bob, "OnOn");  // ok

    //         await deposit(1, alice, 10);  // ok
    //         await deposit(1, alice, 0); // ok
    //         await deposit(1, alice, 15);  // ok
    //         await withdraw(1, alice, 10); // ok

    //         await mintBlocks(10);

    //         await deposit(1, bob, 10);  // ok

    //         await withdraw(1, alice, 5);  // ok

    //         await deposit(1, alice, 0); // ok
    //         await withdraw(1, alice, 0);  // ok

    //         await mintBlocks(10);

    //         await deposit(0, alice, 10);  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    //         await deposit(1, bob, 10);
    //         await deposit(1, carol, 10);
    //         await withdraw(1, bob, 9);
    //         await withdraw(1, carol, 9);

    //         await switchCollectOption(1, carol, "OnOff");

    //         await deposit(1, alice, 10);
    //         await deposit(1, alice, 0);
    //         await deposit(1, alice, 15);
    //       });

    //       it("Emergency withdraw.\n".green, async function () {

    //         mintBlocks(100);
    //         await vestAccumulated(1, alice);
    //         //await compoundAccumulated(1, bob);
    //         await harvestAccumulated(1, carol);

    //         await patrol(carol);

    //         await emergencyWithdraw(0, alice);
    //         await emergencyWithdraw(0, bob);
    //         await emergencyWithdraw(0, carol);

    //         await emergencyWithdraw(1, alice);
    //         await emergencyWithdraw(1, bob);
    //         await emergencyWithdraw(1, carol);

    //         await emergencyWithdraw(2, alice);
    //         await emergencyWithdraw(2, bob);
    //         await emergencyWithdraw(2, carol);

    //         await withdraw(2, alice, 100);
    //         await withdraw(2, bob, 100);
    //         await withdraw(2, carol, 100);

    //         await deposit(0, alice, 100);
    //         await deposit(0, bob, 100);
    //         await deposit(0, carol, 100);

    //         await deposit(1, alice, 100);
    //         await deposit(1, bob, 100);
    //         await deposit(1, carol, 100);

    //         await deposit(2, alice, 100);
    //         await deposit(2, bob, 100);
    //         await deposit(2, carol, 100);

    //         await patrol(carol);

    //         await withdraw(0, alice, 100);
    //         await withdraw(0, bob, 100);
    //         await withdraw(0, carol, 100);

    //         await withdraw(1, alice, 100);
    //         await withdraw(1, bob, 100);
    //         await withdraw(1, carol, 100);

    //         await withdraw(2, alice, 100);
    //         await withdraw(2, bob, 100);
    //         await withdraw(2, carol, 100);
    //       });

    //       it("Add Crss_Mock2 pool.\n".green, async function () {
    //         tx = farm.connect(owner).add(1600, crss_mck2.address, true, 1000);
    //         (await tx).wait();

    //         await withdraw(3, alice, 100);
    //         await withdraw(3, bob, 100);
    //         await withdraw(3, carol, 100);

    //         await deposit(3, alice, 100);
    //         await deposit(3, bob, 100);
    //         await deposit(3, carol, 100);

    //         await deposit(1, alice, 100);
    //         await deposit(1, bob, 100);
    //         await deposit(1, carol, 100);
    //       });

    it("Replace Farm.\n".green, async function () {

      // Farm Deployment.
      const startBlock = (await ethers.provider.getBlock("latest")).number + 10;
      farm = await deployFarm(
        owner,
        crss.address,
        ethToWei(crssPerBlock),
        startBlock,
        wireLib.address,
        farmLib.address
      );
      consoleLogWithTab(`Farm deployed at: ${farm.address}`);

      // XCRSS Deployment.
      xCrss = await deployXCrss(owner, "Crosswise xCrss Token", "xCRSS", wireLib.address);
      consoleLogWithTab(`XCRSS deployed at: ${xCrss.address}`);

      await setupNodeChain();
      await crss.begin(zero_address);

      tx = farm.connect(owner).add(30, crss_bnb.address, true, 2000);
      (await tx).wait();
      let param = await farm.farmParams()
      console.log("Total Alloc: ", param.totalAllocPoint)
      tx = farm.connect(owner).add(20, crss_mck.address, true, 1000);
      (await tx).wait();
      param = await farm.farmParams()
      console.log("Total Alloc: ", param.totalAllocPoint)
      tx = farm.connect(owner).add(10, crss_mck2.address, true, 1000);
      (await tx).wait();
      param = await farm.farmParams()
      console.log("Total Alloc: ", param.totalAllocPoint)
    });

    it("Continue after replacing Farm.\n".green, async function () {
      // await deposit(0, alice, 10);
      // await deposit(0, alice, 0);

      await deposit(1, alice, 10);
      await deposit(1, alice, 0);

      await deposit(2, alice, 10);
      await deposit(2, alice, 0);

      await deposit(3, alice, 10);
      await deposit(3, alice, 0);

      await patrol(carol);

      await switchCollectOption(1, alice, "OnOn");

      const oldBal = await crss.balanceOf("0x5cA00f843cd9649C41fC5B71c2814d927D69Df95")
      await mintBlocks(100);

      await deposit(1, alice, 0);
      console.log("Bob Balance: ", await crss_bnb.balanceOf(alice.address), await crss_bnb.balanceOf(bob.address))
      const newBal = await crss.balanceOf("0x5cA00f843cd9649C41fC5B71c2814d927D69Df95")
      console.log("Balance: ", oldBal, newBal)
      console.log("Team Emission: ", utils.formatEther(newBal.sub(oldBal)))
      await mintBlocks(100);
      await deposit(1, alice, 0);

    });

    it("Test Referral", async () => {
      await referral.setPayer(farm.address)
      await farm.setBackendCaller(owner.address)
      await farm.changeReferrer(alice.address, bob.address)
      await deposit(1, alice, 10);
      await mintBlocks(100);
      await deposit(1, alice, 0);
      const commision1 = await referral.outstandingCommissions(alice.address)
      const commision2 = await referral.outstandingCommissions(bob.address)
      console.log("Alice commision: ", commision1)
      console.log("Bob commision: ", commision2)
    })

    it("Test Crss per block", async () => {
      await farm.setCrssPerBlock(utils.parseEther("1"))
      param = await farm.farmParams()
      console.log("Crss Per Block: ", param.crssPerBlock)
      await expect(farm.setCrssPerBlock(utils.parseEther("1.01"))).to.be.revertedWith("Invalid Crss Per Block")

    })

    // it("Test Enlist and Delist.\n".green, async function () {
    //   tx = factory.connect(alice).changeTokenStatus(crss.address, ListStatus.indexOf("Delisted"));
    //   expectReverted(tx);
    //   console.log("\tAlice couldn't delist a token.");

    //   await enlistToken(crss, owner);
    //   console.log("\tOwner could enlist the Crss token.");

    //   await deposit(0, alice, 10);
    //   await deposit(0, alice, 0);

    //   await delistToken(crss, owner);
    //   tx = farm.connect(alice).deposit(1, ethToWei(10));
    //   expectReverted(tx);
    //   console.log("\tAlice couldn't deposit on a pool of delisted token.");

    //   await enlistToken(crss, owner);
    //   console.log("\tOwner enlisted the Crss token back.");

    //   await enlistToken(crss, owner);
    //   await deposit(1, alice, 10);
    //   console.log("\tAlice could deposit on a pool of enlisted-back token.");

    //   await deposit(1, alice, 0);

    //   await deposit(2, alice, 10);
    //   await deposit(2, alice, 0);

    //   await deposit(3, alice, 10);
    //   await deposit(3, alice, 0);

    //   await patrol(carol);

    //   await switchCollectOption(1, alice, "OnOn");
    //   await mintBlocks(100);
    //   await deposit(1, bob, 10);
    //   await mintBlocks(100);
    //   await deposit(1, alice, 0);

    // });

    // it("Gas test.\n".green, async function () {
    //   tx = farm.connect(carol).periodicPatrol();
    //   (await tx).wait();

    // });

  }
);

