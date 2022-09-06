#!/bin/bash
npx hardhat --network bsc_testnet run ../../scripts/deploy/WireContract.js
npx hardhat --network bsc_testnet run ../../scripts/deploy/SetNode.js
npx hardhat --network bsc_testnet run ../../scripts/deploy/SetFee.js