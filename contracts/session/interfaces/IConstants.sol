// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;


enum ActionType {
    None,
    Transfer,
    Swap,
    AddLiquidity,
    RemoveLiquidity,
    Deposit,
    Withdraw,
    CompoundAccumulated,
    VestAccumulated,
    HarvestAccumulated,
    StakeAccumulated,
    MassHarvestRewards,
    MassStakeRewards,
    MassCompoundRewards,
    WithdrawVest,
    UpdatePool,
    EmergencyWithdraw,
    SwitchCollectOption,
    HarvestRepay
}

uint256 constant NumberSessionTypes = 19;
uint256 constant CrssPoolAllocPercent = 25;
uint256 constant CompensationPoolAllocPercent = 2;


struct ActionParams {
    ActionType actionType;
    uint256 session;
    uint256 lastSession;
    bool isUserAction;
}

struct FeeRates {
    uint32 develop;
    uint32 buyback;
    uint32 liquidity;
    uint32 treasury;
}
struct FeeStores {
    address develop;
    address buyback;
    address liquidity;
    address treasury;
}

struct PairSnapshot {
    address pair;
    address token0;
    address token1;
    uint256 reserve0;
    uint256 reserve1;
    uint8   decimal0;
    uint8   decimal1;
}

enum ListStatus {
    None,
    Cleared,
    Enlisted,
    Delisted
}

struct Pair {
    address token0;
    address token1;
    ListStatus status;
}

uint256 constant FeeMagnifierPower = 5;
uint256 constant FeeMagnifier = uint256(10) ** FeeMagnifierPower;
uint256 constant SqaureMagnifier = FeeMagnifier * FeeMagnifier;
uint256 constant LiquiditySafety = 1e2;
