#!/bin/bash
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployFactory.js
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployCenter.js