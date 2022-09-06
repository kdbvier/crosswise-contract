
const { ethers, waffle, network, upgrades } = require("hardhat");
const { expect, util } = require("chai");
//const { FakeContract, smock } = require("@defi-wonderland/smock");
const { config } = require("./config");

const { utils } = require("ethers");
const { abi: pairAbi } = require("../artifacts/contracts/core/CrossPair.sol/CrossPair.json");
const NodeTypes = ["Token", "Center", "Maker", "Taker", "Farm", "Factory", "XToken", "Repay"]; // DO not change the order.
const ListStatus = ["None", "Cleared", "Enlisted", "Delisted"]; // DO NOT change the order.
const zero_address = "0x0000000000000000000000000000000000000000";

function consoleLogWithTab(str) {
    console.log(`\t${str}`);
}
const {
    deployWireLibrary,
    deployCrss,
    deployRouterLibrary,
    deployWBNB,
    deployFactory,
    deployFarmLibrary,
    deployFarm,
    deployMaker,
    deployCenter,
    deployTaker,
    deployXCrss,
    deployReferral,
    deployMockToken,
    deployRCrss,
    deployRSyrup,
    deployRepay,
    verifyContract,
    verifyUpgradeable,
    getCreate2Address,
    sqrt,
    ZERO_ADDRESS,
} = require("./feature/utils");
const { assert } = require("console");
const { yellow, cyan } = require("colors");
const { zeroAddress } = require("ethereumjs-util");
// Address of contract and users that will be used globally
let factory,
    router,
    wbnb,
    crss,
    farm,
    xCrss,
    mock,
    center,
    referral,
    routerLib,
    crss_mockPair,
    crss_ethPair,
    devTo,
    buybackTo,
    CrssBnbLP,
    CrssMCKLP,
    allocPoint,
    crssPerBlock,
    devFee,
    vestedReward,
    withdrawable,
    startBlock,
    wbnbAddr

// Magnifier that is used in the contract
const FeeMagnifier = 100000;

// Crss-Mock Deposite Fee
const crss_mck_DF = 50;

// Crss-ETH Deposite Fee
const crss_eth_DF = 25;

async function main() {
    const [owner] = await ethers.getSigners();
    const dev = owner.address;
    const buyback = "0x83393db5d3c19A0FFAB12E14E5a873C7e52f67Fc";
    const liquidity = "0x1d3c693B4B38c2f9e0E5A07E91042Cc3a3baC78A";
    const treasury = "0x57Ae3A6B4f0278E838337B6547dF0c27650F16e3";

    console.log("\tOwner address: ".cyan, owner.address);

    // // WireLibrary Deployment for Farm, Crss, Maker, and Taker.
    // wireLib = await deployWireLibrary(owner);
    // const wireLibAddr = wireLib.address;
    // consoleLogWithTab(`WireLibrary deployed at: ${wireLibAddr}`);
    // // await verifyContract(wireLibAddr, [])

    // // Router Library Deploy
    // routerLib = await deployRouterLibrary(owner);
    // const routerLibAddr = routerLib.address
    // consoleLogWithTab(`routerLibAddr deployed at: ${routerLibAddr}`);
    // await verifyContract(routerLibAddr, [])

    // // FarmLibrary Deployment for Farm.
    // farmLib = await deployFarmLibrary(owner);
    // const farmLibAddr = farmLib.address;
    // consoleLogWithTab(`FarmLibrary deployed at: ${farmLib.address}`);
    // // await verifyContract(farmLibAddr, [])


    // Factory Deployment.
    factory = await deployFactory(owner, wireLibAddr);
    const factoryAddr = factory.address;
    consoleLogWithTab(`Factory deployed at: ${factory.address}`);
    await verifyContract(factoryAddr, [])

    // console.log("\tCrossFactory contract was deployed at: ", factory.address);
    // console.log("\t!!! Pair's bytecode hash = \n\t", (await factory.INIT_CODE_PAIR_HASH()).substring(2));
    // console.log("\t!!! Please make sure the pairFor(...) function of CrossLibrary.sol file has the same hash.");

    //========================== Deploy ============================
    console.log("\n\tDeploying contracts...".green);
    // await verifyContract(farmLibAddr, [])

    // // WBNB Deployment.
    // // wbnb = await deployWBNB(owner);
    // const wbnbAddr = wbnb.address;
    const conf = config.bsc_testnet;
    wbnbAddr = conf.wbnb

    // Center Deployment
    center = await deployCenter(owner, wireLibAddr);
    const centerAddr = center.address;
    consoleLogWithTab(`ContralCenter deployed at: ${centerAddr}`);
    await verifyContract(centerAddr, [])

    // Maker Deployment.
    maker = await deployMaker(owner, wbnbAddr, wireLibAddr, routerLibAddr);
    const makerAddr = maker.address;
    consoleLogWithTab(`Maker deployed at: ${maker.address}`);
    await verifyContract(makerAddr, [wbnbAddr])

    // Taker Deployment.
    taker = await deployTaker(owner, wbnbAddr, wireLibAddr, routerLibAddr);
    const takerAddr = taker.address;
    consoleLogWithTab(`Taker deployed at: ${taker.address}`);
    await verifyContract(takerAddr, [wbnbAddr])

    // CRSS Deployment.
    crss = await deployCrss(owner, wireLibAddr);
    const crssAddr = crss.address;
    consoleLogWithTab(`CRSS Token deployed at: ${crss.address}`);
    await verifyContract(crssAddr, [])

    // Referral Deployment.
    referral = await deployReferral(owner);
    const referralAddr = referral.address;
    consoleLogWithTab(`Referral deployed at: ${referral.address}`);
    await verifyContract(referralAddr, [])

    // Farm Deployment.
    crssPerBlock = "0.000001"
    const startBlock = (await ethers.provider.getBlock("latest")).number + 10;
    farm = await deployFarm(
        owner,
        crssAddr,
        utils.parseEther(crssPerBlock),
        startBlock,
        wireLibAddr,
        farmLibAddr
    );
    consoleLogWithTab(`Farm deployed at: ${farm.address}`);
    const farmAddr = farm.address;

    await verifyContract(farmAddr, [
        crssAddr,
        utils.parseEther(crssPerBlock),
        startBlock,
    ])

    // XCRSS Deployment.
    xCrss = await deployXCrss(owner, "Crosswise xCrss Token", "xCRSS", wireLibAddr);
    const xCrssAddr = xCrss.address;
    consoleLogWithTab(`XCRSS deployed at: ${xCrss.address}`);
    await verifyContract(xCrssAddr, ["Crosswise xCrss Token", "xCRSS"])

    // -------------------- compensation contracts -----------

    // rCrss Deployment.
    rCrss = await deployRCrss(owner);
    const rCrssAddr = rCrss.address;
    consoleLogWithTab(`rCrss deployed at: ${rCrss.address}`);
    await verifyContract(rCrssAddr, [])

    // rCrss Deployment.
    rSyrup = await deployRSyrup(owner, crssAddr);
    const rSyrupAddr = rSyrup.address;
    consoleLogWithTab(`rSyrup deployed at: ${rSyrup.address}`);
    await verifyContract(rSyrupAddr, [crssAddr])

    // repay Deployment.
    const startRepayBlock = (await ethers.provider.getBlock("latest")).number;
    crssPerRepayBlock = "1";
    repay = await deployRepay(owner, crssAddr, rCrssAddr, rSyrupAddr, utils.parseEther(crssPerRepayBlock), startRepayBlock, wireLibAddr);
    const repayAddr = repay.address;
    consoleLogWithTab(`repay deployed at: ${repay.address}`);
    await verifyContract(repayAddr, [crssAddr, rCrssAddr, rSyrupAddr, utils.parseEther(crssPerRepayBlock), startRepayBlock])

    const deployerLog = { Label: "Deploying Address", Info: owner.address };
    const deployLog = [
        {
            Label: "Deployed and Verified CrossFactory Address",
            Info: factory.address,
        },
        {
            Label: "Deployed and Verified CrossMaker Address",
            Info: maker.address,
        },
        {
            Label: "Deployed and Verified CrossTaker Address",
            Info: taker.address,
        },
        {
            Label: "Deployed and Verified CrssToken Address",
            Info: crss.address,
        },
        {
            Label: "Deployed and Verified xCrssToken Address",
            Info: xCrssAddr
        },
        {
            Label: "Deployed and Verified CrossFarm Address",
            Info: farm.address,
        },
        {
            Label: "Deployed and Verified CrossReferral Address",
            Info: referral.address,
        },
        {
            Label: "Deployed and Verified RCrss Address",
            Info: rCrss.address,
        },
        {
            Label: "Deployed and Verified RSyrup Address",
            Info: rSyrupAddr
        },
        {
            Label: "Deployed and Verified Repay Address",
            Info: repayAddr
        },
    ];

    console.table([deployerLog, ...deployLog]);

    await setupNodeChain();
}

async function setupNodeChain() {
    //======================= Wire ==========================
    console.log("\n\tWiring contracts...".green);

    tx = crss.wire(repay.address, center.address);
    (await tx).wait();
    console.log("\tCrss token was wired: repay - O - center", repay.address, center.address);

    tx = center.wire(crss.address, maker.address);
    (await tx).wait();
    console.log("\tControlCenter was wired: crss - O - maker", crss.address, maker.address);

    tx = maker.wire(center.address, taker.address);
    (await tx).wait();
    console.log("\tmaker was wired: center - O - taker", crss.address, taker.address);

    tx = taker.wire(maker.address, farm.address);
    (await tx).wait();
    console.log("\ttaker was wired: maker - O - farm", maker.address, farm.address);

    tx = farm.wire(taker.address, factory.address);
    (await tx).wait();
    console.log("\tfarm was wired: taker - O - factory", taker.address, factory.address);

    tx = factory.wire(farm.address, xCrss.address);
    (await tx).wait();
    console.log("\tfactory was wired: farm - O - xCrss", farm.address, xCrss.address);

    tx = xCrss.wire(factory.address, repay.address);
    (await tx).wait();
    console.log("\txCrss was wired: factory - O - repay", factory.address, repay.address);

    tx = repay.wire(xCrss.address, crss.address);
    (await tx).wait();
    console.log("\trepay was wired: xCrss - O - crss", xCrss.address, crss.address);


    //======================= Setting contracts ==========================
    console.log("\n\tSetting contracts...".green);

    tx = crss.setNode(NodeTypes.indexOf("Token"), crss.address, zero_address);
    (await tx).wait();
    console.log("\tCrss was set to the node chain");

    tx = crss.setNode(NodeTypes.indexOf("Center"), center.address, zero_address);
    (await tx).wait();
    console.log("\tCenter was set to the node chain");

    tx = crss.setNode(NodeTypes.indexOf("Maker"), maker.address, zero_address);
    (await tx).wait();
    console.log("\tMaker was set to the node chain");

    tx = crss.setNode(NodeTypes.indexOf("Taker"), taker.address, zero_address);
    (await tx).wait();
    console.log("\tTaker was set to the node chain");

    tx = crss.setNode(NodeTypes.indexOf("Farm"), farm.address, zero_address);
    (await tx).wait();
    console.log("\tFarm was set to the node chain");

    tx = crss.setNode(NodeTypes.indexOf("Factory"), factory.address, zero_address);
    (await tx).wait();
    console.log("\tFactory was set to the node chain");

    tx = crss.setNode(NodeTypes.indexOf("XToken"), xCrss.address, zero_address);
    (await tx).wait();
    console.log("\txToken was fed to the node chain");

    tx = crss.setNode(NodeTypes.indexOf("Repay"), repay.address, zero_address);
    (await tx).wait();
    console.log("\trepay was fed to the node chain");

    //======================= List tokens =============================

    tx = factory.changeTokenStatus(wbnbAddr, ListStatus.indexOf("Enlisted"));
    (await tx).wait();
    console.log("\twbnb was listed");

    tx = factory.changeTokenStatus(crss.address, ListStatus.indexOf("Enlisted"));
    (await tx).wait();
    console.log("\tcrss was listed");

    // tx = factory.changeTokenStatus(mock.address, ListStatus.indexOf("Enlisted"));
    // (await tx).wait();
    // console.log("\tmock was listed");

    // tx = factory.changeTokenStatus(mock2.address, ListStatus.indexOf("Enlisted"));
    // (await tx).wait();
    // console.log("\tmock2 was listed");

    //======================= Configure fees ==========================
    console.log("\n\tConfiguring fees...".green);

    const feeStores = [
        "0x83393db5d3c19A0FFAB12E14E5a873C7e52f67Fc",
        "0x83393db5d3c19A0FFAB12E14E5a873C7e52f67Fc",
        "0x1d3c693B4B38c2f9e0E5A07E91042Cc3a3baC78A",
        "0x57Ae3A6B4f0278E838337B6547dF0c27650F16e3"
    ];
    tx = crss.setFeeStores(feeStores, zero_address);
    (await tx).wait();
    console.log("\tFeeStores were fed to the node chain");

    const FeeRates = [
        //(Developer, Buyback, Liquidity, Treasury). Order is critical.
        [FeeMagnifier, 0, 0, 0], // None. (A tool to let them pay 100% fee if they are suspicious.)
        [40, 30, 30, 0], // Transfer: 0.04%, 0.03%, 0.03%
        [40, 30, 30, 30], // Swap:
        [40, 30, 30, 0], // AddLiquidity
        [40, 30, 30, 0], // RemoveLiquidity
        [40, 30, 30, 0], // Deposit
        [40, 30, 30, 0], // Withdraw
        [40, 30, 30, 0], // CompoundAccumulated
        [40, 30, 30, 0], // VestAccumulated
        [40, 30, 30, 0], // HarvestAccumulated
        [40, 30, 30, 0], // StakeAccumulated
        [40, 30, 30, 0], // MassHarvestRewards
        [40, 30, 30, 0], // MassStakeRewards
        [40, 30, 30, 0], // MassCompoundRewards
        [40, 30, 30, 0], // WithdrawVest
        [40, 30, 30, 0], // UpdatePool
        [40, 30, 30, 0], // EmergencyWithdraw
        [0, 0, 0, 0],  // SwitchCollectOption
        [0, 0, 0, 0]  // HarvestRepay
    ];

    for (let st = 0; st < FeeRates.length; st++) {
        console.log(FeeRates[st]);
        tx = crss.setFeeRates(st, FeeRates[st], zero_address);
        (await tx).wait();
    }
    console.log("\tFeeRates were fed to the node chain");

    const stakeholders = "0x83393db5d3c19A0FFAB12E14E5a873C7e52f67Fc"; // Set it a wallet address.
    const treasury = "0x83393db5d3c19A0FFAB12E14E5a873C7e52f67Fc"
    tx = farm.setFeeParams(
        treasury,
        stakeholders,
        referral.address, // crssReferral
        100, // 0.1%, referralCommissionRate
        25000, // 25.0%, nonVestBurnRate
        5000 // 5%, compoundFeeRate
    );

    (await tx).wait();
    console.log("\tFarmFeeParams were set");

    tx = rSyrup.transferOwnership(repay.address); // Permanent. Irrevocable.
    (await tx).wait();
    console.log("\trepay became the owner of rSyrupBar");

    tx = rCrss.changeRepay(repay.address);
    (await tx).wait();
    console.log("\trCrss is equipped with repay's address");

    await center.setLiquidityChangeLimit(5000); // set it 5%.
    await center.setPriceChangeLimit(5000); // set it 5%

    const backendCaller = "0x83393db5d3c19A0FFAB12E14E5a873C7e52f67Fc"; // Set it a wallet address.
    tx = farm.setBackendCaller(backendCaller);
    (await tx).wait();
    console.log("\tBackend caller was set");

}

main()