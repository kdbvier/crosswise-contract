const { ethers, network } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployCrss,
  verifyContract
} = require("../feature/utils")
const config = require("../config")

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying CrossToken\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // CRSS Deployment
  crss = await deployCrss(owner, address.WireLib);
  const crssAddr = crss.address;
  console.log(`CRSS Token deployed at: ${crss.address}`);
  await verifyContract(crssAddr, [])

  address.Crss = crssAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });