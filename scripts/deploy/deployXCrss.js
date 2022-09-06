const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployXCrss,
  verifyContract
} = require("../feature/utils")


async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying XCRSS Token\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // XCRSS Deployment.
  xCrss = await deployXCrss(owner, "Crosswise xCrss Token", "xCRSS", address.WireLib);
  const xCrssAddr = xCrss.address;
  console.log(`XCRSS deployed at: ${xCrss.address}`);
  await verifyContract(xCrssAddr, ["Crosswise xCrss Token", "xCRSS"])

  address.XCrss = xCrssAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });