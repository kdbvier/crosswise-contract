const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployCenter,
  verifyContract
} = require("../feature/utils")


async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying Center\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // Center Deployment
  center = await deployCenter(owner, address.WireLib);
  const centerAddr = center.address;
  console.log(`ContralCenter deployed at: ${centerAddr}`);
  await verifyContract(centerAddr, [])

  address.Center = centerAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });