#!/bin/bash
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployMaker.js
npx hardhat --network bsc_testnet run ../../scripts/deploy/deployTaker.js