const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployRSyrup,
  verifyContract
} = require("../feature/utils")


async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying RSyrup\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // RSyrup Deployment.
  rSyrup = await deployRSyrup(owner, address.Crss);
  const rSyrupAddr = rSyrup.address;
  console.log(`rSyrup deployed at: ${rSyrup.address}`);
  await verifyContract(rSyrupAddr, [address.Crss])

  address.RSyrup = rSyrupAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });