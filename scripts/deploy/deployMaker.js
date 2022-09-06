const { ethers, network } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployMaker,
  verifyContract
} = require("../feature/utils")
const {config} = require("../config")

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying Maker\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  const wbnbAddr = config[network.name].wbnb

  // Maker Deployment.
  maker = await deployMaker(owner, wbnbAddr, address.WireLib, address.RouterLib);
  const makerAddr = maker.address;
  console.log(`Maker deployed at: ${makerAddr}`);
  await verifyContract(makerAddr, [wbnbAddr])

  address.Maker = makerAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });