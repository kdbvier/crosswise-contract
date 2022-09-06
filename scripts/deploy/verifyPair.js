const { ethers, network } = require("hardhat");
const { config } = require("../config");
const { verifyContract } = require("../feature/deploy");

async function main() {
  console.log("Verifying Pair Contract, Network: ", network.name);

  // Quit if networks are not supported
  if (network.name !== "bsc_testnet" && network.name !== "bsc_mainnet") {
    console.log("Network name is not supported");
    return;
  }

  const conf = config[network.name];
  const pairAdd = conf.pair
  await verifyContract(pairAdd, [])
}

main()
.then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exit(1);
});
