exports.config = {
  // Address for Contract Use
  buyback: "0x83393db5d3c19A0FFAB12E14E5a873C7e52f67Fc",         // Address for Collecting Buyback Fee
  liquidity: "0x1d3c693B4B38c2f9e0E5A07E91042Cc3a3baC78A",       // Address for Collecting Liqudity Fee
  treasury: "0x57Ae3A6B4f0278E838337B6547dF0c27650F16e3",        // Address for Collecting Treasury Fee
  stakeHolders: "0x83393db5d3c19A0FFAB12E14E5a873C7e52f67Fc",    // Address for Collecting Autocompound Fee
  backendCaller: "0x83393db5d3c19A0FFAB12E14E5a873C7e52f67Fc",   // Address for Calling Contract from Backend

  // Numbers for varaious Rates
  referralCommisionRate: 1000,
  vestBurnRate: 25000,
  compoundFeeRate: 5000,

  // Infos vary in mainnet and testnet
  bsc_mainnet: {
    wbnb: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    busd: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    pair: "", // Crss-BNB Pair Address after deploy for verification
    crssPerBlock: "1.2", // Crss Emission Rate Per Block
    crssPerRepayBlock: "0.35", // Crss Compensation Emission Rate Per Block
  },

  bsc_testnet: {
    wbnb: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
    busd: "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee",
    pair: "0xf90e86E6ea3C7A71a19A4A044b98944A87e2acF3",
    crssPerBlock: "0.0000012",
    crssPerRepayBlock: "0.000035",
  },
}

const FeeMagnifier = 100000;
exports.FeeMagnifier;

// Fee rates for Contract use
exports.feeRates = [
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
]