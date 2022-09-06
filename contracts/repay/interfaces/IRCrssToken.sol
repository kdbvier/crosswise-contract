// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
interface IRCrssToken is IERC20 {

    struct Loss {
        uint256 lossAmount;
    }

    function victims (uint256) external returns (address);
    function victimsLen () external returns (uint256);
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}