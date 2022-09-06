const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployFarmLibrary,
  verifyContract
} = require("../feature/utils")

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying Router Library\n".yellow);

  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // FarmLibrary Deployment for Farm.
  farmLib = await deployFarmLibrary(owner);
  const farmLibAddr = farmLib.address;
  console.log(`FarmLibrary deployed at: ${farmLib.address}`);
  await verifyContract(farmLibAddr, [])

  address.FarmLib = farmLibAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });