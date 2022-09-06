// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../session/Node.sol";
import "../libraries/WireLibrary.sol";
import "./interfaces/ITaker.sol";
import "../session/SessionManager.sol";
import "./interfaces/IControlCenter.sol";
import "../libraries/utils/TransferHelper.sol";
import "../libraries/CrossLibrary.sol";
import "../libraries/RouterLibrary.sol";
import "../libraries/math/SafeMath.sol";
import "../core/interfaces/ICrossFactory.sol";
import "./interfaces/IWETH.sol";

interface IBalanceLedger {
    function balanceOf(address account) external view returns (uint256);
}

contract CrossTaker is Node, ITaker, Ownable, SessionManager {
    using SafeMath for uint256;

    address public immutable override WETH;

    string private sForbidden = "CrossTaker: Forbidden";
    string private sInvalidPath = "CrossTaker: Invalid path";
    string private sInsufficientOutput = "CrossTaker: Insufficient output amount";
    string private sInsufficientA = "CrossTaker: Insufficient A amount";
    string private sInsufficientB = "CrossTaker: Insufficient B amount";
    string private sExcessiveInput = "CrossTaker: Excessive input amount";
    string private sExpired = "CrossTaker: Expired";

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, sExpired);
        _;
    }

    constructor(address _WETH) Ownable() Node(NodeType.Taker) {
        WETH = _WETH;
        // RouterLibrary.test();

        trackFeeStores = true;
        trackFeeRates = true;
        trackPairStatus = true;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    function getOwner() public view override returns (address) {
        return owner();
    }

    function setNode(
        NodeType nodeType,
        address node,
        address caller
    ) public virtual override wired {
        if (caller != address(this)) {
            // let caller be address(0) when an actor initiats this loop.
            WireLibrary.setNode(nodeType, node, nodes);
            if (nodeType == NodeType.Token) {
                sessionRegistrar = ISessionRegistrar(node);
                sessionFees = ISessionFees(node);
            }
            address trueCaller = caller == address(0) ? address(this) : caller;
            INode(nextNode).setNode(nodeType, node, trueCaller);
        } else {
            emit SetNode(nodeType, node);
        }
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address to
    ) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            (PairSnapshot memory pairSnapshot, bool isNichePair) = IControlCenter(nodes.center).captureInitialPairState(
                actionParams,
                path[i],
                path[i + 1]
            );

            _checkEnlisted(pairFor[path[i]][path[i + 1]]);

            RouterLibrary.swapStep(amounts, path, to, pairSnapshot, nodes.factory, i);

            if (_msgSender() != owner()) IControlCenter(nodes.center).ruleOutDeviatedPrice(isNichePair, pairSnapshot);
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        _openAction(ActionType.Swap, true);

        amountIn -= _payTransactonFee(path[0], msg.sender, amountIn, true);
        amounts = CrossLibrary.getAmountsOut(nodes.factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, sInsufficientOutput);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor[path[0]][path[1]], amounts[0]);
        _swap(amounts, path, to);

        _closeAction();
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        _openAction(ActionType.Swap, true);

        amounts = CrossLibrary.getAmountsIn(nodes.factory, amountOut, path);
        require(amounts[0] <= amountInMax, sExcessiveInput);
        amounts[0] -= _payTransactonFee(path[0], msg.sender, amounts[0], true);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor[path[0]][path[1]], amounts[0]);
        _swap(amounts, path, to);

        _closeAction();
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) returns (uint256[] memory amounts) {
        _openAction(ActionType.Swap, true);

        require(path[0] == WETH, sInvalidPath);
        IWETH(WETH).deposit{value: msg.value}();
        uint256 amountIn = msg.value;
        amountIn -= _payTransactonFee(path[0], address(this), amountIn, true);
        amounts = CrossLibrary.getAmountsOut(nodes.factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, sInsufficientOutput);
        assert(IWETH(WETH).transfer(pairFor[path[0]][path[1]], amounts[0]));
        _swap(amounts, path, to);

        _closeAction();
    }

    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        _openAction(ActionType.Swap, true);

        require(path[path.length - 1] == WETH, sInvalidPath);
        amounts = CrossLibrary.getAmountsIn(nodes.factory, amountOut, path);
        require(amounts[0] <= amountInMax, sExcessiveInput);
        amounts[0] -= _payTransactonFee(path[0], msg.sender, amounts[0], true);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor[path[0]][path[1]], amounts[0]);
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);

        _closeAction();
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        _openAction(ActionType.Swap, true);

        require(path[path.length - 1] == WETH, sInvalidPath);
        amountIn -= _payTransactonFee(path[0], msg.sender, amountIn, true);
        amounts = CrossLibrary.getAmountsOut(nodes.factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, sInsufficientOutput);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor[path[0]][path[1]], amounts[0]);
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);

        _closeAction();
    }

    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) returns (uint256[] memory amounts) {
        _openAction(ActionType.Swap, true);

        require(path[0] == WETH, sInvalidPath);
        amounts = CrossLibrary.getAmountsIn(nodes.factory, amountOut, path);
        require(amounts[0] <= msg.value, sExcessiveInput);
        IWETH(WETH).deposit{value: amounts[0]}();
        uint256 amountIn = amounts[0];
        amounts[0] -= _payTransactonFee(path[0], address(this), amounts[0], true);
        assert(IWETH(WETH).transfer(pairFor[path[0]][path[1]], amounts[0]));
        _swap(amounts, path, to);
        // refund dust eth, if any
        if (msg.value > amountIn) TransferHelper.safeTransferETH(msg.sender, msg.value - amountIn);

        _closeAction();
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(address[] memory path, address to) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            (PairSnapshot memory pairSnapshot, bool isNichePair) = IControlCenter(nodes.center).captureInitialPairState(
                actionParams,
                path[i],
                path[i + 1]
            );
            _checkEnlisted(pairFor[path[i]][path[i + 1]]);
            RouterLibrary.swapStepSupportingFee(path, to, pairSnapshot, nodes.factory, i);
            if (_msgSender() != owner()) IControlCenter(nodes.center).ruleOutDeviatedPrice(isNichePair, pairSnapshot);
        }
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) {
        _openAction(ActionType.Swap, true);

        amountIn -= _payTransactonFee(path[0], msg.sender, amountIn, true);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor[path[0]][path[1]], amountIn);
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin, sInsufficientOutput);

        _closeAction();
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) {
        _openAction(ActionType.Swap, true);

        require(path[0] == WETH, sInvalidPath);
        uint256 amountIn = msg.value;
        IWETH(WETH).deposit{value: amountIn}();
        amountIn -= _payTransactonFee(path[0], msg.sender, amountIn, true);
        assert(IWETH(WETH).transfer(pairFor[path[0]][path[1]], amountIn));
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin, sInsufficientOutput);

        _closeAction();
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) {
        _openAction(ActionType.Swap, true);

        require(path[path.length - 1] == WETH, sInvalidPath);
        amountIn -= _payTransactonFee(path[0], msg.sender, amountIn, true);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor[path[0]][path[1]], amountIn);
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint256 amountOut = IERC20(WETH).balanceOf(address(this));
        require(amountOut >= amountOutMin, sInsufficientOutput);
        IWETH(WETH).withdraw(amountOut);
        TransferHelper.safeTransferETH(to, amountOut);

        _closeAction();
    }

    function _payTransactonFee(
        address payerToken,
        address payerAddress,
        uint256 principal,
        bool fromAllowance
    ) internal virtual returns (uint256 feesPaid) {
        if (actionParams.isUserAction && principal > 0) {
            //if (address(payerToken) == nodes.token) {
            //    feesPaid = _payFeeCrss(payerAddress, principal, feeRates[actionParams.actionType], fromAllowance);
            //} else {
            feesPaid = CrossLibrary.transferFeesFrom(
                payerToken,
                payerAddress,
                principal,
                feeRates[actionParams.actionType],
                feeStores
            );
            //}
        }
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) public pure virtual override returns (uint256 amountB) {
        return CrossLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure virtual override returns (uint256 amountOut) {
        return CrossLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure virtual override returns (uint256 amountIn) {
        return CrossLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint256 amountIn, address[] memory path)
        public
        view
        virtual
        override
        returns (uint256[] memory amounts)
    {
        return CrossLibrary.getAmountsOut(nodes.factory, amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] memory path)
        public
        view
        virtual
        override
        returns (uint256[] memory amounts)
    {
        return CrossLibrary.getAmountsIn(nodes.factory, amountOut, path);
    }
}
