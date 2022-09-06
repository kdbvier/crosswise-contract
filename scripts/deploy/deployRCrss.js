const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployRCrss,
  verifyContract
} = require("../feature/utils")


async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying RCrss\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // rCrss Deployment.
  rCrss = await deployRCrss(owner);
  const rCrssAddr = rCrss.address;
  console.log(`rCrss deployed at: ${rCrss.address}`);
  await verifyContract(rCrssAddr, [])

  address.RCrss = rCrssAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });