const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployRouterLibrary,
  verifyContract
} = require("../feature/utils")

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nDeploying Router Library\n".yellow);

  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)

  // Router Library Deploy
  routerLib = await deployRouterLibrary(owner);
  const routerLibAddr = routerLib.address
  console.log(`routerLibAddr deployed at: ${routerLibAddr}`);
  await verifyContract(routerLibAddr, [])

  address.RouterLib = routerLibAddr
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });