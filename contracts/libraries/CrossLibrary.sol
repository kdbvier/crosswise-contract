// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./math/SafeMath.sol";
import "../core/interfaces/ICrossPair.sol";
import "../session/interfaces/IConstants.sol";
import "../libraries/utils/TransferHelper.sol";

library CrossLibrary {
    using SafeMath for uint256;

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "CrossLibrary: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "CrossLibrary: ZERO_ADDRESS");
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(
        address factory,
        address tokenA,
        address tokenB
    ) internal pure returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encodePacked(token0, token1)),
                            hex"7a329785ec357af903da282a60bc16764fa233e226850d2eda349a8c545fda20" // init code hash
                        )
                    )
                )
            )
        );
    }

    // fetches and sorts the reserves for a pair
    function getReserves(
        address factory,
        address tokenA,
        address tokenB
    ) internal view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, ) = sortTokens(tokenA, tokenB);
        pairFor(factory, tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1, ) = ICrossPair(pairFor(factory, tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    // given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) internal pure returns (uint256 amountB) {
        require(amountA > 0, "CrossLibrary: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "CrossLibrary: INSUFFICIENT_LIQUIDITY");
        amountB = amountA.mul(reserveB) / reserveA;
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "CrossLibrary: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "CrossLibrary: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn.mul(9983); // 0.17% for LP providers.
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(10000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountIn) {
        require(amountOut > 0, "CrossLibrary: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "CrossLibrary: INSUFFICIENT_LIQUIDITY");
        uint256 numerator = reserveIn.mul(amountOut).mul(10000);
        uint256 denominator = reserveOut.sub(amountOut).mul(9983); // 0.17% for LP providers.
        amountIn = (numerator / denominator).add(1);
    }

    // performs chained getAmountOut calculations on any number of pairs
    function getAmountsOut(
        address factory,
        uint256 amountIn,
        address[] memory path
    ) internal view returns (uint256[] memory amounts) {
        require(path.length >= 2, "CrossLibrary: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    // performs chained getAmountIn calculations on any number of pairs
    function getAmountsIn(
        address factory,
        uint256 amountOut,
        address[] memory path
    ) internal view returns (uint256[] memory amounts) {
        require(path.length >= 2, "CrossLibrary: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    function transferFees(
        address token,
        uint256 principal,
        FeeRates memory rates,
        FeeStores memory feeStores
    ) internal returns (uint256 feesPaid) {
        uint256 fee;
        if (principal != 0) {
            if (rates.develop != 0) {
                fee = (principal * rates.develop) / FeeMagnifier;
                TransferHelper.safeTransfer(token, feeStores.develop, fee);
                feesPaid += fee;
            }
            if (rates.buyback != 0) {
                fee = (principal * rates.buyback) / FeeMagnifier;
                TransferHelper.safeTransfer(token, feeStores.buyback, fee);
                feesPaid += fee;
            }
            if (rates.liquidity != 0) {
                fee = (principal * rates.liquidity) / FeeMagnifier;
                TransferHelper.safeTransfer(token, feeStores.liquidity, fee);
                feesPaid += fee;
            }
            if (rates.treasury != 0) {
                fee = (principal * rates.treasury) / FeeMagnifier;
                TransferHelper.safeTransfer(token, feeStores.treasury, fee);
                feesPaid += fee;
            }
        }
    }

    function transferFeesFrom(
        address token,
        address payer,
        uint256 principal,
        FeeRates memory rates,
        FeeStores memory feeStores
    ) internal returns (uint256 feesPaid) {
        uint256 fee;
        if (principal != 0) {
            if (rates.develop != 0) {
                fee = (principal * rates.develop) / FeeMagnifier;
                TransferHelper.safeTransferFrom(token, payer, feeStores.develop, fee);
                feesPaid += fee;
            }
            if (rates.buyback != 0) {
                fee = (principal * rates.buyback) / FeeMagnifier;
                TransferHelper.safeTransferFrom(token, payer, feeStores.buyback, fee);
                feesPaid += fee;
            }
            if (rates.liquidity != 0) {
                fee = (principal * rates.liquidity) / FeeMagnifier;
                TransferHelper.safeTransferFrom(token, payer, feeStores.liquidity, fee);
                feesPaid += fee;
            }
            if (rates.treasury != 0) {
                fee = (principal * rates.treasury) / FeeMagnifier;
                TransferHelper.safeTransferFrom(token, payer, feeStores.treasury, fee);
                feesPaid += fee;
            }
        }
    }
}
