#!/bin/bash
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployCrss.js
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployXCrss.js