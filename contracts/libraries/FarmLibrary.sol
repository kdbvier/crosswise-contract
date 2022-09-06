// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../session/interfaces/ISessionManager.sol";
import "../session/interfaces/ISessionFees.sol";
import "../periphery/interfaces/IMaker.sol";
import "../periphery/interfaces/ITaker.sol";
import "../farm/interfaces/ICrssToken.sol";
import "../farm/interfaces/IXCrssToken.sol";
import "../core/interfaces/IPancakePair.sol";
import "../farm/interfaces/ICrssReferral.sol";
import "../farm/interfaces/IMigratorChef.sol";
import "../farm/interfaces/ICrossFarmTypes.sol";
import "../farm/interfaces/ICrossFarm.sol";
import "../libraries/utils/TransferHelper.sol";
import "./math/SafeMath.sol";

library FarmLibrary {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    function changeLpTokensToCrssInFarm(
        address sourceLpToken,
        IMaker maker,
        ITaker taker,
        address token,
        uint256 lpAmount
    ) external returns (uint256 newCrss) {
        if (address(sourceLpToken) != address(0) && lpAmount > 0) {
            if (sourceLpToken == token) {
                newCrss = lpAmount;
            } else {
                address token0 = IPancakePair(sourceLpToken).token0();
                address token1 = IPancakePair(sourceLpToken).token1();
                bool foundDirectSwapPath;
                {
                    address pair0 = maker.getPair(token, token0);
                    address pair1 = maker.getPair(token, token1);
                    foundDirectSwapPath =
                        (address(token) == token0 || pair0 != address(0)) &&
                        (token == token1 || pair1 != address(0));
                }
                require(foundDirectSwapPath, "Swap path not found");

                uint256 balance0_old = IERC20(token0).balanceOf(address(this));
                uint256 balance1_old = IERC20(token1).balanceOf(address(this));
                IMaker(maker).removeLiquidity(token0, token1, lpAmount, 0, 0, address(this), block.timestamp);
                uint256 amount0 = IERC20(token0).balanceOf(address(this)) - balance0_old;
                uint256 amount1 = IERC20(token1).balanceOf(address(this)) - balance1_old;

                require(amount0 > 0 && amount1 > 0, "RemoveLiqudity failed");
                newCrss += _swapExactNonCrssForCrss(taker, token, token0, token, amount0);
                newCrss += _swapExactNonCrssForCrss(taker, token, token1, token, amount1);
            }
        }
    }

    function changeCrssInXTokenToLpInFarm(
        address targetLpToken,
        Nodes storage nodes,
        uint256 amountCrssInXToken,
        address dustBin
    ) public returns (uint256 newLpAmountInFarm) {
        if (targetLpToken != address(0) && amountCrssInXToken > 0) {
            uint256 balance0 = ICrssToken(nodes.token).balanceOf(address(this));
            tolerableCrssTransferFromXTokenAccount(nodes.xToken, address(this), amountCrssInXToken);
            uint256 balance1 = ICrssToken(nodes.token).balanceOf(address(this));
            uint256 amountCrssInFarm = balance1 - balance0;

            if (targetLpToken == nodes.token) {
                newLpAmountInFarm = amountCrssInFarm; // pending rewards, by definition, reside in token.balanceOf[address(this)].
            } else {
                address token0 = IPancakePair(targetLpToken).token0();
                address token1 = IPancakePair(targetLpToken).token1();
                bool foundDirectSwapPath;
                {
                    address pair0 = IMaker(nodes.maker).getPair(nodes.token, token0);
                    address pair1 = IMaker(nodes.maker).getPair(nodes.token, token1);
                    foundDirectSwapPath =
                        (nodes.token == token0 || pair0 != address(0)) &&
                        (nodes.token == token1 || pair1 != address(0));
                }
                require(foundDirectSwapPath, "Swap path not found");

                uint256 amount0 = amountCrssInFarm / 2;
                uint256 amount1 = amountCrssInFarm - amount0;
                amount0 = _swapExactCrssForNonCrss(ITaker(nodes.taker), nodes.token, nodes.token, token0, amount0);
                amount1 = _swapExactCrssForNonCrss(ITaker(nodes.taker), nodes.token, nodes.token, token1, amount1);

                require(amount0 > 0 && amount1 > 0, "Swap failed");
                balance0 = IERC20(targetLpToken).balanceOf(address(this));
                IERC20(token0).safeIncreaseAllowance(nodes.maker, amount0);
                IERC20(token1).safeIncreaseAllowance(nodes.maker, amount1);
                (uint256 _amount0, uint256 _amount1, ) = IMaker(nodes.maker).addLiquidity(
                    token0,
                    token1,
                    amount0,
                    amount1,
                    0,
                    0,
                    address(this),
                    block.timestamp
                );
                balance1 = IERC20(targetLpToken).balanceOf(address(this));

                if (_amount0 < amount0) TransferHelper.safeTransfer(token0, dustBin, amount0 - _amount0); // remove dust
                if (_amount1 < amount1) TransferHelper.safeTransfer(token1, dustBin, amount1 - _amount1); // remove dust

                newLpAmountInFarm = balance1 - balance0;
            }
        }
    }

    function _swapExactCrssForNonCrss(
        ITaker taker,
        address token,
        address tokenFr,
        address tokenTo,
        uint256 amount
    ) internal returns (uint256 resultingAmount) {
        if (tokenTo == token) {
            resultingAmount = amount;
        } else if (tokenFr != tokenTo) {
            uint256 balance0 = IERC20(tokenTo).balanceOf(address(this));

            ICrssToken(tokenFr).approve(address(taker), amount);
            address[] memory path = new address[](2);
            path[0] = tokenFr;
            path[1] = tokenTo;
            taker.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amount,
                0, // in trust of taker's price control.
                path,
                address(this),
                block.timestamp
            );
            resultingAmount = IERC20(tokenTo).balanceOf(address(this)) - balance0;
        } else {
            resultingAmount = amount;
        }
    }

    function _swapExactNonCrssForCrss(
        ITaker taker,
        address token,
        address tokenFr,
        address tokenTo,
        uint256 amount
    ) internal returns (uint256 resultingAmount) {
        if (tokenFr == token) {
            resultingAmount = amount;
        } else if (tokenFr != tokenTo) {
            uint256 balance0 = IERC20(tokenTo).balanceOf(address(this));

            ICrssToken(tokenFr).approve(address(taker), amount);
            address[] memory path = new address[](2);
            path[0] = tokenFr;
            path[1] = tokenTo;
            taker.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amount,
                0, // in trust of taker's price control.
                path,
                address(this),
                block.timestamp
            );
            resultingAmount = IERC20(tokenTo).balanceOf(address(this)) - balance0;
        } else {
            resultingAmount = amount;
        }
    }

    function swapExactTokenForToken(
        ITaker taker,
        address token,
        address tokenFr,
        address tokenTo,
        uint256 amount
    ) external returns (uint256 tokenToAmount) {
        if (tokenFr != tokenTo) {
            uint256 _tokenToAmt = IERC20(tokenTo).balanceOf(address(this));

            ICrssToken(token).approve(address(taker), amount);
            address[] memory path = new address[](2);
            path[0] = tokenFr;
            path[1] = tokenTo;
            taker.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amount,
                0, // in trust of taker's price control.
                path,
                address(this),
                block.timestamp
            );
            tokenToAmount = IERC20(tokenTo).balanceOf(address(this)) - _tokenToAmt;
        } else {
            return amount;
        }
    }

    function getTotalVestPrincipals(VestChunk[] storage vestList) public view returns (uint256 amount) {
        for (uint256 i = 0; i < vestList.length; i++) {
            amount += vestList[i].principal;
        }
    }

    function getTotalMatureVestPieces(VestChunk[] storage vestList, uint256 vestMonths)
        public
        view
        returns (uint256 amount)
    {
        for (uint256 i = 0; i < vestList.length; i++) {
            // Time simulation for test: 600 * 24 * 30. A hardhat block pushes 2 seconds of timestamp. 3 blocks will be equivalent to a month.
            uint256 elapsed = (block.timestamp - vestList[i].startTime); // * 600 * 24 * 30;
            uint256 monthsElapsed = elapsed / month >= vestMonths ? vestMonths : elapsed / month;
            uint256 unlockAmount = (vestList[i].principal * monthsElapsed) / vestMonths - vestList[i].withdrawn;
            amount += unlockAmount;
        }
    }

    function withdrawVestPieces(
        VestChunk[] storage vestList,
        uint256 vestMonths,
        uint256 amount
    ) internal returns (uint256 _amountToFill) {
        _amountToFill = amount;

        uint256 i;
        while (_amountToFill > 0 && i < vestList.length) {
            // Time simulation for test: 600 * 24 * 30. A hardhat block pushes 2 seconds of timestamp. 3 blocks will be equivalent to a month.
            uint256 elapsed = (block.timestamp - vestList[i].startTime); // * 600 * 24 * 30;
            uint256 monthsElapsed = elapsed / month >= vestMonths ? vestMonths : elapsed / month;
            uint256 unlockAmount = (vestList[i].principal * monthsElapsed) / vestMonths - vestList[i].withdrawn;
            if (unlockAmount > _amountToFill) {
                vestList[i].withdrawn += _amountToFill; // so, vestList[i].withdrawn < vestList[i].principal * monthsElapsed / vestMonths.
                _amountToFill = 0;
            } else {
                _amountToFill -= unlockAmount;
                vestList[i].withdrawn += unlockAmount; // so, vestList[i].withdrawn == vestList[i].principal * monthsElapsed / vestMonths.
            }
            if (vestList[i].withdrawn == vestList[i].principal) {
                // if and only if monthsElapsed == vestMonths.
                for (uint256 j = i; j < vestList.length - 1; j++) vestList[j] = vestList[j + 1];
                vestList.pop();
            } else {
                i++;
            }
        }
    }

    /**
     * @dev Transfer Crss amount with tolerance against (small?) numeric errors.
     */
    function tolerableCrssTransferFromXTokenAccount(
        address xToken,
        address _to,
        uint256 _amount
    ) public {
        IXCrssToken(xToken).safeCrssTransfer(_to, _amount);
    }

    function takePendingCollectively(
        PoolInfo storage pool,
        FarmFeeParams storage feeParams,
        Nodes storage nodes,
        bool periodic
    ) public {
        uint256 subPoolPending;
        uint256 totalRewards;

        uint256 lpSupply = pool.lpToken.balanceOf(address(this));

        if (lpSupply > 0) {
            uint256 feePaid;
            uint256 halfToCompound;
            uint256 newLpAmountInFarm;
            uint256 halfToVest;
            uint256 halfToSend;

            //-------------------- OnOff SubPool Group Takes -------------------- Compound On, Vest Off
            uint256 share = pool.OnOff.sumAmount + pool.OnOff.Comp.bulk;
            subPoolPending = (share * pool.reward) / lpSupply;

            if (subPoolPending > 0) {
                totalRewards += subPoolPending;
                feePaid = (subPoolPending * feeParams.nonVestBurnRate) / FeeMagnifier;
                ICrssToken(nodes.token).burn(nodes.xToken, feePaid);
                subPoolPending -= feePaid;
                subPoolPending -= payCompoundFee(nodes.token, feeParams, subPoolPending, nodes);
            }

            if (periodic) {
                // It takes the amount that belong to the users who left this branch after the latest patrol.
                subPoolPending += _emptySubPool(pool.OnOff.PreComp, share);
                if (subPoolPending > 0) {
                    newLpAmountInFarm = changeCrssInXTokenToLpInFarm(
                        address(pool.lpToken),
                        nodes,
                        subPoolPending,
                        feeParams.treasury
                    );
                    _addToSubPool(pool.OnOff.Comp, share, newLpAmountInFarm); // updates bulk & accPerShare.
                }
            } else {
                // This amount is not guranteed to be returned to the users who's deposits participate in sumAmount, if they leave this branch.
                if (subPoolPending > 0) _addToSubPool(pool.OnOff.PreComp, share, subPoolPending); // updates bulk & accPerShare.
            }

            //-------------------- OnOn SubPool Group Takes -------------------- Compound On, Vest On
            share = pool.OnOn.sumAmount + pool.OnOn.Comp.bulk;
            subPoolPending = (share * pool.reward) / lpSupply;

            if (subPoolPending > 0) {
                totalRewards += subPoolPending;
                halfToCompound = subPoolPending / 2;
                halfToVest = subPoolPending - halfToCompound;
                halfToCompound -= payCompoundFee(nodes.token, feeParams, halfToCompound, nodes);
            } // else: halfToCompound = 0, halfToVest = 0; implicitly.

            if (periodic) {
                // It takes the amount that belong to the users who left this branch after the latest patrol.
                halfToCompound += _emptySubPool(pool.OnOn.PreComp, share);
                if (halfToCompound > 0) {
                    newLpAmountInFarm = changeCrssInXTokenToLpInFarm(
                        address(pool.lpToken),
                        nodes,
                        halfToCompound,
                        feeParams.treasury
                    );
                    _addToSubPool(pool.OnOn.Comp, share, newLpAmountInFarm); // updates bulk & accPerShare.
                }
            } else {
                // This amount is not guranteed to be returned to the users who's deposits participate in sumAmount, if they leave this branch.
                if (halfToCompound > 0) _addToSubPool(pool.OnOn.PreComp, share, halfToCompound); // updates bulk & accPerShare.
            }
            if (halfToVest > 0) _addToSubPool(pool.OnOn.Vest, pool.OnOn.sumAmount, halfToVest); // updates bulk & accPerShare.

            //-------------------- OffOn SubPool Group Takes -------------------- Compound Off, Vest On

            subPoolPending = ((pool.OffOn.sumAmount) * pool.reward) / lpSupply;

            if (subPoolPending > 0) {
                totalRewards += subPoolPending;
                halfToVest = subPoolPending / 2;
                halfToSend = subPoolPending - halfToVest;
                _addToSubPool(pool.OffOn.Vest, pool.OffOn.sumAmount, halfToVest); // updates bulk & accPerShare.
                _addToSubPool(pool.OffOn.Accum, pool.OffOn.sumAmount, halfToSend); // updates bulk & accPerShare.
            }
            //-------------------- OffOff SubPool Group Takes -------------------- Compound Off, Vest Off

            subPoolPending = ((pool.OffOff.sumAmount) * pool.reward) / lpSupply;

            if (subPoolPending > 0) {
                totalRewards += subPoolPending;
                feePaid = (subPoolPending * feeParams.nonVestBurnRate) / FeeMagnifier;
                ICrssToken(nodes.token).burn(nodes.xToken, feePaid);
                subPoolPending -= feePaid;
                _addToSubPool(pool.OffOff.Accum, pool.OffOff.sumAmount, subPoolPending); // updates bulk & accPerShare.
            }
        }
    }

    function _addToSubPool(
        SubPool storage subPool,
        uint256 totalShare,
        uint256 newAmount
    ) internal {
        subPool.bulk += newAmount;
        if (totalShare > 0) {
            // Note: that inteter devision is not greater than real division. So it's safe.
            // Note: if it's less than real division, then a seed of dust is formed here.
            subPool.accPerShare += ((newAmount * 1e12) / totalShare);
        }
    }

    function _emptySubPool(SubPool storage subPool, uint256 totalShare) internal returns (uint256 amount) {
        // keep totalShare for later use.
        amount = subPool.bulk;
        subPool.bulk = 0;
        subPool.accPerShare = 0;
    }

    function payCompoundFee(
        address payerToken,
        FarmFeeParams storage feeParams,
        uint256 amount,
        Nodes storage nodes
    ) public returns (uint256 feesPaid) {
        feesPaid = (amount * feeParams.compoundFeeRate) / FeeMagnifier;
        if (feesPaid > 0) {
            uint256 half = feesPaid / 2;
            if (payerToken == nodes.token) {
                tolerableCrssTransferFromXTokenAccount(nodes.xToken, feeParams.stakeholders, half);
                tolerableCrssTransferFromXTokenAccount(nodes.xToken, feeParams.treasury, feesPaid - half);
            } else {
                TransferHelper.safeTransfer(payerToken, feeParams.stakeholders, half);
                TransferHelper.safeTransfer(payerToken, feeParams.treasury, feesPaid - half);
            }
        }
    }

    function payReferralComission(
        PoolInfo storage pool,
        UserInfo storage user,
        address msgSender,
        FarmFeeParams storage feeParams,
        Nodes storage nodes
    ) public {
        //-------------------- Pay referral fee outside of user's pending reward --------------------
        uint256 userPending = (getRewardPayroll(pool, user) * pool.accCrssPerShare) / 1e12 - user.rewardDebt; // This is the only place user.rewardDebt works explicitly.
        if (userPending > 0) {
            _mintReferralCommission(msgSender, userPending, feeParams, nodes);
        }
    }

    /**
     * @dev Take the current rewards related to user's deposit, so that the user can change their deposit further.
     */

    function takeIndividualReward(
        PoolInfo storage pool,
        UserInfo storage user,
        uint256 userShare
    ) public {
        //-------------------- Calling User Takes -------------------------------------------------------------------------
        if (user.collectOption == CollectOption.OnOff && user.amount > 0) {
            // dust may be formed here, due to accPerShare less than its real value.
            uint256 userCompound = (userShare * pool.OnOff.Comp.accPerShare) / 1e12 - user.debt1;
            if (userCompound > 0) {
                if (pool.OnOff.Comp.bulk < userCompound) userCompound = pool.OnOff.Comp.bulk;
                pool.OnOff.Comp.bulk -= userCompound;
                user.amount += userCompound; //---------- Compound
                pool.OnOff.sumAmount += userCompound;
                user.debt1 = (user.amount * pool.OnOff.Comp.accPerShare) / 1e12; // user.amount now represents userShare.
            }
        } else if (user.collectOption == CollectOption.OnOn && user.amount > 0) {
            uint256 userAmount = user.amount;
            // dust may be formed here, due to accPerShare less than its real value.
            uint256 userCompound = (userShare * pool.OnOn.Comp.accPerShare) / 1e12 - user.debt1;
            if (userCompound > 0) {
                if (pool.OnOn.Comp.bulk < userCompound) userCompound = pool.OnOn.Comp.bulk;
                pool.OnOn.Comp.bulk -= userCompound;
                user.amount += userCompound; //---------- Compound
                pool.OnOn.sumAmount += userCompound;
                user.debt1 = (user.amount * pool.OnOn.Comp.accPerShare) / 1e12; // user.amount now represents userShare.
            }

            // dust may be formed here, due to accPerShare less than its real value.
            uint256 userVest = (userAmount * pool.OnOn.Vest.accPerShare) / 1e12 - user.debt2;
            if (userVest > 0) {
                if (pool.OnOn.Vest.bulk < userVest) userVest = pool.OnOn.Vest.bulk;
                pool.OnOn.Vest.bulk -= userVest;
                user.vestList.push(VestChunk({principal: userVest, withdrawn: 0, startTime: block.timestamp})); //---------- Put in vesting
                user.debt2 = (user.amount * pool.OnOn.Vest.accPerShare) / 1e12;
            }
        } else if (user.collectOption == CollectOption.OffOn && user.amount > 0) {
            uint256 userAmount = user.amount;
            // dust may be formed here, due to accPerShare less than its real value.
            uint256 userVest = (userAmount * pool.OffOn.Vest.accPerShare) / 1e12 - user.debt1; //
            if (userVest > 0) {
                if (pool.OffOn.Vest.bulk < userVest) userVest = pool.OffOn.Vest.bulk;
                pool.OffOn.Vest.bulk -= userVest;
                user.vestList.push(VestChunk({principal: userVest, withdrawn: 0, startTime: block.timestamp})); //---------- Put in vesting.
                user.debt1 = (user.amount * pool.OffOn.Vest.accPerShare) / 1e12;
            }

            // dust may be formed here, due to accPerShare less than its real value.
            uint256 userAccum = (userAmount * pool.OffOn.Accum.accPerShare) / 1e12 - user.debt2;
            if (userAccum > 0) {
                if (pool.OffOn.Accum.bulk < userAccum) userAccum = pool.OffOn.Accum.bulk;
                pool.OffOn.Accum.bulk -= userAccum;
                user.accumulated += userAccum; //---------- Accumulate.
                user.debt2 = (user.amount * pool.OffOn.Accum.accPerShare) / 1e12;
            }
        } else if (user.collectOption == CollectOption.OffOff && user.amount > 0) {
            // dust may be formed here, due to accPerShare less than its real value.
            uint256 userAccum = (user.amount * pool.OffOff.Accum.accPerShare) / 1e12 - user.debt1;
            if (userAccum > 0) {
                if (pool.OffOff.Accum.bulk < userAccum) userAccum = pool.OffOff.Accum.bulk;
                pool.OffOff.Accum.bulk -= userAccum;
                user.accumulated += userAccum; //---------- Accumulate.
                //user.debt1 = user.amount * pool.OffOff.Accum.accPerShare / 1e12;
            }
        }

        user.rewardDebt = (getRewardPayroll(pool, user) * pool.accCrssPerShare) / 1e12;
    }

    /**
     * @dev Begine a new rewarding interval with a new user.amount.
     * @dev Change the user.amount value, change branches' sum of user.amounts, and reset all debt so that pendings are zero now.
     * Note: This is not the place to upgrade accPerShare, because this call is not a reward gain.
     * Reward gain, instead, takes place in _updatePool, for pools, and _takeIndividualRewards, for branches and subpools.
     */
    function startRewardCycle(
        PoolInfo storage pool,
        UserInfo storage user,
        Nodes storage nodes,
        FarmFeeParams storage feeParams,
        uint256 amount,
        bool addNotSubtract
    ) public {
        // Open it for 0 amount, as it re-bases user debts.

        user.amount = addNotSubtract ? (user.amount + amount) : (user.amount - amount);

        if (user.collectOption == CollectOption.OnOff) {
            pool.OnOff.sumAmount = addNotSubtract ? pool.OnOff.sumAmount + amount : pool.OnOff.sumAmount - amount;
            if (pool.OnOff.sumAmount == 0) {
                // user.amount is also 0.
                if (pool.OnOff.Comp.bulk > 0) {
                    // residue dust grew over 1%.
                    pool.lpToken.safeTransfer(feeParams.treasury, pool.OnOff.Comp.bulk);
                    pool.OnOff.Comp.bulk = 0;
                }
                pool.OnOff.Comp.accPerShare = 0;
            }
            user.debt1 = (user.amount * pool.OnOff.Comp.accPerShare) / 1e12;
        } else if (user.collectOption == CollectOption.OnOn) {
            pool.OnOn.sumAmount = addNotSubtract ? pool.OnOn.sumAmount + amount : pool.OnOn.sumAmount - amount;
            if (pool.OnOn.sumAmount == 0) {
                // user.amount is also 0.
                if (pool.OnOn.Comp.bulk > 0) {
                    // residue dust grew over 1%.
                    pool.lpToken.safeTransfer(feeParams.treasury, pool.OnOn.Comp.bulk);
                    pool.OnOn.Comp.bulk = 0;
                }
                pool.OnOn.Comp.accPerShare = 0;
                if (pool.OnOn.Vest.bulk > 0) {
                    tolerableCrssTransferFromXTokenAccount(nodes.xToken, feeParams.treasury, pool.OnOn.Vest.bulk);
                    pool.OnOn.Vest.bulk = 0;
                }
                pool.OnOn.Vest.accPerShare = 0;
            }
            user.debt1 = (user.amount * pool.OnOn.Comp.accPerShare) / 1e12;
            user.debt2 = (user.amount * pool.OnOn.Vest.accPerShare) / 1e12;
        } else if (user.collectOption == CollectOption.OffOn) {
            pool.OffOn.sumAmount = addNotSubtract ? pool.OffOn.sumAmount + amount : pool.OffOn.sumAmount - amount;
            if (pool.OffOn.sumAmount == 0) {
                // user.amount is also 0.
                if (pool.OffOn.Vest.bulk > 0) {
                    tolerableCrssTransferFromXTokenAccount(nodes.xToken, feeParams.treasury, pool.OffOn.Vest.bulk);
                    pool.OffOn.Vest.bulk = 0;
                }
                pool.OffOn.Vest.accPerShare = 0;
                if (pool.OffOn.Accum.bulk > 0) {
                    // residue dust grew over 1%.
                    tolerableCrssTransferFromXTokenAccount(nodes.xToken, feeParams.treasury, pool.OffOn.Accum.bulk);
                    pool.OffOn.Accum.bulk = 0;
                }
                pool.OffOn.Accum.accPerShare = 0;
            }
            user.debt1 = (user.amount * pool.OffOn.Vest.accPerShare) / 1e12;
            user.debt2 = (user.amount * pool.OffOn.Accum.accPerShare) / 1e12;
        } else if (user.collectOption == CollectOption.OffOff) {
            pool.OffOff.sumAmount = addNotSubtract ? pool.OffOff.sumAmount + amount : pool.OffOff.sumAmount - amount;
            if (pool.OffOff.sumAmount == 0) {
                // user.amount is also 0.
                if (pool.OffOff.Accum.bulk > 0) {
                    // residue dust grew over 1%.
                    tolerableCrssTransferFromXTokenAccount(nodes.xToken, feeParams.treasury, pool.OffOff.Accum.bulk);
                    pool.OffOff.Accum.bulk = 0;
                }
                pool.OffOff.Accum.accPerShare = 0;
            }
            user.debt1 = (user.amount * pool.OffOff.Accum.accPerShare) / 1e12;
        }

        user.rewardDebt = (getRewardPayroll(pool, user) * pool.accCrssPerShare) / 1e12;
    }

    /**
     * @dev Take the current rewards related to user's deposit, so that the user can change their deposit further.
     */

    function getRewardPayroll(PoolInfo storage pool, UserInfo storage user) public view returns (uint256 userLp) {
        userLp = user.amount;

        if (user.collectOption == CollectOption.OnOff && user.amount > 0) {
            userLp += ((user.amount * pool.OnOff.Comp.accPerShare) / 1e12 - user.debt1); //---------- Compound
        } else if (user.collectOption == CollectOption.OnOn && user.amount > 0) {
            userLp += ((user.amount * pool.OnOn.Comp.accPerShare) / 1e12 - user.debt1); //---------- Compound
        }
    }

    /**
     * @dev Pay referral commission to the referrer who referred this user.
     */
    function _mintReferralCommission(
        address _user,
        uint256 principal,
        FarmFeeParams storage feeParams,
        Nodes storage nodes
    ) internal {
        uint256 commission = principal.mul(feeParams.referralCommissionRate).div(FeeMagnifier);
        if (feeParams.crssReferral != address(0) && commission > 0) {
            address referrer = ICrssReferral(feeParams.crssReferral).getReferrer(_user);
            if (referrer != address(0)) {
                ICrssToken(nodes.token).mint(nodes.xToken, commission);
                ICrssReferral(feeParams.crssReferral).recordReferralCommission(referrer, commission);
            }
        }
    }

    function withdrawOutstandingCommission(
        address referrer,
        uint256 amount,
        FarmFeeParams storage feeParams,
        Nodes storage nodes
    ) external {
        uint256 available = ICrssReferral(feeParams.crssReferral).getOutstandingCommission(referrer);
        if (available < amount) amount = available;
        if (amount > 0) {
            tolerableCrssTransferFromXTokenAccount(nodes.xToken, referrer, amount);
            ICrssReferral(feeParams.crssReferral).debitOutstandingCommission(referrer, amount);
        }
    }

    function migratePool(PoolInfo storage pool, IMigratorChef migrator) external returns (IERC20 newLpToken) {
        IERC20 lpToken = pool.lpToken;
        uint256 bal = lpToken.balanceOf(address(this));
        lpToken.safeApprove(address(migrator), bal);
        newLpToken = migrator.migrate(lpToken);
        require(bal == newLpToken.balanceOf(address(this)), "migration inconsistent");
    }

    function switchCollectOption(
        PoolInfo storage pool,
        UserInfo storage user,
        CollectOption newOption,
        address msgSender,
        FarmFeeParams storage feeParams,
        Nodes storage nodes,
        FarmParams storage farmParams,
        FeeStores storage feeStores
    ) external returns (bool switched) {
        CollectOption orgOption = user.collectOption;

        if (orgOption != newOption) {
            finishRewardCycle(pool, user, msgSender, feeParams, nodes, farmParams, feeStores);
            uint256 userAmount = user.amount;
            startRewardCycle(pool, user, nodes, feeParams, userAmount, false); // false: addNotSubract

            user.collectOption = newOption;

            startRewardCycle(pool, user, nodes, feeParams, userAmount, true); // true: addNotSubract

            switched = true;
        }
    }

    function collectAccumulated(
        address msgSender,
        PoolInfo[] storage poolInfo,
        mapping(uint256 => mapping(address => UserInfo)) storage userInfo,
        FarmFeeParams storage feeParams,
        Nodes storage nodes,
        FarmParams storage farmParams,
        FeeStores storage feeStores
    ) external returns (uint256 rewards) {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; pid++) {
            PoolInfo storage pool = poolInfo[pid];
            UserInfo storage user = userInfo[pid][msgSender];

            finishRewardCycle(pool, user, msgSender, feeParams, nodes, farmParams, feeStores);
            rewards += user.accumulated;
            user.accumulated = 0;
        }
    }

    function massCompoundRewards(
        address msgSender,
        PoolInfo[] storage poolInfo,
        mapping(uint256 => mapping(address => UserInfo)) storage userInfo,
        Nodes storage nodes,
        FarmFeeParams storage feeParams,
        FarmParams storage farmParams,
        FeeStores storage feeStores
    ) external returns (uint256 totalCompounded, uint256 crssToPay) {
        uint256 len = poolInfo.length;
        for (uint256 pid = 0; pid < len; pid++) {
            PoolInfo storage pool = poolInfo[pid];
            UserInfo storage user = userInfo[pid][msgSender];
            finishRewardCycle(pool, user, msgSender, feeParams, nodes, farmParams, feeStores);
            uint256 accumCrss = user.accumulated;
            if (feeParams.compoundFeeRate > 0) {
                uint256 fee = (accumCrss * feeParams.compoundFeeRate) / FeeMagnifier;
                accumCrss -= fee;
                crssToPay += fee;
            }
            totalCompounded += accumCrss;
            uint256 newLpAmount = changeCrssInXTokenToLpInFarm(
                address(pool.lpToken),
                nodes,
                accumCrss,
                feeParams.treasury
            );
            startRewardCycle(pool, user, nodes, feeParams, newLpAmount, true); // true: addNotSubract
            user.accumulated = 0;
        }

        if (crssToPay > 0) {
            uint256 half = crssToPay / 2;
            tolerableCrssTransferFromXTokenAccount(nodes.xToken, feeParams.stakeholders, half);
            tolerableCrssTransferFromXTokenAccount(nodes.xToken, feeParams.treasury, crssToPay - half);
        }
    }

    function calcTotalAlloc(PoolInfo[] storage poolInfo) internal view returns (uint256 totalAllocPoint) {
        uint256 length = poolInfo.length;
        uint256 points;
        for (uint256 pid = 0; pid < length; ++pid) {
            points = points + poolInfo[pid].allocPoint;
        }
        totalAllocPoint = points;
    }

    function setPool(
        PoolInfo[] storage poolInfo,
        uint256 pid,
        uint256 _allocPoint,
        uint256 _depositFeeRate
    ) external returns (uint256 totalAllocPoint) {
        PoolInfo storage pool = poolInfo[pid];
        pool.allocPoint = _allocPoint;
        pool.depositFeeRate = _depositFeeRate;

        totalAllocPoint = calcTotalAlloc(poolInfo);
        require(_allocPoint < 100, "Invalid allocPoint");
    }

    function addPool(
        uint256 _allocPoint,
        address _lpToken,
        uint256 _depositFeeRate,
        uint256 startBlock,
        PoolInfo[] storage poolInfo
    ) external returns (uint256 totalAllocPoint) {
        poolInfo.push(buildStandardPool(_lpToken, _allocPoint, startBlock, _depositFeeRate));

        totalAllocPoint = calcTotalAlloc(poolInfo);
        require(_allocPoint < 100, "Invalid allocPoint");
    }

    function getMultiplier(
        uint256 _from,
        uint256 _to,
        uint256 bonusMultiplier
    ) public pure returns (uint256) {
        return (_to - _from) * bonusMultiplier;
    }

    /**
     * @dev Mint rewards, and increase the pool's accCrssPerShare, accordingly.
     * accCrssPerShare: the amount of rewards that a user would have gaind NOW
     * if they had maintained 1e12 LP tokens as user.amount since the very beginning.
     */

    function updatePool(
        PoolInfo storage pool,
        FarmParams storage farmParams,
        Nodes storage nodes,
        FeeStores storage feeStores
    ) public {
        if (pool.lastRewardBlock < block.number) {
            uint256 lpSupply = pool.lpToken.balanceOf(address(this));
            if (0 < pool.allocPoint && 0 < lpSupply) {
                uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number, farmParams.bonusMultiplier);
                uint256 crssReward = (multiplier * farmParams.crssPerBlock * pool.allocPoint) /
                    farmParams.totalAllocPoint;
                // Mint 8% to dev wallet
                uint256 teamEmission = (crssReward * 8) / 100;
                crssReward -= teamEmission;
                ICrssToken(nodes.token).mint(feeStores.develop, teamEmission);
                ICrssToken(nodes.token).mint(nodes.xToken, crssReward);
                pool.reward = crssReward; // used as a checksum
                pool.accCrssPerShare += ((crssReward * 1e12) / lpSupply);
            } else {
                pool.reward = 0;
            }
            pool.lastRewardBlock = block.number;
        } else {
            pool.reward = 0;
        }
    }

    function pendingCrss(
        PoolInfo storage pool,
        UserInfo storage user,
        FarmParams storage farmParams
    ) public view returns (uint256) {
        uint256 accCrssPerShare = pool.accCrssPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));

        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number, farmParams.bonusMultiplier);
            uint256 crssReward = multiplier.mul(farmParams.crssPerBlock).mul(pool.allocPoint).div(
                farmParams.totalAllocPoint
            );
            accCrssPerShare += ((crssReward * 1e12) / lpSupply);
        }
        return (getRewardPayroll(pool, user) * accCrssPerShare) / 1e12 - user.rewardDebt;
    }

    function finishRewardCycle(
        PoolInfo storage pool,
        UserInfo storage user,
        address msgSender,
        FarmFeeParams storage feeParams,
        Nodes storage nodes,
        FarmParams storage farmParams,
        FeeStores storage feeStores
    ) public {
        updatePool(pool, farmParams, nodes, feeStores);
        if (pool.reward > 0) {
            payReferralComission(pool, user, msgSender, feeParams, nodes);
            uint256 userShare = getRewardPayroll(pool, user);
            takePendingCollectively(pool, feeParams, nodes, false); // subPools' bulk and accPerShare.. periodic: false
            takeIndividualReward(pool, user, userShare);
            pool.reward = 0;
        }
    }

    function getUserState(
        address msgSender,
        uint256 pid,
        PoolInfo[] storage poolInfo,
        mapping(uint256 => mapping(address => UserInfo)) storage userInfo,
        Nodes storage nodes,
        FarmParams storage farmParams,
        uint256 vestMonths
    ) external view returns (UserState memory userState) {
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage user = userInfo[pid][msgSender];
        userState.collectOption = uint256(user.collectOption);
        userState.deposit = user.amount;
        userState.accRewards = user.accumulated;
        userState.totalVest = getTotalVestPrincipals(user.vestList);
        userState.totalMatureVest = getTotalMatureVestPieces(user.vestList, vestMonths);
        userState.pendingCrss = pendingCrss(pool, user, farmParams);
        userState.rewardPayroll = getRewardPayroll(pool, user);
        userState.lpBalance = pool.lpToken.balanceOf(msgSender);
        userState.crssBalance = ICrssToken(nodes.token).balanceOf(msgSender);
        for (pid = 0; pid < poolInfo.length; pid++) {
            userState.totalAccRewards += userInfo[pid][msgSender].accumulated;
        }
    }

    function getSubPooledCrss(PoolInfo storage pool, UserInfo storage user)
        external
        view
        returns (SubPooledCrss memory spc)
    {
        if (user.collectOption == CollectOption.OnOff && user.amount > 0) {} else if (
            user.collectOption == CollectOption.OnOn && user.amount > 0
        ) {
            spc.toVest = (user.amount * pool.OnOn.Vest.accPerShare) / 1e12 - user.debt2;
        } else if (user.collectOption == CollectOption.OffOn && user.amount > 0) {
            spc.toVest = (user.amount * pool.OffOn.Vest.accPerShare) / 1e12 - user.debt1;
            spc.toAccumulate = (user.amount * pool.OffOn.Accum.accPerShare) / 1e12 - user.debt2;
        } else if (user.collectOption == CollectOption.OffOff && user.amount > 0) {
            spc.toAccumulate = (user.amount * pool.OffOff.Accum.accPerShare) / 1e12 - user.debt1;
        }
    }

    function payDepositFeeLPFromFarm(
        PoolInfo storage pool,
        uint256 amount,
        FeeStores storage feeStores
    ) external returns (uint256 feePaid) {
        if (pool.depositFeeRate > 0) {
            feePaid = (amount * pool.depositFeeRate) / FeeMagnifier;
            uint256 treasury = feePaid / 2;
            pool.lpToken.safeTransfer(feeStores.treasury, treasury);
            pool.lpToken.safeTransfer(feeStores.develop, feePaid - treasury);
        }
    }

    function payDepositFeeCrssFromXCrss(
        PoolInfo storage pool,
        address xToken,
        uint256 amount,
        FeeStores storage feeStores
    ) external returns (uint256 feePaid) {
        if (pool.depositFeeRate > 0) {
            feePaid = (amount * pool.depositFeeRate) / FeeMagnifier;
            uint256 treasury = feePaid / 2;
            tolerableCrssTransferFromXTokenAccount(xToken, feeStores.treasury, treasury);
            tolerableCrssTransferFromXTokenAccount(xToken, feeStores.develop, feePaid - treasury);
        }
    }

    function periodicPatrol(
        PoolInfo[] storage poolInfo,
        FarmParams storage farmParams,
        FarmFeeParams storage feeParams,
        Nodes storage nodes,
        uint256 lastPatrolRound,
        uint256 patrolCycle,
        FeeStores storage feeStores
    ) external returns (uint256 newLastPatrolRound) {
        uint256 currRound = block.timestamp / patrolCycle;
        if (lastPatrolRound < currRound) {
            // do periodicPatrol
            for (uint256 pid; pid < poolInfo.length; pid++) {
                PoolInfo storage pool = poolInfo[pid];
                updatePool(pool, farmParams, nodes, feeStores);
                if (pool.reward > 0) {
                    takePendingCollectively(pool, feeParams, nodes, true); // periodic: true
                    pool.reward = 0;
                }
            }
            newLastPatrolRound = currRound;
        }
    }

    function pullFromUser(
        PoolInfo storage pool,
        address userAddr,
        uint256 amount
    ) external returns (uint256 arrived) {
        uint256 oldBalance = pool.lpToken.balanceOf(address(this));
        pool.lpToken.safeTransferFrom(userAddr, address(this), amount);
        uint256 newBalance = pool.lpToken.balanceOf(address(this));
        arrived = newBalance - oldBalance;
    }

    function buildStandardPool(
        address lp,
        uint256 allocPoint,
        uint256 startBlock,
        uint256 depositFeeRate
    ) public view returns (PoolInfo memory pool) {
        pool = PoolInfo({
            lpToken: IERC20(lp),
            allocPoint: allocPoint,
            lastRewardBlock: (block.number > startBlock ? block.number : startBlock),
            accCrssPerShare: 0,
            depositFeeRate: depositFeeRate,
            reward: 0,
            OnOff: Struct_OnOff(0, SubPool(0, 0), SubPool(0, 0)),
            OnOn: Struct_OnOn(0, SubPool(0, 0), SubPool(0, 0), SubPool(0, 0)),
            OffOn: Struct_OffOn(0, SubPool(0, 0), SubPool(0, 0)),
            OffOff: Struct_OffOff(0, SubPool(0, 0))
        });
    }

    function migrate(PoolInfo storage pool, IMigratorChef migrator) external {
        require(address(migrator) != address(0), "migrate: no migrator");
        IERC20 lpToken = pool.lpToken;
        uint256 bal = lpToken.balanceOf(address(this));
        lpToken.safeApprove(address(migrator), bal);
        IERC20 newLpToken = migrator.migrate(lpToken);
        require(bal == newLpToken.balanceOf(address(this)), "migrate: bad");
        pool.lpToken = newLpToken;
    }
}

//  1  function Dijkstra(Graph, source):
//  2
//  3      for each vertex v in Graph.Vertices:
//  4          dist[v] ← INFINITY
//  5          prev[v] ← UNDEFINED
//  6          add v to Q
//  7      dist[source] ← 0
//  8
//  9      while Q is not empty:
// 10          u ← vertex in Q with min dist[u]
// 11          remove u from Q
// 12
// 13          for each neighbor v of u still in Q:
// 14              alt ← dist[u] + Graph.Edges(u, v)
// 15              if alt < dist[v]:
// 16                  dist[v] ← alt
// 17                  prev[v] ← u
// 18
// 19      return dist[], prev[]

// 1  S ← empty sequence
// 2  u ← target
// 3  if prev[u] is defined or u = source:          // Do something only if the vertex is reachable
// 4      while u is defined:                       // Construct the shortest path with a stack S
// 5          insert u at the beginning of S        // Push the vertex onto the stack
// 6          u ← prev[u]                           // Traverse from target to source
