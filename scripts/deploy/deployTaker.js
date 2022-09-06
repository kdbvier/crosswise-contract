const { ethers, network } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployTaker,
  verifyContract
} = require("../feature/utils")
const {config} = require("../config")

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying Taker\n".yellow);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  const wbnbAddr = config[network.name].wbnb
  // Maker Deployment.
  taker = await deployTaker(owner, wbnbAddr, address.WireLib, address.RouterLib);
  const takerAddr = taker.address;
  console.log(`taker deployed at: ${takerAddr}`);
  await verifyContract(takerAddr, [wbnbAddr])

  address.Taker = takerAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });