// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./interfaces/IRCrssToken.sol";

contract RCrssToken is IRCrssToken, Ownable, Initializable {
    //==================== ERC20 core data ====================
    string private constant _name = "RCRSS Token";
    string private constant _symbol = "RCRSS";
    uint8 private constant _decimals = 18;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    //==================== Basic ERC20 functions ====================
    function name() public view virtual returns (string memory) {
        return _name;
    }

    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }

    function decimals() public view virtual returns (uint8) {
        return _decimals;
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        if (sender != msg.sender) {
            uint256 currentAllowance = _allowances[sender][msg.sender];
            require(currentAllowance >= amount, "Transfer amount exceeds allowance");
            _approve(sender, msg.sender, currentAllowance - amount);
        }
        _transfer(sender, recipient, amount); // No guarentee it doesn't make a change to _allowances. Revert if it fails.

        return true;
    }

    function allowance(address _owner, address _spender) public view virtual override returns (uint256) {
        return _allowances[_owner][_spender];
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual {
        require(sender != address(0), sZeroAddress);
        require(recipient != address(0), sZeroAddress);

        uint256 senderBalance = _balances[sender];
        require(senderBalance >= amount, sExceedsBalance);

        //_beforeTokenTransfer(sender, recipient, amount);
        _balances[sender] = senderBalance - amount;
        _balances[recipient] += amount;
        //_afterTokenTransfer(sender, recipient, amount);

        emit Transfer(sender, recipient, amount);
    }

    function _approve(
        address _owner,
        address _spender,
        uint256 _amount
    ) internal virtual {
        require(_owner != address(0), sZeroAddress);
        require(_spender != address(0), sZeroAddress);
        _allowances[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    function mint(address to, uint256 amount) public override onlyRepay {
        require(to != address(0), sZeroAddress);
        _totalSupply += amount;
        _balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) public override onlyRepay {
        require(from != address(0), sZeroAddress);
        uint256 accountBalance = _balances[from];
        require(accountBalance >= amount, sExceedsBalance);
        _balances[from] = accountBalance - amount;
        _totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    //----------------------------------- Compensation ---------------------------------

    address[] public override victims;
    string private constant sZeroAddress = "RCRSS: Zero address";
    string private constant sExceedsBalance = "RCRSS: Exceeds balance";

    address repay;

    function changeRepay(address _repay) external {
        require(_repay != address(0), sZeroAddress);
        repay = _repay;
    }

    modifier onlyRepay() {
        require(msg.sender == repay && repay != address(0), "RCRSS: wrong caller");
        _;
    }

    function victimsLen() external view override returns (uint256) {
        return victims.length;
    }

    function _mintRepayToken(address victim, uint256 lossAmount) internal {
        require(victim != address(0) && lossAmount != 0 && _balances[victim] == 0, "Invalid loss");
        _balances[victim] = lossAmount;
        _totalSupply += lossAmount;
        victims.push(victim);
    }

    constructor() Ownable() {
        //---------------- 1,800+ lines of (victim, loss) ----------------------
    }

    function initialize() external initializer onlyOwner {
        //---------------- 1,800+ lines of (victim, loss) ----------------------

        _mintRepayToken(0x70997970C51812dc3A010C7d01b50e0d17dc79C8, 1 * 1e18); // (victim, loss). Hardhat Alice
        _mintRepayToken(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 10 * 1e18); // Hardhat Bob
        _mintRepayToken(0x90F79bf6EB2c4f870365E785982E1f101E93b906, 100 * 1e18); // Hardhat Carol
        // ... ... ...
    }
}
