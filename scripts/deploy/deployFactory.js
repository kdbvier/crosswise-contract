const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployFactory,
  verifyContract
} = require("../feature/utils")


async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying Facotry\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // Factory Deployment.
  factory = await deployFactory(owner, address.WireLib);
  const factoryAddr = factory.address;
  console.log(`Factory deployed at: ${factory.address}`);
  await verifyContract(factoryAddr, [])

  console.log("\t!!! Pair's bytecode hash = \n\t", (await factory.INIT_CODE_PAIR_HASH()).substring(2));
  address.Factory = factoryAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });