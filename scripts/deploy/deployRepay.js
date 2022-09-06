const { ethers } = require("hardhat");
const fs = require("fs");
const { utils } = require("ethers")
const { yellow, cyan } = require("colors");
const {
  deployRepay,
  verifyContract
} = require("../feature/utils")
const { config } = require("../config")

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying Repay\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // repay Deployment.
  console.log(address.Crss, address.RCrss, address.RSyrup, address.WireLib)
  const startRepayBlock = (await ethers.provider.getBlock("latest")).number;
  crssPerRepayBlock = config[network.name].crssPerRepayBlock
  repay = await deployRepay(owner, address.Crss, address.RCrss, address.RSyrup, utils.parseEther(crssPerRepayBlock), startRepayBlock, address.WireLib);
  const repayAddr = repay.address;
  console.log(`repay deployed at: ${repay.address}`);
  await verifyContract(repayAddr, [address.Crss, address.RCrss, address.RSyrup, utils.parseEther(crssPerRepayBlock), startRepayBlock])

  address.Repay = repayAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });