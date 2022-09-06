#!/bin/bash
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployFarm.js
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployRSyrup.js
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployRepay.js