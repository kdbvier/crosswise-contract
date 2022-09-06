const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const {
  deployWireLibrary,
  deployRouterLibrary,
  deployFarmLibrary,
  verifyContract
} = require("../feature/utils")

async function main() {
  const [owner] = await ethers.getSigners();

	console.log("\nDeploying Libraries\n".yellow);
  
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  
  // WireLibrary Deployment for Farm, Crss, Maker, and Taker.
  wireLib = await deployWireLibrary(owner);
  const wireLibAddr = wireLib.address;
  console.log(`WireLibrary deployed at: ${wireLibAddr}`);
  await verifyContract(wireLibAddr, [])

  // Router Library Deploy
  routerLib = await deployRouterLibrary(owner);
  const routerLibAddr = routerLib.address
  console.log(`routerLibAddr deployed at: ${routerLibAddr}`);
  await verifyContract(routerLibAddr, [])

  // FarmLibrary Deployment for Farm.
  farmLib = await deployFarmLibrary(owner);
  const farmLibAddr = farmLib.address;
  console.log(`FarmLibrary deployed at: ${farmLib.address}`);
  await verifyContract(farmLibAddr, [])

  const address = {
    WireLib: wireLibAddr,
    RouterLib: routerLibAddr,
    FarmLib: farmLibAddr
  }
  fs.writeFileSync("address.json", JSON.stringify(address))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });