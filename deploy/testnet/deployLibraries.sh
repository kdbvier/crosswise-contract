#!/bin/bash
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployWireLib.js
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployRouterLib.js
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployFarmLib.js