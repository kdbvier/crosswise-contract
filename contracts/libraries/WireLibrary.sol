// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../session/interfaces/INode.sol";

library WireLibrary {
    function setNode(
        NodeType nodeType,
        address node,
        Nodes storage nodes
    ) external {
        if (nodeType == NodeType.Token) {
            nodes.token = node;
        } else if (nodeType == NodeType.Center) {
            nodes.center = node;
        } else if (nodeType == NodeType.Maker) {
            nodes.maker = node;
        } else if (nodeType == NodeType.Taker) {
            nodes.taker = node;
        } else if (nodeType == NodeType.Farm) {
            nodes.farm = node;
        } else if (nodeType == NodeType.Repay) {
            nodes.repay = node;
        } else if (nodeType == NodeType.Factory) {
            nodes.factory = node;
        } else if (nodeType == NodeType.XToken) {
            nodes.xToken = node;
        }
    }

    function isWiredCall(Nodes storage nodes) external view returns (bool) {
        return
            msg.sender != address(0) &&
            (msg.sender == nodes.token ||
                msg.sender == nodes.maker ||
                msg.sender == nodes.taker ||
                msg.sender == nodes.farm ||
                msg.sender == nodes.repay ||
                msg.sender == nodes.factory ||
                msg.sender == nodes.xToken);
    }

    function setFeeStores(FeeStores storage feeStores, FeeStores memory _feeStores) external {
        require(
            _feeStores.develop != address(0) &&
                _feeStores.buyback != address(0) &&
                _feeStores.liquidity != address(0) &&
                _feeStores.treasury != address(0),
            "Zero address"
        );
        feeStores.develop = _feeStores.develop;
        feeStores.buyback = _feeStores.buyback;
        feeStores.liquidity = _feeStores.liquidity;
        feeStores.treasury = _feeStores.treasury;
    }

    function setFeeRates(
        ActionType _sessionType,
        mapping(ActionType => FeeRates) storage feeRates,
        FeeRates memory _feeRates
    ) external {
        require(uint256(_sessionType) < NumberSessionTypes, "Wrong ActionType");
        require(
            _feeRates.develop + _feeRates.buyback + _feeRates.liquidity + _feeRates.treasury <= FeeMagnifier,
            "Fee rates exceed limit"
        );

        feeRates[_sessionType].develop = _feeRates.develop;
        feeRates[_sessionType].buyback = _feeRates.buyback;
        feeRates[_sessionType].liquidity = _feeRates.liquidity;
        feeRates[_sessionType].treasury = _feeRates.treasury;
    }
}
