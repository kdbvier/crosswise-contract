const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployWireLibrary,
  verifyContract
} = require("../feature/utils")

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying Wire Library\n".yellow);

  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);

  // WireLibrary Deployment for Farm, Crss, Maker, and Taker.
  wireLib = await deployWireLibrary(owner);
  const wireLibAddr = wireLib.address;
  console.log(`WireLibrary deployed at: ${wireLibAddr}`);
  await verifyContract(wireLibAddr, [])

  const address = {
    WireLib: wireLibAddr,
  }
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });