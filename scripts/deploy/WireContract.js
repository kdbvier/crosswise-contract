const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const { abi: factoryAbi } = require('../../artifacts/contracts/core/CrossFactory.sol/CrossFactory.json')
const { abi: pairAbi } = require('../../artifacts/contracts/core/CrossPair.sol/CrossPair.json')
const { abi: farmAbi } = require('../../artifacts/contracts/farm/CrossFarm.sol/CrossFarm.json')
const { abi: referralAbi } = require('../../artifacts/contracts/farm/CrssReferral.sol/CrssReferral.json')
const { abi: crssAbi } = require('../../artifacts/contracts/farm/CrssToken.sol/CrssToken.json')
const { abi: xcrssAbi } = require('../../artifacts/contracts/farm/xCrssToken.sol/xCrssToken.json')
const { abi: centerAbi } = require('../../artifacts/contracts/periphery/ControlCenter.sol/ControlCenter.json')
const { abi: makerAbi } = require('../../artifacts/contracts/periphery/CrossMaker.sol/CrossMaker.json')
const { abi: takerAbi } = require('../../artifacts/contracts/periphery/CrossTaker.sol/CrossTaker.json')
const { abi: rcrssAbi } = require('../../artifacts/contracts/repay/RCrssToken.sol/RCrssToken.json')
const { abi: rsyrupAbi } = require('../../artifacts/contracts/repay/RSyrupBar.sol/RSyrupBar.json')
const { abi: repayAbi } = require('../../artifacts/contracts/repay/Repay.sol/Repay.json')


async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nWiring Contracts\n".green);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  //======================= Wire ==========================
  const crss = new ethers.Contract(address.Crss, crssAbi, owner);
  const repay = new ethers.Contract(address.Repay, repayAbi, owner);
  const center = new ethers.Contract(address.Center, centerAbi, owner);
  const factory = new ethers.Contract(address.Factory, factoryAbi, owner);
  const xcrss = new ethers.Contract(address.XCrss, xcrssAbi, owner);
  const referral = new ethers.Contract(address.Referral, referralAbi, owner);
  const rsyrup = new ethers.Contract(address.RSyrup, rsyrupAbi, owner);
  const maker = new ethers.Contract(address.Maker, makerAbi, owner);
  const taker = new ethers.Contract(address.Taker, takerAbi, owner);
  const farm = new ethers.Contract(address.Farm, farmAbi, owner);
  const rcrss = new ethers.Contract(address.Farm, rcrssAbi, owner);

  tx = crss.wire(repay.address, center.address);
  (await tx).wait();
  console.log("\tCrss token was wired: repay - O - center", repay.address, center.address);
  tx = center.wire(crss.address, maker.address);
  (await tx).wait();
  console.log("\tControlCenter was wired: crss - O - maker", crss.address, maker.address);

  tx = maker.wire(center.address, taker.address);
  (await tx).wait();
  console.log("\tmaker was wired: center - O - taker", crss.address, taker.address);

  tx = taker.wire(maker.address, farm.address);
  (await tx).wait();
  console.log("\ttaker was wired: maker - O - farm", maker.address, farm.address);

  tx = farm.wire(taker.address, factory.address);
  (await tx).wait();
  console.log("\tfarm was wired: taker - O - factory", taker.address, factory.address);

  tx = factory.wire(farm.address, xcrss.address);
  (await tx).wait();
  console.log("\tfactory was wired: farm - O - xcrss", farm.address, xcrss.address);

  tx = xcrss.wire(factory.address, repay.address);
  (await tx).wait();
  console.log("\txcrss was wired: factory - O - repay", factory.address, repay.address);

  tx = repay.wire(xcrss.address, crss.address);
  (await tx).wait();
  console.log("\trepay was wired: xcrss - O - crss", xcrss.address, crss.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });