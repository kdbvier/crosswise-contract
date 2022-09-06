const { ethers, run, upgrades } = require("hardhat");
const { getAddress, keccak256, solidityPack } = require("ethers/lib/utils");

const ONE = ethers.BigNumber.from(1);
const TWO = ethers.BigNumber.from(2);

exports.deployWireLibrary = async function (deployer) {
  const WireLib = await ethers.getContractFactory("WireLibrary", {
    signer: deployer,
  });
  const wireLib = await WireLib.deploy();
  await wireLib.deployed();

  return wireLib;
};

exports.deployFactory = async function (deployer, wireLib) {
  const Factory = await ethers.getContractFactory("CrossFactory", {
    signer: deployer,
    libraries: {
      WireLibrary: wireLib,
    },
  });

  const factory = await Factory.connect(deployer).deploy();
  await factory.deployed();

  return factory;
};

exports.deployWBNB = async function (deployer) {
  const WBNB = await ethers.getContractFactory("WBNB");
  const wbnb = await WBNB.connect(deployer).deploy();
  await wbnb.deployed();

  return wbnb;
};

exports.deployCrss = async function (deployer, wireLib) {
  const CrssToken = await ethers.getContractFactory("CrssToken", {
    signer: deployer,
    libraries: {
      WireLibrary: wireLib,
    },
  });

  const crssToken = await CrssToken.connect(deployer).deploy();
  await crssToken.deployed();

  return crssToken;
};

exports.deployMockToken = async function (deployer, name, symbol) {
  const MockToken = await ethers.getContractFactory("MockToken");
  const mock = await MockToken.connect(deployer).deploy(name, symbol);
  await mock.deployed();

  return mock;
};

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
};

exports.deployCenter = async function (deployer, wireLib) {
  const Center = await ethers.getContractFactory("ControlCenter", {
    signer: deployer,
    libraries: {
      WireLibrary: wireLib,
    },
  });
  const center = await Center.connect(deployer).deploy();
  await center.deployed();

  return center;
};

exports.deployRouterLibrary = async function (deployer) {
  const RouterLib = await ethers.getContractFactory("RouterLibrary", {
    signer: deployer,
  });
  const routerLib = await RouterLib.deploy();
  await routerLib.deployed();

  return routerLib;
};

exports.deployMaker = async function (deployer, wbnb, wireLib, routerLib) {
  const Router = await ethers.getContractFactory("CrossMaker", {
    signer: deployer,
    libraries: {
      WireLibrary: wireLib,
    },
  });

  const router = await Router.connect(deployer).deploy(wbnb);
  await router.deployed();

  return router;
};

exports.deployTaker = async function (deployer, wbnb, wireLib, routerLib) {
  const Router = await ethers.getContractFactory("CrossTaker", {
    signer: deployer,
    libraries: {
      WireLibrary: wireLib,
      RouterLibrary: routerLib,
    },
  });

  const router = await Router.connect(deployer).deploy(wbnb);
  await router.deployed();

  return router;
};

exports.verifyUpgradeable = async function (address) {
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
};

exports.deployFarmLibrary = async function (deployer) {
  const FarmLib = await ethers.getContractFactory("FarmLibrary", {
    signer: deployer,
  });
  const farmLib = await FarmLib.deploy();
  await farmLib.deployed();

  return farmLib;
};

exports.deployFarm = async function (deployer, crssAddr, crssPerBlock, startBlock, wireLib, farmLib) {
  const CrossFarm = await ethers.getContractFactory("CrossFarm", {
    signer: deployer,
    libraries: {
      WireLibrary: wireLib,
      FarmLibrary: farmLib
    },
  });

  const crossFarm = await CrossFarm.connect(deployer).deploy(crssAddr, crssPerBlock, startBlock);
  await crossFarm.deployed();

  return crossFarm;
};

exports.deployXCrss = async function (deployer, name, symbol, wireLib) {
  const XCrssToken = await ethers.getContractFactory("xCrssToken", {
    signer: deployer,
    libraries: {
      WireLibrary: wireLib
    },
  });

  const xCrssToken = await XCrssToken.connect(deployer).deploy(name, symbol);
  await xCrssToken.deployed();

  return xCrssToken;
};

exports.deployReferral = async function (deployer) {
  const Referral = await ethers.getContractFactory("CrssReferral", {
    signer: deployer,
  });

  const referral = await Referral.connect(deployer).deploy();
  await referral.deployed();

  return referral;
};

exports.deployRCrss = async function (deployer) {
  const RCrssToken = await ethers.getContractFactory("RCrssToken", {
    signer: deployer,
  });

  const rCrssToken = await RCrssToken.connect(deployer).deploy();
  await rCrssToken.deployed();

  return rCrssToken;
};

exports.deployRSyrup = async function (deployer, crssAddr) {
  const RSyrup = await ethers.getContractFactory("RSyrupBar", {
    signer: deployer,
  });

  const rSyrup = await RSyrup.connect(deployer).deploy(crssAddr);
  await rSyrup.deployed();

  return rSyrup;
};

exports.deployRepay = async function (deployer, crssAddr, rCrssAddr, rSyrupAddr, crssPerBlock, startBlock, wireLib) {
  const Repay = await ethers.getContractFactory("Repay", {
    signer: deployer,
    libraries: {
      WireLibrary: wireLib
    },
  });

  const repay = await Repay.connect(deployer).deploy(crssAddr, rCrssAddr, rSyrupAddr, crssPerBlock, startBlock);
  await repay.deployed();

  return repay;
};

exports.getCreate2Address = function (factoryAddress, tokens, bytecode) {
  const [token0, token1] = tokens[0] < tokens[1] ? [tokens[0], tokens[1]] : [tokens[1], tokens[0]];
  const create2Inputs = [
    "0xff",
    factoryAddress,
    keccak256(solidityPack(["address", "address"], [token0, token1])),
    keccak256(bytecode),
  ];
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join("")}`;
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`);
};

exports.sqrt = function (value) {
  x = value;
  let z = x.add(ONE).div(TWO);
  let y = x;
  while (z.sub(y).isNegative()) {
    y = z;
    z = x.div(z).add(z).div(TWO);
  }
  return y;
};

exports.ZERO_ADDRESS = ethers.constants.AddressZero;
