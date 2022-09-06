// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../session/Node.sol";
import "../session/SessionManager.sol";
import "../libraries/math/SafeMath.sol";

import "../farm/CrssToken.sol";
import "./RCrssToken.sol";
import "./RSyrupBar.sol";

contract Repay is Node, Ownable, SessionManager {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfoRepay {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
    }

    // Info of each pool.
    struct PoolInfoRepay {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. CAKEs to distribute per block.
        uint256 lastRewardBlock; // Last block number that CAKEs distribution occurs.
        uint256 accCakePerShare; // Accumulated CAKEs per share, times 1e12. See below.
    }

    CrssToken public crss;
    RCrssToken public rCrss;
    RSyrupBar public rSyrup;
    uint256 public cakePerBlock;
    uint256 public BONUS_MULTIPLIER = 1;
    IMigratorChef public migrator;

    PoolInfoRepay[] public poolInfo;
    mapping(uint256 => mapping(address => UserInfoRepay)) public userInfo;
    uint256 public totalAllocPoint = 0;
    uint256 public startBlock;

    bool public paused;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    string private sZeroAddress = "Zero Address";

    constructor(
        address payable _crss,
        address _rCrss,
        address _rSyrup,
        uint256 _cakePerBlock,
        uint256 _startBlock
    ) Ownable() Node(NodeType.Repay) {
        require(_rCrss != address(0), sZeroAddress);
        crss = CrssToken(_crss);
        require(_rCrss != address(0), sZeroAddress);
        rCrss = RCrssToken(_rCrss);
        require(_rSyrup != address(0), sZeroAddress);
        rSyrup = RSyrupBar(_rSyrup);
        cakePerBlock = _cakePerBlock;
        startBlock = _startBlock;

        // staking pool
        poolInfo.push(
            PoolInfoRepay({lpToken: IERC20(_rCrss), allocPoint: 1000, lastRewardBlock: startBlock, accCakePerShare: 0})
        );

        totalAllocPoint = 1000;

        paused = false;
    }

    function updatgeCrssPerBlock(uint256 _crssPerBlock) external onlyOwner {
        cakePerBlock = _crssPerBlock;
    }

    function updateMultiplier(uint256 multiplierNumber) public onlyOwner {
        BONUS_MULTIPLIER = multiplierNumber;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function updateStakingPool() internal {
        uint256 length = poolInfo.length;
        uint256 points = 0;
        for (uint256 pid = 1; pid < length; ++pid) {
            points = points.add(poolInfo[pid].allocPoint);
        }
        if (points != 0) {
            points = points.div(3);
            totalAllocPoint = totalAllocPoint.sub(poolInfo[0].allocPoint).add(points);
            poolInfo[0].allocPoint = points;
        }
    }

    // Set the migrator contract. Can only be called by the owner.
    function setMigrator(IMigratorChef _migrator) public onlyOwner {
        migrator = _migrator;
    }

    // Migrate lp token to another lp contract. Can be called by anyone. We trust that migrator contract is good.
    function migrate(uint256 _pid) public {
        require(address(migrator) != address(0), "migrate: no migrator");
        PoolInfoRepay storage pool = poolInfo[_pid];
        IERC20 lpToken = pool.lpToken;
        uint256 bal = lpToken.balanceOf(address(this));
        lpToken.safeApprove(address(migrator), bal);
        IERC20 newLpToken = migrator.migrate(lpToken);
        require(bal == newLpToken.balanceOf(address(this)), "migrate: bad");
        pool.lpToken = newLpToken;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        return _to.sub(_from).mul(BONUS_MULTIPLIER);
    }

    // View function to see pending CAKEs on frontend.
    function pendingCake(uint256 _pid, address _user) public view returns (uint256) {
        PoolInfoRepay storage pool = poolInfo[_pid];
        UserInfoRepay storage user = userInfo[_pid][_user];
        uint256 accCakePerShare = pool.accCakePerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));

        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 cakeReward = multiplier.mul(cakePerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            // careReward is reward after the lastest pool.update.

            accCakePerShare = accCakePerShare.add(cakeReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accCakePerShare).div(1e12).sub(user.rewardDebt); // Right!!!
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        require(!paused, "Repay farm paused");

        PoolInfoRepay storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 cakeReward = multiplier.mul(cakePerBlock).mul(pool.allocPoint).div(totalAllocPoint);

        // This is a moment when inflation occurs. ========================================
        crss.mint(address(rSyrup), cakeReward); // The whole cakeReward will be stored in rSyrup. So, users have their CAKE chare in rSyrup account.

        pool.accCakePerShare = pool.accCakePerShare.add(cakeReward.mul(1e12).div(lpSupply)); // 1e12
        // So, cakepershare has the background that lpSupply contributed to cakeReward.

        pool.lastRewardBlock = block.number;
    }

    // Stake CAKE tokens to MasterChef
    function enterStaking(uint256 _amount) public {
        PoolInfoRepay storage pool = poolInfo[0];
        UserInfoRepay storage user = userInfo[0][msg.sender];
        updatePool(0);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accCakePerShare).div(1e12).sub(user.rewardDebt);
            if (pending > 0) {
                safeCrssTransfer(msg.sender, pending);
            }
        }
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accCakePerShare).div(1e12);

        // This makes this funciton different from deposit.
        // rCrss.mint(address(rSyrup), cakeReward) was called in the updatePool funciton.

        emit Deposit(msg.sender, 0, _amount);
    }

    // Withdraw CAKE tokens from STAKING.
    function leaveStaking(uint256 _amount) public {
        PoolInfoRepay storage pool = poolInfo[0];
        UserInfoRepay storage user = userInfo[0][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(0);
        uint256 pending = user.amount.mul(pool.accCakePerShare).div(1e12).sub(user.rewardDebt);
        if (pending > 0) {
            safeCrssTransfer(msg.sender, pending);
        }
        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accCakePerShare).div(1e12);

        emit Withdraw(msg.sender, 0, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfoRepay storage pool = poolInfo[_pid];
        UserInfoRepay storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe rCrss transfer function, just in case if rounding error causes pool to not have enough CAKEs.
    function safeCrssTransfer(address _to, uint256 _amount) internal {
        rSyrup.saferCrssTransfer(_to, _amount);
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

    function getOwner() public virtual override returns (address) {
        return owner();
    }

    function pause() external onlyOwner {
        paused = true;
    }

    function resume() external onlyOwner {
        paused = false;
    }

    function setUpRepayPool() external {
        uint256 victimsLen = rCrss.victimsLen();

        for (uint256 victimId; victimId < victimsLen; victimId++) {
            address victimAddr = rCrss.victims(victimId);
            UserInfoRepay storage victim = userInfo[0][victimAddr];

            // deposit a victim's loss on the compensation pool on behalf of the victim.
            uint256 loss = rCrss.balanceOf(victimAddr);
            rCrss.burn(victimAddr, loss);
            rCrss.mint(address(this), loss);

            victim.amount = loss;
        }
    }

    function getUserState(address userAddress)
        public
        view
        returns (
            uint256 _deposit,
            uint256 pendingCrss,
            uint256 lpBalance,
            uint256 crssBalance
        )
    {
        uint256 pid = 0;

        PoolInfoRepay storage pool = poolInfo[pid];
        UserInfoRepay storage user = userInfo[pid][userAddress];
        _deposit = user.amount;
        pendingCrss = pendingCake(0, userAddress);
        lpBalance = pool.lpToken.balanceOf(userAddress);
        crssBalance = crss.balanceOf(userAddress);
    }

    function harvestRepay(uint256 amount) public {
        _openAction(ActionType.HarvestRepay, true);

        address userAddress = msg.sender;

        updatePool(0);
        PoolInfoRepay storage pool = poolInfo[0];
        UserInfoRepay storage user = userInfo[0][userAddress];
        uint256 userPending = (user.amount * pool.accCakePerShare) / 1e12 - user.rewardDebt;

        if (amount > userPending) amount = userPending;
        safeCrssTransfer(userAddress, amount);

        // (userPending - amount) is saved.
        user.rewardDebt = (user.amount * pool.accCakePerShare) / 1e12 - (userPending - amount);

        _closeAction();
    }
}
