// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "./interfaces/IConstants.sol";
import "./interfaces/ISessionRegistrar.sol";

abstract contract SessionRegistrar is ISessionRegistrar {

    uint256 public session;
    mapping(ActionType => uint256) public sessionsLastSeenBySType;

    ActionType[20] private actionStack;
    uint256 stackPointer;

    bool public paused;

    modifier onlySessionManager virtual;
    modifier ownerOnly virtual;

    function pause() external ownerOnly {
        paused = true;
    }
    function resume() external ownerOnly {
        paused = false;
    }

    function registerAction(ActionType actionType,  bool blockReentry) external override virtual onlySessionManager returns (ActionParams memory actionParams) {
        require(! paused, "System paused");
        require(actionType != ActionType.None, "Cross: Invalid ActionType Type");

        if (blockReentry) {
            for (uint256 i; i <= stackPointer; i++) {
                require(actionStack[i] != actionType, "Reentry found");
            }
        }

        // reading stackPointer costs 5,000 gas, while updating costs 20,000 gas.
        if ( ! (stackPointer == 0 && actionStack[0] == ActionType.None) ) stackPointer ++;
        require(stackPointer < actionStack.length, "Cross: Session stack overflow");
        require(actionStack[stackPointer] == ActionType.None, "Cross: Session stack inconsistent");

        actionStack[stackPointer] = actionType;

        actionParams.actionType = actionType;
        (actionParams.session, actionParams.lastSession) = _seekInitializeSession(actionType);
        actionParams.isUserAction = stackPointer == 0;

        _initializeAction(actionType);
    }

    function unregisterAction() external override onlySessionManager {
        // reading stackPointer costs 5,000 gas, while updating costs 20,000 gas.
        require(stackPointer < actionStack.length, "Cross: Session stack overflow");
        ActionType actionType = actionStack[stackPointer];
        require(actionType != ActionType.None, "Cross: Session stack inconsistent");
        actionStack[stackPointer] = ActionType.None;

        if (stackPointer > 0) stackPointer --;      
        sessionsLastSeenBySType[actionType] = session;

        _finalizeAction(actionType);
    }

    function _initializeAction(ActionType actionType) internal virtual {
    }

    function _finalizeAction(ActionType actionType) internal virtual {
    }

    function _seekInitializeSession(ActionType actionType) internal virtual returns (uint256 _session, uint256 _lastSession) {

        uint256 hashBNOrigin = uint256(keccak256(abi.encode(block.number, tx.origin)));
        if (session != hashBNOrigin ) {
            session = hashBNOrigin;
        }
        _session = session;
        _lastSession = sessionsLastSeenBySType[actionType];
    }
}