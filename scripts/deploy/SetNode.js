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
const { abi: repayAbi } = require('../../artifacts/contracts/repay/Repay.sol/Repay.json');
const { config } = require("../config");
const zero_address = "0x0000000000000000000000000000000000000000";
const NodeTypes = ["Token", "Center", "Maker", "Taker", "Farm", "Factory", "XToken", "Repay"]; // DO not change the order.
const ListStatus = ["None", "Cleared", "Enlisted", "Delisted"]; // DO NOT change the order.

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nSetting contracts...".green);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  const wbnbAddr = config[network.name].wbnb
  const busdAddr = config[network.name].busd

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

  tx = crss.setNode(NodeTypes.indexOf("Token"), crss.address, zero_address);
  (await tx).wait();
  console.log("\tCrss was set to the node chain");

  tx = crss.setNode(NodeTypes.indexOf("Center"), center.address, zero_address);
  (await tx).wait();
  console.log("\tCenter was set to the node chain");

  tx = crss.setNode(NodeTypes.indexOf("Maker"), maker.address, zero_address);
  (await tx).wait();
  console.log("\tMaker was set to the node chain");

  tx = crss.setNode(NodeTypes.indexOf("Taker"), taker.address, zero_address);
  (await tx).wait();
  console.log("\tTaker was set to the node chain");

  tx = crss.setNode(NodeTypes.indexOf("Farm"), farm.address, zero_address);
  (await tx).wait();
  console.log("\tFarm was set to the node chain");

  tx = crss.setNode(NodeTypes.indexOf("Factory"), factory.address, zero_address);
  (await tx).wait();
  console.log("\tFactory was set to the node chain");

  tx = crss.setNode(NodeTypes.indexOf("XToken"), xcrss.address, zero_address);
  (await tx).wait();
  console.log("\txToken was fed to the node chain");

  tx = crss.setNode(NodeTypes.indexOf("Repay"), repay.address, zero_address);
  (await tx).wait();
  console.log("\trepay was fed to the node chain");

  //======================= List tokens =============================

  tx = factory.changeTokenStatus(wbnbAddr, ListStatus.indexOf("Enlisted"));
  (await tx).wait();
  console.log("\twbnb was listed");

  tx = factory.changeTokenStatus(crss.address, ListStatus.indexOf("Enlisted"));
  (await tx).wait();
  console.log("\tcrss was listed");

  tx = factory.changeTokenStatus(busdAddr, ListStatus.indexOf("Enlisted"));
  (await tx).wait();
  console.log("\tBusd was listed");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });