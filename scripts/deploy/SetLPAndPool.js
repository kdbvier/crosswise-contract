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
const {abi: busdAbi} = require("../busdAbi.json")
const { config } = require("../config");
const zero_address = "0x0000000000000000000000000000000000000000";
const NodeTypes = ["Token", "Center", "Maker", "Taker", "Farm", "Factory", "XToken", "Repay"]; // DO not change the order.
const ListStatus = ["None", "Cleared", "Enlisted", "Delisted"]; // DO NOT change the order.

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nWiring Contracts\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  const wbnbAddr = config[network.name].wbnb
  const busdAddr = config[network.name].busd

  //======================= Wire ==========================
  const crss = new ethers.Contract(address.Crss, crssAbi, owner);
  const maker = new ethers.Contract(address.Maker, makerAbi, owner);
  const farm = new ethers.Contract(address.Farm, farmAbi, owner);

  console.log("\n\tSetting contracts...".green);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });