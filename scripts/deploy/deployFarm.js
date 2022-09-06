const { ethers, network } = require("hardhat");
const fs = require("fs");
const { utils } = require("ethers")
const { yellow, cyan } = require("colors");
const {
  deployFarm,
  verifyContract
} = require("../feature/utils")
const { config } = require("../config")

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying Farm\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // Farm Deployment.
  crssPerBlock = config[network.name].crssPerBlock
  const startBlock = (await ethers.provider.getBlock("latest")).number + 10;
  console.log(crssPerBlock, startBlock, utils.parseEther(crssPerBlock))
  farm = await deployFarm(
    owner,
    address.Crss,
    utils.parseEther(crssPerBlock),
    startBlock,
    address.WireLib,
    address.FarmLib
  );
  console.log(`Farm deployed at: ${farm.address}`);
  const farmAddr = farm.address;

  await verifyContract(farmAddr, [
    address.Crss,
    utils.parseEther(crssPerBlock),
    startBlock,
  ])

  address.Farm = farmAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });