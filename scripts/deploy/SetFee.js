const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");
const { abi: factoryAbi } = require('../../artifacts/contracts/core/CrossFactory.sol/CrossFactory.json')
const { abi: pairAbi } = require('../../artifacts/contracts/core/CrossPair.sol/CrossPair.json')
const { abi: farmAbi } = require('../../artifacts/contracts/farm/CrossFarm.sol/CrossFarm.json')
const { abi: referralAbi } = require('../../artifacts/contracts/farm/CrssReferral.sol/CrssReferral.json')
const { abi: crssAbi } = require('../../artifacts/contracts/farm/CrssToken.sol/CrssToken.json')
const { abi: xcrssAbi } = require('../../artifacts/contracts/farm/xCrssToken.sol/xCrssToken.json')
const { abi: centerAbi } = require('../../artifacts/contracts/periphery/ControlCenter.sol/ControlCenter.json')
const { abi: makerAbi } = require('../../artifacts/contracts/periphery/CrossMaker.sol/CrossMaker.json')
const { abi: takerAbi } = require('../../artifacts/contracts/periphery/CrossTaker.sol/CrossTaker.json')
const { abi: rcrssAbi } = require('../../artifacts/contracts/repay/RCrssToken.sol/RCrssToken.json')
const { abi: rsyrupAbi } = require('../../artifacts/contracts/repay/RSyrupBar.sol/RSyrupBar.json')
const { abi: repayAbi } = require('../../artifacts/contracts/repay/Repay.sol/Repay.json');
const { config, feeRates } = require("../config");
const zero_address = "0x0000000000000000000000000000000000000000";

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("\nSetting Fee...".green);
  console.log("Owner address: ".cyan, owner.address, "Network: ".cyan, network.name);
  let address = fs.readFileSync("address.json", "utf-8")
  address = JSON.parse(address)


  //======================= Wire ==========================
  const crss = new ethers.Contract(address.Crss, crssAbi, owner);
  const repay = new ethers.Contract(address.Repay, repayAbi, owner);
  const center = new ethers.Contract(address.Center, centerAbi, owner);
  const factory = new ethers.Contract(address.Factory, factoryAbi, owner);
  const xcrss = new ethers.Contract(address.XCrss, xcrssAbi, owner);
  const referral = new ethers.Contract(address.Referral, referralAbi, owner);
  const rsyrup = new ethers.Contract(address.RSyrup, rsyrupAbi, owner);
  const maker = new ethers.Contract(address.Maker, makerAbi, owner);
  const taker = new ethers.Contract(address.Taker, takerAbi, owner);
  const farm = new ethers.Contract(address.Farm, farmAbi, owner);
  const rcrss = new ethers.Contract(address.RCrss, rcrssAbi, owner);

  const feeStores = [
    owner.address, // Dev wallet
    config.buyback,
    config.liquidity,
    config.treasury
  ];
  tx = crss.setFeeStores(feeStores, zero_address);
  (await tx).wait();
  console.log("\tFeeStores were fed to the node chain");

  for (let st = 0; st < feeRates.length; st++) {
    console.log(feeRates[st]);
    tx = crss.setFeeRates(st, feeRates[st], zero_address);
    (await tx).wait();
  }
  console.log("\tFeeRates were fed to the node chain");

  tx = farm.setFeeParams(
    config.treasury,
    config.stakeHolders,
    referral.address, // crssReferral
    config.referralCommisionRate, // 0.1%, referralCommissionRate
    config.vestBurnRate, // 25.0%, nonVestBurnRate
    config.compoundFeeRate // 5%, compoundFeeRate
  );

  (await tx).wait();
  console.log("\tFarmFeeParams were set");

  tx = referral.setPayer(farm.address);
  (await tx).wait();
  console.log("\tReferral Set Farm as its payer");

  tx = rsyrup.transferOwnership(repay.address); // Permanent. Irrevocable.
  (await tx).wait();
  console.log("\trepay became the owner of rSyrupBar");

  tx = rcrss.changeRepay(repay.address);
  (await tx).wait();
  console.log("\trCrss is equipped with repay's address");

  await center.setLiquidityChangeLimit(5000); // set it 5%.
  await center.setPriceChangeLimit(5000); // set it 5%

  tx = farm.setBackendCaller(config.backendCaller);
  (await tx).wait();
  console.log("\tBackend caller was set");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });