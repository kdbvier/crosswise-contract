const { ethers, network } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployReferral,
  verifyContract
} = require("../feature/utils")
const config = require("../config")

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying Referral\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // Referral Deployment.
  referral = await deployReferral(owner);
  const referralAddr = referral.address;
  console.log(`Referral deployed at: ${referral.address}`);
  await verifyContract(referralAddr, [])

  address.Referral = referralAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });