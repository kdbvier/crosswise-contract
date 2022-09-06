import { assert, expect } from "chai";

import hre, { deployments, ethers, waffle } from "hardhat";
import { BigNumber } from "ethers";
import "@nomiclabs/hardhat-ethers";

import { CrossFactory } from "../types/CrossFactory";
import { CrossRouter } from "../types/CrossRouter";
import { CrssToken } from "../types/CrssToken";
import { WBNB as WBNBT } from "../types/WBNB";
import { MockTransfer } from "../types/MockTransfer";
import { XCrssToken } from "../types/XCrssToken";
import { MockToken } from "../types/MockToken";

describe("CrssToken test", async () => {
  const [owner, userA, userB, userC, devTo, buybackTo] = waffle.provider.getWallets();

  const setupTest = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture();

    const Factory = await hre.ethers.getContractFactory("CrossFactory");
    const factory = (await Factory.deploy(owner.address)) as CrossFactory;
    await factory.deployed();

    const WBNB = await hre.ethers.getContractFactory("WBNB");
    const wbnb = (await WBNB.deploy()) as WBNBT;
    await wbnb.deployed();

    const Router = await hre.ethers.getContractFactory("CrossRouter");
    const router = (await Router.deploy(factory.address, wbnb.address)) as CrossRouter;
    await router.deployed();

    await factory.setRouter(router.address);

    const liquifyThreshold = hre.ethers.utils.parseEther("100000");

    const Crss = await hre.ethers.getContractFactory("CrssToken");
    const crss = (await hre.upgrades.deployProxy(Crss, [
      router.address,
      devTo.address,
      buybackTo.address,
      liquifyThreshold,
    ])) as CrssToken;
    await crss.deployed();

    await router.setCrssContract(crss.address);

    const XCrss = await hre.ethers.getContractFactory("xCrssToken");
    const xCrss = (await hre.upgrades.deployProxy(XCrss, [crss.address])) as XCrssToken;
    await xCrss.deployed();

    const MockTransfer = await hre.ethers.getContractFactory("MockTransfer");
    const mockTransfer = (await MockTransfer.deploy(crss.address)) as MockTransfer;
    await mockTransfer.deployed();

    return {
      factory,
      router,
      crss,
      wbnb,
      xCrss,
      mockTransfer,
    };
  });

  let factory: CrossFactory,
    router: CrossRouter,
    crss: CrssToken,
    wbnb: WBNBT,
    xCrss: XCrssToken,
    mockTransfer: MockTransfer;

  let farm: any;
  const berryAddress = "0x000000000000000000000000000000000000dEaD";

  before("load fixture loader", async () => {
    ({ factory, router, crss, wbnb, xCrss, mockTransfer } = await setupTest());

    farm = {
      address: owner.address,
    };
  });

  it("should have correct name and symbol and decimal", async function () {
    console.log("start test");
    const name = await crss.name();
    const symbol = await crss.symbol();
    const decimals = await crss.decimals();
    expect(name, "Crosswise Token");
    expect(symbol, "CRSS");
    expect(decimals, "18");
  });

  describe("callable modifier", async function () {
    it("setFarm should be callable by owner", async function () {
      console.log("userA is trying to set farm address, should revert");
      await expect(crss.connect(userA).setFarm(owner.address)).to.be.reverted;
    });

    it("setDexSession should be callable by router", async function () {
      console.log("owner is trying to set dex session, should revert");
      await expect(crss.connect(owner).setDexSession(0, 1)).to.be.revertedWith("Cross: FORBIDDEN");
      console.log("userA is trying to set dex session, should revert");
      await expect(crss.connect(userA).setDexSession(0, 1)).to.be.revertedWith("Cross: FORBIDDEN");
    });

    it("setKnownDexContract should be callable by owner", async function () {
      console.log("userA is trying to set userB as known dex contract, should revert");
      await expect(crss.connect(userA).setKnownDexContract(userB.address, true)).to.be.reverted;
      console.log("owner is trying to set userA as known dex contract, should not revert");
      await crss.connect(owner).setKnownDexContract(userA.address, true);
    });

    // it("delegate should be callable by owner", async function () {
    //   console.log("userA is trying to set userB as delegate, should revert");
    //   await expect(crss.connect(userA).delegate(userB.address)).to.be.reverted;
    //   console.log(
    //     "owner is trying to set userB as delegate, should not revert"
    //   );
    //   await crss.connect(owner).delegate(userA.address);
    // });

    it("setRouter should be callable by router", async function () {
      // @todo, after add liquidity, setRouter should not be reverted
    });
  });

  describe("mint/burn/berry test", async function () {
    before(async function () {
      await crss.connect(owner).setFarm(owner.address);
    });

    beforeEach("burn all tokens", async function () {
      await crss.connect(owner).burn(berryAddress, await crss.balanceOf(berryAddress));
      await crss.connect(owner).burn(crss.address, await crss.balanceOf(crss.address));
      await crss.connect(owner).burn(owner.address, await crss.balanceOf(owner.address));
      await crss.connect(owner).burn(userA.address, await crss.balanceOf(userA.address));
      await crss.connect(owner).burn(userB.address, await crss.balanceOf(userB.address));
      await crss.connect(owner).burn(userC.address, await crss.balanceOf(userC.address));
      await crss.connect(owner).burn(devTo.address, await crss.balanceOf(devTo.address));
      await crss.connect(owner).burn(buybackTo.address, await crss.balanceOf(buybackTo.address));
      await crss.connect(owner).burn(mockTransfer.address, await crss.balanceOf(mockTransfer.address));
    });

    after(async function () {
      await crss.connect(owner).setFarm(farm.address);
    });

    it("should only allow farm to mint token", async function () {
      assert.equal(await crss.farm(), owner.address);
      console.log("farm is minting 100 tokens to userA");
      await expect(crss.connect(owner).mint(userA.address, "100")).to.be.not.reverted;
      console.log("farm is minting 1000 tokens to userB");
      await expect(crss.connect(owner).mint(userB.address, "1000")).to.be.not.reverted;
      console.log("userB is minting 1000 tokens to userC, should revert");
      await expect(crss.connect(userB).mint(userC.address, "1000")).to.be.revertedWith(
        "Cross: FORBIDDEN" // "Ownable: caller is not the owner"
      );
      const totalSupply = await crss.totalSupply();
      const userABal = await crss.balanceOf(userA.address);
      const userBBal = await crss.balanceOf(userB.address);
      const userCBal = await crss.balanceOf(userC.address);
      expect(totalSupply).to.equal("1100");
      expect(userABal).to.be.equal("100");
      expect(userBBal).to.be.equal("1000");
      expect(userCBal).to.be.equal("0");
    });

    it("should only allow owner to burn token", async function () {
      console.log("owner is minting 1000 tokens to userA");
      await crss.connect(owner).mint(userA.address, "1000");

      const totalSupply = await crss.totalSupply();
      const userABal = await crss.balanceOf(userA.address);
      console.log("totalSupply should be 1000");
      expect(totalSupply).to.be.equal("1000");
      console.log("userA's balance should be 1000");
      expect(userABal).to.be.equal("1000");

      console.log("owner is burning 1000 tokens from userA");
      await crss.connect(owner).burn(userA.address, "1000");
      // total supply will be decreased by burn amount
      const newTotalSupply = await crss.totalSupply();
      console.log("totalSupply should be zero");
      expect(newTotalSupply).to.be.equal("0");
    });

    it("should only allow owner to berry token", async function () {
      console.log("owner is minting 1000 tokens to userA");
      await crss.connect(owner).mint(userA.address, "1000");

      const totalSupply = await crss.totalSupply();
      const userABal = await crss.balanceOf(userA.address);
      expect(totalSupply).to.be.equal("1000");
      expect(userABal).to.be.equal("1000");

      console.log("owner is berrying 1000 tokens from userA");
      crss.connect(owner).berry(userA.address, "1000");
      // total supply should not be changed after berry
      const newTotalSupply = await crss.totalSupply();
      console.log("totalSupply should be changed");
      expect(newTotalSupply).to.be.equal("1000");
    });
  });

  describe("transfer test", async function () {
    before(async function () {
      await crss.connect(owner).setFarm(owner.address);
    });

    beforeEach("burn all tokens", async function () {
      await crss.connect(owner).burn(berryAddress, await crss.balanceOf(berryAddress));
      await crss.connect(owner).burn(crss.address, await crss.balanceOf(crss.address));
      await crss.connect(owner).burn(owner.address, await crss.balanceOf(owner.address));
      await crss.connect(owner).burn(userA.address, await crss.balanceOf(userA.address));
      await crss.connect(owner).burn(userB.address, await crss.balanceOf(userB.address));
      await crss.connect(owner).burn(userC.address, await crss.balanceOf(userC.address));
      await crss.connect(owner).burn(devTo.address, await crss.balanceOf(devTo.address));
      await crss.connect(owner).burn(buybackTo.address, await crss.balanceOf(buybackTo.address));
      await crss.connect(owner).burn(mockTransfer.address, await crss.balanceOf(mockTransfer.address));
    });

    after(async function () {
      await crss.connect(owner).setFarm(farm.address);
    });

    it("should supply token transfers properly", async function () {
      console.log(">>> totalSupply is ", (await crss.totalSupply()).toNumber());
      console.log("owner is minting 1000 tokens to userA");
      await crss.connect(owner).mint(userA.address, "1000");
      console.log("owner is minting 10000 tokens to userB");
      await crss.connect(owner).mint(userB.address, "10000");

      const maxTransferAmount = await crss.maxTransferAmount();
      console.log(">>> maxTransferAmount is ", maxTransferAmount.toNumber());
      console.log(">>> totalSupply is ", (await crss.totalSupply()).toNumber());

      console.log("userA is transfering 10 tokens to userC");
      await crss.connect(userA).transfer(userC.address, "10");
      console.log("userB is transfering 100 tokens to userC");
      await crss.connect(userB).transfer(userC.address, "50");

      const totalSupply = await crss.totalSupply();
      const userABal = await crss.balanceOf(userA.address);
      const userBBal = await crss.balanceOf(userB.address);
      const userCBal = await crss.balanceOf(userC.address);
      console.log("totalSupply should be 11000 tokens");
      expect(totalSupply).to.be.equal("11000");
      console.log("userA' balance should be 990 tokens");
      expect(userABal).to.be.equal("990");
      console.log("userB' balance should be 9950 tokens");
      expect(userBBal).to.be.equal("9950");
      console.log("userC' balance should be 60 tokens");
      expect(userCBal).to.be.equal("60");
    });

    it("should fail if you try to do bad transfers", async function () {
      console.log("owner is minting 100 tokens to userA");
      await crss.connect(owner).mint(userA.address, "100");

      console.log(
        "userA is transfering 110 tokens to userB, should revert with exception `CrssToken: Exceed MaxTransferAmount`"
      );
      await expect(crss.connect(userA).transfer(userB.address, "110")).to.be.revertedWith(
        "CrssToken: Exceed MaxTransferAmount"
      );

      console.log("owner is minting 100000 tokens to userC to make maxTransferAmount bigger");
      await crss.connect(owner).mint(userC.address, "100000");

      console.log(
        "userA is transfering 110 tokens to userB, should revert with exception `ERC20: transfer amount exceeds balance`"
      );
      await expect(crss.connect(userA).transfer(userB.address, "110")).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance"
      );
      console.log(
        "userB is transfering 10 tokens to userC, should revert with exception `ERC20: transfer amount exceeds balance`"
      );
      await expect(crss.connect(userB).transfer(userC.address, "10")).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("should fail if transfer amount exceed allowance", async function () {
      console.log("owner is minting 10000 tokens to userA");
      await crss.connect(owner).mint(userA.address, "10000");
      console.log(
        "contract is transfering 10000 tokens from userA to userB, should revert with `ERC20: transfer amount exceeds allowance`"
      );
      await expect(mockTransfer.transferFrom(userA.address, userB.address, "10000")).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance"
      );

      console.log("contract is getting approve 10000 tokens from userA");
      await crss.connect(userA).approve(mockTransfer.address, "10000");
      await mockTransfer.transferFrom(userA.address, userB.address, "10");
      console.log("userB's balance should be 10 tokens");
      expect(await crss.balanceOf(userB.address)).to.be.equal("10");
    });

    it("should set rate only by owner", async function () {
      /// @todo
      expect(false).to.be.equal(true);
    });

    /// @todo
    // it("should accumulate the transfer amount per user", async function () {
    //   console.log("owner is minting 10000 tokens itself");
    //   await crss.connect(owner).mint(owner.address, "10000");

    //   // transfer tokens from owner to userA
    //   console.log("owner is transfering 7000 tokens to userA");
    //   await crss.connect(owner).transfer(userA.address, "7000");
    //   console.log("should not be accumulated for owner");
    //   console.log("length of transfersInOneTx should be 0");
    //   const transfersInOneTx0 = await crss.transfersInOneTx(0);
    //   expect(transfersInOneTx0.account).to.be.equal(
    //     ethers.constants.AddressZero
    //   );
    //   expect(transfersInOneTx0.sent).to.be.equal(ethers.constants.Zero);
    //   expect(transfersInOneTx0.received).to.be.equal(ethers.constants.Zero);

    //   // transfer tokens from userA to owner
    //   console.log("userA is transfering 3000 tokens back to owner");
    //   await crss.connect(userA).transfer(owner.address, "3000");
    //   console.log("should not be accumulated for userA");
    //   console.log("length of transfersInOneTx should be 0");
    //   const transfersInOneTx0_ = await crss.transfersInOneTx(0);
    //   expect(transfersInOneTx0_.account).to.be.equal(
    //     ethers.constants.AddressZero
    //   );
    //   expect(transfersInOneTx0_.sent).to.be.equal(ethers.constants.Zero);
    //   expect(transfersInOneTx0_.received).to.be.equal(ethers.constants.Zero);

    //   // transfer tokens from userA to userB
    //   console.log("userA is transfering 40 tokens to userB");
    //   await crss.connect(userA).transfer(userB.address, "40");
    //   console.log("length of transfersInOneTx should be 2");
    //   // [1] should not be empty if the length is 2
    //   const transfersInOneTx1 = await crss.transfersInOneTx(1);
    //   expect(transfersInOneTx1.account).to.be.not.equal(
    //     ethers.constants.AddressZero
    //   );
    //   // [2] should be empty if the length is 2
    //   const transfersInOneTx2 = await crss.transfersInOneTx(2);
    //   expect(transfersInOneTx2.account).to.be.equal(
    //     ethers.constants.AddressZero
    //   );
    //   expect(transfersInOneTx2.sent).to.be.equal(ethers.constants.Zero);
    //   expect(transfersInOneTx2.received).to.be.equal(ethers.constants.Zero);
    //   console.log("userA's accumulated amount should be 40 tokens");
    //   expect((await crss.transfersInOneTx(0)).account).to.be.equal(
    //     userA.address
    //   );
    //   expect((await crss.transfersInOneTx(0)).sent).to.be.equal("40");
    //   console.log("userB's accumulated amount should be 40 tokens");
    //   expect((await crss.transfersInOneTx(1)).account).to.be.equal(
    //     userB.address
    //   );
    //   expect((await crss.transfersInOneTx(1)).received).to.be.equal("40");
    // });

    it("whitelisted address should allow to transfer large amount", async function () {
      /// @todo
      expect(false).to.be.equal(true);
    });

    /// @todo
    // it("accumulated amount should not affect on another address", async function () {
    //   console.log("owner is minting 30000 tokens to userA");
    //   await crss.connect(owner).mint(userA.address, "30000");
    //   console.log("owner is minting 10000 tokens to userB");
    //   await crss.connect(owner).mint(userA.address, "10000");

    //   // transfer tokens from userA to userC
    //   console.log("userA is transfering 6000 tokens to userC");
    //   await crss.connect(userA).transfer(userC.address, "6000");
    //   console.log("length of transfersInOneTx should be 2");
    //   await expect(crss.transfersInOneTx(2)).to.be.reverted;
    //   console.log("userA's accumulated amount should be 6000 tokens");
    //   expect((await crss.transfersInOneTx(0)).account).to.be.equal(
    //     userA.address
    //   );
    //   expect((await crss.transfersInOneTx(0)).sent).to.be.equal("6000");
    //   console.log("userC's accumulated amount should be 6000 tokens");
    //   expect((await crss.transfersInOneTx(1)).account).to.be.equal(
    //     userC.address
    //   );
    //   expect((await crss.transfersInOneTx(1)).received).to.be.equal("6000");

    //   // transfer tokens from userB to userC, should recalculate again
    //   console.log("userB is transfering 4000 tokens to userC");
    //   await crss.connect(userB).transfer(userC.address, "4000");
    //   console.log("length of transfersInOneTx should be 2");
    //   await expect(crss.transfersInOneTx(2)).to.be.reverted;
    //   console.log("userB's accumulated amount should be 4000 tokens");
    //   expect((await crss.transfersInOneTx(0)).account).to.be.equal(
    //     userB.address
    //   );
    //   expect((await crss.transfersInOneTx(0)).sent).to.be.equal("4000");
    //   console.log("userC's accumulated amount should be 4000 tokens");
    //   expect((await crss.transfersInOneTx(1)).account).to.be.equal(
    //     userC.address
    //   );
    //   expect((await crss.transfersInOneTx(1)).received).to.be.equal("4000");
    // });

    /// @todo
    // it("accumulated amount should be calculated per same account", async function () {
    //   console.log("owner is minting 30000 tokens to userA");
    //   await crss.connect(owner).mint(userA.address, "30000");
    //   console.log("owner is minting 10000 tokens to userB");
    //   await crss.connect(owner).mint(userA.address, "10000");

    //   console.log(
    //     "userA is transfering 6000 tokens to userB and transfering 4000 tokens to userC continuously"
    //   );
    //   await crss.connect(userA).approve(mockTransfer.address, "10000000");
    //   await mockTransfer
    //     .connect(userA)
    //     .transferCross(
    //       userA.address,
    //       userB.address,
    //       userC.address,
    //       "6000",
    //       "4000"
    //     );

    //   // transfer tokens from userA to userB
    //   console.log("length of transfersInOneTx should be 3");
    //   await expect(crss.transfersInOneTx(3)).to.be.reverted;
    //   console.log("userA's accumulated amount should be 10000 tokens");
    //   expect((await crss.transfersInOneTx(0)).account).to.be.equal(
    //     userA.address
    //   );
    //   expect((await crss.transfersInOneTx(0)).sent).to.be.equal("10000");
    //   console.log("userB's accumulated amount should be 6000 tokens");
    //   expect((await crss.transfersInOneTx(1)).account).to.be.equal(
    //     userB.address
    //   );
    //   expect((await crss.transfersInOneTx(1)).received).to.be.equal("6000");
    //   expect((await crss.transfersInOneTx(2)).account).to.be.equal(
    //     userC.address
    //   );
    //   expect((await crss.transfersInOneTx(2)).received).to.be.equal("4000");
    // });

    it("should revert if exceed the max transfer amount", async function () {
      console.log("owner is minting 10000 tokens to userA");
      await crss.connect(owner).mint(userA.address, "10000");

      const maxTransferAmount = await crss.maxTransferAmount();
      console.log("max transfer amount is ", maxTransferAmount.toString());

      console.log(
        "userA is transfering 6000 tokens to userB, should revert with `CrssToken: Exceed MaxTransferAmount`"
      );
      await expect(crss.connect(userA).transfer(userB.address, "6000")).to.be.revertedWith(
        "CrssToken: Exceed MaxTransferAmount"
      );

      console.log("userA is transfering less than maxTransferAmount to userB, should not revert");
      await crss.connect(userA).transfer(userB.address, maxTransferAmount.toNumber() - 1);

      console.log(
        "userA is transfering maxTransferAmount to userB, should revert with `CrssToken: Exceed MaxTransferAmount`"
      );
      await expect(crss.connect(userA).transfer(userB.address, maxTransferAmount)).to.be.revertedWith(
        "CrssToken: Exceed MaxTransferAmount"
      );
    });

    it("should revert if exceed the max transfer amount in one transaction", async function () {
      console.log("owner is minting 10000 tokens to userA");
      await crss.connect(owner).mint(userA.address, "10000");

      const maxTransferAmount = await crss.maxTransferAmount();
      console.log("max transfer amount is ", maxTransferAmount.toString());

      console.log(
        "userA is transfering 3000 tokens to userB and transfering 2500 tokens to userC continuously, should revert with `CrssToken: Exceed MaxTransferAmount`"
      );
      await crss.connect(userA).approve(mockTransfer.address, "1000000");
      await expect(
        mockTransfer.connect(userA).transferCross(userA.address, userB.address, userC.address, "3000", "2500")
      ).to.be.revertedWith("CrssToken: Exceed MaxTransferAmount");
    });

    it("owner should allow to transfer in excess of max transfer amount", async function () {
      console.log("owner is minting 10000 tokens itself");
      await crss.connect(owner).mint(owner.address, "10000");

      const maxTransferAmount = await crss.maxTransferAmount();
      console.log("max transfer amount is ", maxTransferAmount.toString());

      console.log(
        "owner is transfering 3000 tokens to userA and transfering 2500 tokens to userB continuously, should not revert"
      );
      await crss.connect(owner).approve(mockTransfer.address, "1000000");
      mockTransfer.connect(owner).transferCross(owner.address, userA.address, userB.address, "3000", "2500");

      await crss.connect(userA).approve(mockTransfer.address, "1000000");
      await expect(mockTransfer.connect(userA).transferFrom(userA.address, userB.address, "3000")).to.be.revertedWith(
        "CrssToken: Exceed MaxTransferAmount"
      );
    });
  });

  /// @todo
  describe("transfer fee test", async function () {
    let devFeeRate: BigNumber, liquidityFeeRate: BigNumber, buybackFeeRate: BigNumber;

    let tokenA: MockToken, tokenB: MockToken, tokenAtokenB: string, crssBNB: string, crssTokenA: string;

    before("check default fee", async function () {
      console.log("checking default fees in crss token");
      devFeeRate = await crss.devFeeRate();
      liquidityFeeRate = await crss.liquidityFeeRate();
      buybackFeeRate = await crss.buybackFeeRate();

      assert.equal(devFeeRate.eq(BigNumber.from("4")), true);
      assert.equal(liquidityFeeRate.eq(BigNumber.from("3")), true);
      assert.equal(buybackFeeRate.eq(BigNumber.from("3")), true);

      console.log("dev fee rate is 0.04%");
      console.log("liquidity fee rate is 0.03%");
      console.log("buy back fee rate is 0.03%");

      console.log("creating tokenA, tokenB");
      const MockToken = await hre.ethers.getContractFactory("MockToken");
      tokenA = (await MockToken.deploy("tokenA", "tokenB")) as MockToken;
      tokenB = (await MockToken.deploy("tokenB", "tokenB")) as MockToken;

      console.log("owner is minting crss to owner");
      await crss.connect(owner).mint(owner.address, ethers.utils.parseEther("100000"));
      console.log("owner is minting tokenA to owner");
      await tokenA.connect(owner).mint(owner.address, ethers.utils.parseEther("100000"));
      console.log("owner is minting tokenB to owner");
      await tokenB.connect(owner).mint(owner.address, ethers.utils.parseEther("100000"));
      console.log("owner is approving tokenA to router");
      await tokenA.connect(owner).approve(router.address, ethers.utils.parseEther("100000"));
      console.log("owner is approving tokenB to router");
      await tokenB.connect(owner).approve(router.address, ethers.utils.parseEther("100000"));
      console.log("owner is approving crss to router");
      await crss.connect(owner).approve(router.address, ethers.utils.parseEther("100000"));
      console.log("owner is approving wbnb to router");
      await wbnb.connect(owner).approve(router.address, ethers.utils.parseEther("100000"));

      // tokenA + tokenB
      console.log("adding tokenA+tokenB liquidity through router");
      const block = await ethers.provider.getBlock("latest");
      await router.addLiquidity(
        tokenA.address,
        tokenB.address,
        ethers.utils.parseEther("500"),
        ethers.utils.parseEther("500"),
        0,
        0,
        owner.address,
        block.timestamp + 1000
      );
      console.log("getting pair address of tokenA and tokenB");
      tokenAtokenB = await factory.getPair(tokenA.address, tokenB.address);
      console.log("checking if pair address is known dex contract", await crss.knownDexContract(tokenAtokenB));
      console.log("checking if pair address is known pair contract", await crss.knownPairContract(tokenAtokenB));

      // crss + bnb
      console.log("adding crss+wbnb liquidity through router");
      const block2 = await ethers.provider.getBlock("latest");
      await router.addLiquidityETH(
        crss.address,
        ethers.utils.parseEther("500"),
        0,
        0,
        owner.address,
        block2.timestamp + 1000,
        {
          value: ethers.utils.parseEther("500"),
        }
      );
      console.log("getting pair address of crss and wbnb");
      crssBNB = await factory.getPair(crss.address, wbnb.address);
      console.log("checking if pair address is known dex contract", await crss.knownDexContract(crssBNB));
      console.log("checking if pair address is known pair contract", await crss.knownPairContract(crssBNB));

      // crss + tokenA
      console.log("adding crss+tokenA liquidity through router");
      const block3 = await ethers.provider.getBlock("latest");
      await router.addLiquidity(
        crss.address,
        tokenA.address,
        ethers.utils.parseEther("500"),
        ethers.utils.parseEther("500"),
        0,
        0,
        owner.address,
        block3.timestamp + 1000
      );
      console.log("getting pair address of crss and tokenA");
      crssTokenA = await factory.getPair(crss.address, wbnb.address);
      console.log("checking if pair address is known dex contract", await crss.knownDexContract(crssTokenA));
      console.log("checking if pair address is known pair contract", await crss.knownPairContract(crssTokenA));

      await crss.connect(owner).setFarm(owner.address);
    });

    beforeEach("burn all tokens", async function () {
      await crss.connect(owner).burn(berryAddress, await crss.balanceOf(berryAddress));
      await crss.connect(owner).burn(crss.address, await crss.balanceOf(crss.address));
      await crss.connect(owner).burn(owner.address, await crss.balanceOf(owner.address));
      await crss.connect(owner).burn(userA.address, await crss.balanceOf(userA.address));
      await crss.connect(owner).burn(userB.address, await crss.balanceOf(userB.address));
      await crss.connect(owner).burn(userC.address, await crss.balanceOf(userC.address));
      await crss.connect(owner).burn(devTo.address, await crss.balanceOf(devTo.address));
      await crss.connect(owner).burn(buybackTo.address, await crss.balanceOf(buybackTo.address));
      await crss.connect(owner).burn(mockTransfer.address, await crss.balanceOf(mockTransfer.address));
      await crss.connect(owner).burn(tokenAtokenB, await crss.balanceOf(tokenAtokenB));
      await crss.connect(owner).burn(crssBNB, await crss.balanceOf(crssBNB));
      await crss.connect(owner).burn(crssTokenA, await crss.balanceOf(crssTokenA));
    });

    after(async function () {
      await crss.connect(owner).setFarm(farm.address);
    });

    it("should pay liquidity/dev/buyback fee if user to user", async function () {
      console.log("owner is minting 1000000000 tokens to userA");
      await crss.connect(owner).mint(userA.address, "1000000000");

      console.log("userA is transfering 10000 tokens to userB");
      await crss.connect(userA).transfer(userB.address, "10000");
      console.log("balance of devTo should be 4 tokens"); // 0.04%
      expect(await crss.balanceOf(devTo.address)).to.be.equal("4");
      console.log("balance of buybackTo should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(buybackTo.address)).to.be.equal("3");
      console.log("balance of crss should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(crss.address)).to.be.equal("3");
      console.log("balance of userB should be 9990 tokens, paying liquidity fee");
      expect(await crss.balanceOf(userB.address)).to.be.equal("9990");
    });

    it("should pay liquidity/dev/buyback fee if user to tokenA+tokenB pool", async function () {
      // @todo, add liquidity
    });

    it("should not pay fee if user to crss+bnb pool", async function () {
      // @todo, add liquidity
    });

    it("should not pay fee if user to crss+tokenA pool", async function () {
      // @todo, add liquidity
    });

    it("should pay liquidity/dev/buyback fee if user to non-pool contract", async function () {
      console.log("owner is minting 1000000000 tokens to userA");
      await crss.connect(owner).mint(userA.address, "1000000000");

      console.log("userA is transfering 10000 tokens to contract");
      await crss.connect(userA).transfer(mockTransfer.address, "10000");
      console.log("balance of devTo should be 4 tokens"); // 0.04%
      expect(await crss.balanceOf(devTo.address)).to.be.equal("4");
      console.log("balance of buybackTo should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(buybackTo.address)).to.be.equal("3");
      console.log("balance of crss should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(crss.address)).to.be.equal("3");
      console.log("balance of contract should be 9990 tokens, paying liquidity fee");
      expect(await crss.balanceOf(mockTransfer.address)).to.be.equal("9990");
    });

    it("should pay liquidity/dev/buyback fee if non-pool contract to user", async function () {
      console.log("owner is minting 1000000000 tokens to contract");
      await crss.connect(owner).mint(mockTransfer.address, "1000000000");

      console.log("contract is transfering 10000 tokens to userA");
      await mockTransfer.transferTo(userA.address, "10000");
      console.log("balance of devTo should be 4 tokens"); // 0.04%
      expect(await crss.balanceOf(devTo.address)).to.be.equal("4");
      console.log("balance of buybackTo should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(buybackTo.address)).to.be.equal("3");
      console.log("balance of crss should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(crss.address)).to.be.equal("3");
      console.log("balance of userA should be 9990 tokens, paying liquidity fee");
      expect(await crss.balanceOf(userA.address)).to.be.equal("9990");
    });

    it("should pay liquidity/dev/buyback fee if non-pool to tokenA+tokenB pool", async function () {
      console.log("owner is minting 1000000000 tokens to contract");
      await crss.connect(owner).mint(mockTransfer.address, "1000000000");

      console.log("contract is transfering 10000 tokens to pair");
      await mockTransfer.transferTo(tokenAtokenB, "10000");
      console.log("balance of devTo should be 4 tokens"); // 0.04%
      expect(await crss.balanceOf(devTo.address)).to.be.equal("4");
      console.log("balance of buybackTo should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(buybackTo.address)).to.be.equal("3");
      console.log("balance of crss should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(crss.address)).to.be.equal("3");
      console.log("balance of tokenAtokenB should be 9990 tokens, paying liquidity fee");
      expect(await crss.balanceOf(tokenAtokenB)).to.be.equal("9990");
    });

    it("should pay liquidity/dev/buyback fee if non-pool to crss+bnb pool", async function () {
      console.log("owner is minting 1000000000 tokens to contract");
      await crss.connect(owner).mint(mockTransfer.address, "1000000000");

      console.log("contract is transfering 10000 tokens to crss+bnb");
      await mockTransfer.transferTo(crssBNB, "10000");
      console.log("balance of devTo should be 4 tokens"); // 0.04%
      expect(await crss.balanceOf(devTo.address)).to.be.equal("4");
      console.log("balance of buybackTo should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(buybackTo.address)).to.be.equal("3");
      console.log("balance of crss should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(crss.address)).to.be.equal("3");
      console.log("balance of crss+bnb should be 9990 tokens, paying liquidity fee");
      expect(await crss.balanceOf(crssBNB)).to.be.equal("9990");
    });

    it("should pay liquidity/dev/buyback fee if non-pool to crss+tokenA pool", async function () {
      console.log("owner is minting 1000000000 tokens to contract");
      await crss.connect(owner).mint(mockTransfer.address, "1000000000");

      console.log("contract is transfering 10000 tokens to crss+tokenA");
      await mockTransfer.transferTo(crssTokenA, "10000");
      console.log("balance of devTo should be 4 tokens"); // 0.04%
      expect(await crss.balanceOf(devTo.address)).to.be.equal("4");
      console.log("balance of buybackTo should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(buybackTo.address)).to.be.equal("3");
      console.log("balance of crss should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(crss.address)).to.be.equal("3");
      console.log("balance of crss+tokenA should be 9990 tokens, paying liquidity fee");
      expect(await crss.balanceOf(crssTokenA)).to.be.equal("9990");
    });

    it("should pay liquidity/dev/buyback fee if contract to contract", async function () {
      const MockTransfer = await hre.ethers.getContractFactory("MockTransfer");
      const mockTransfer2 = (await MockTransfer.deploy(crss.address)) as MockTransfer;
      await mockTransfer2.deployed();

      console.log("owner is minting 1000000000 tokens to contract");
      await crss.connect(owner).mint(mockTransfer.address, "1000000000");

      console.log("contract is transfering 10000 tokens to another contract");
      await mockTransfer.transferTo(mockTransfer2.address, "10000");
      console.log("balance of devTo should be 4 tokens"); // 0.04%
      expect(await crss.balanceOf(devTo.address)).to.be.equal("4");
      console.log("balance of buybackTo should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(buybackTo.address)).to.be.equal("3");
      console.log("balance of crss should be 3 tokens"); // 0.03%
      expect(await crss.balanceOf(crss.address)).to.be.equal("3");
      console.log("balance of another contract should be 9990 tokens, paying liquidity fee");
      expect(await crss.balanceOf(mockTransfer2.address)).to.be.equal("9990");
    });

    it("should not pay fee if tokenA+tokenB pool to user", async function () {
      // @todo, remove liquidity
    });

    it("should pay liquidity/dev/buyback fee if crss+bnb pool to user", async function () {
      // @todo, remove liquidity
    });

    it("should pay liquidity/dev/buyback fee if crss+tokenA pool to user", async function () {
      // @todo, remove liquidity
    });
  });

  /// @todo, add liquify amount test
  describe("liquify test", async function () {
    it("liquifyAccumulated should be accumulated to expected value", async function () {});

    it("liquifyAccumulated should be accumulated to expected value after liquify", async function () {});

    it("should emit SwapAndLiquify event when liquify", async function () {});

    it("should check reentrancy attack while liquify", async function () {});
  });
});
