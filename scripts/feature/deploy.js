const { ethers, run, upgrades } = require("hardhat");

exports.deployFactory = async function (deployer, feeToSetter) {
  const Factory = await ethers.getContractFactory("CrossFactory");
  const factory = (await Factory.connect(deployer).deploy(feeToSetter));
  await factory.deployed();
  console.log("Deployed CrossFactory: ", factory.address);

  return factory;
}

exports.verifyContract = async function (contract, params) {
  try {
    // Verify
    console.log("Verifying: ", contract);
    await run("verify:verify", {
      address: contract,
      constructorArguments: params,
    });
  } catch (error) {
    if (error && error.message.includes("Reason: Already Verified")) {
      console.log("Already verified, skipping...");
    } else {
      console.error(error);
    }
  }
}

exports.deployMaker = async function (deployer, factory, wbnb) {
  const Router = await ethers.getContractFactory("CrossMaker");
  const router = (await Router.connect(deployer).deploy(factory, wbnb));
  await router.deployed();
  console.log("Deployed CrossMaker: ", router.address);

  return router;
}

exports.deployTaker = async function (deployer, factory, wbnb) {
  const Router = await ethers.getContractFactory("CrossTaker");
  const router = (await Router.connect(deployer).deploy(factory, wbnb));
  await router.deployed();
  console.log("Deployed CrossTaker: ", router.address);

  return router;
}

exports.deployCrss = async function (
  deployer,
  feeAddrs,
  maker,
  taker
) {
  const CrssToken = await ethers.getContractFactory("CrssToken", {
    signer: deployer,
  });
  const crssTokenUpgrades = (await upgrades.deployProxy(CrssToken, [
    feeAddrs, maker, taker
  ]));
  await crssTokenUpgrades.deployed();
  console.log("Deployed CrssToken: ", crssTokenUpgrades.address);

  return crssTokenUpgrades;
}

exports.verifyUpgradeable = async function(address) {
  try {
    // Verify
    const contract = await upgrades.erc1967.getImplementationAddress(address);
    console.log("Verifying: ", contract);
    await run("verify:verify", {
      address: contract,
    });
  } catch (error) {
    if (error && error.message.includes("Reason: Already Verified")) {
      console.log("Already verified, skipping...");
    } else {
      console.error(error);
    }
  }
}

exports.deployFarm = async function (
  deployer,
  crss,
  treasuryAddr,
  maker,
  taker,
  crssPerBlock,
  startBlock
) {
  const CrossFarm = await ethers.getContractFactory("CrossFarm", {
    signer: deployer,
  });
  const crossFarmUpgrades = (await upgrades.deployProxy(CrossFarm, [
    crss,
    treasuryAddr,
    maker,
    taker,
    crssPerBlock,
    startBlock,
  ]));
  await crossFarmUpgrades.deployed();

  console.log("Deployed CrossFarm Address: " + crossFarmUpgrades.address);

  return crossFarmUpgrades;
}

exports.deployXCrss = async function (deployer, crss) {
  const XCrssToken = await ethers.getContractFactory("xCrssToken", {
    signer: deployer,
  });
  const xcrssTokenUpgrades = (await upgrades.deployProxy(XCrssToken, [crss]));
  await xcrssTokenUpgrades.deployed();
  console.log("Deployed XCrssToken: ", xcrssTokenUpgrades.address);

  return xcrssTokenUpgrades;
}

exports.deployReferral = async function (deployer) {
  const referral = await ethers.getContractFactory("CrssReferral", {
    signer: deployer,
  });
  const referralUpgrades = (await upgrades.deployProxy(referral, []));
  await referralUpgrades.deployed();
  console.log("Deployed referral: ", referralUpgrades.address);

  return referralUpgrades;
}

exports.deployCCrss = async function (deployer) {
  const CCrss = await ethers.getContractFactory("CCrssToken");
  const cCrss = await CCrss.connect(deployer).deploy();
  await cCrss.deployed();

  return cCrss;
};