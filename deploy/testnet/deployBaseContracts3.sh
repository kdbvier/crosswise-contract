#!/bin/bash
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployReferral.js
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployRCrss.js