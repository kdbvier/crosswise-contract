async function main() {
  const { ethers, upgrades } = require("hardhat");
  const { utils } = require("ethers");

  [deployer] = await ethers.getSigners();
  devTo = deployer.address;
  buybackTo = deployer.address;
  liquidity = deployer.address;
  treasuryAddr = deployer.address;

  console.log("\nDeploying...\n".cyan);
  const Factory = await ethers.getContractFactory("CrossFactory");
  factory = await Factory.deploy(deployer.address);
  console.log("- Factory Deployed: ".green, factory.address);

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
  crss = await upgrades.deployProxy(Crss, [[devTo, buybackTo, liquidity], maker.address, taker.address]);
  console.log("- crss Deployed: ".green, crss.address);

  await maker.setToken(crss.address);
  await maker.setLiquidityChangeLimit(5000); // set 5%
  console.log("\tMaker set Token: ", crss.address);

  await taker.setToken(crss.address);
  await taker.setPriceChangeLimit(5000); // 5%
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

  const CrossFarm = await ethers.getContractFactory("CrossFarm");
  farm = await upgrades.deployProxy(CrossFarm, [
    crss.address,
    treasuryAddr,
    maker.address,
    taker.address,
    utils.parseEther(crssPerBlock),
    startBlock.number + 10,
  ]);

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

  /***********************
   *      UPGRADE START
   ************************/

  // const Crss2 = await ethers.getContractFactory("CrssToken2");
  // const crss2 = await upgrades.upgradeProxy(crss.address, Crss2);

  // console.log("\nCrssToken Upgraded: ", await crss2.getVersion());

  // const xCrss2 = await ethers.getContractFactory("xCrssToken2");
  // const xcrss2 = await upgrades.upgradeProxy(xcrss.address, xCrss2);

  // console.log("\nxCrssToken Upgraded: ", await xcrss2.getVersion());

  // const Farm2 = await ethers.getContractFactory("CrossFarm2");
  // const farm2 = await upgrades.upgradeProxy(farm.address, Farm2);

  // console.log("\nFarm Upgraded: ", await farm2.getVersion());
}

main((err) => {
  if (err) {
    console.log(err);
  }
});
