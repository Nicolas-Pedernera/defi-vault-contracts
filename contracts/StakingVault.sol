// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StakingVault
 * @notice A minimal staking vault: deposit ETH, earn no yield by design
 *         (yield accrual is intentionally out of scope — see README), and
 *         withdraw your own balance at any time.
 *
 * @dev This contract exists as a portfolio piece demonstrating security
 *      patterns that matter in real DeFi vaults, not as a production
 *      yield product. In particular it demonstrates:
 *
 *      - Checks-Effects-Interactions ordering to prevent reentrancy
 *      - A reentrancy guard as defense in depth on top of CEI
 *      - Pausability for emergency response
 *      - Explicit custom errors instead of require strings (cheaper gas,
 *        clearer failure reasons)
 *      - A pull-over-push withdrawal pattern
 */
contract StakingVault {
    // ---------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------

    error ZeroDeposit();
    error InsufficientBalance(uint256 requested, uint256 available);
    error TransferFailed();
    error NotOwner();
    error ContractPaused();
    error ReentrancyDetected();

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------

    address public immutable owner;

    bool public paused;

    /// @dev Reentrancy guard status. 1 = not entered, 2 = entered.
    uint256 private locked = 1;

    mapping(address depositor => uint256 amount) public balanceOf;

    uint256 public totalDeposits;

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event Deposited(address indexed depositor, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed depositor, uint256 amount, uint256 newBalance);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ---------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier nonReentrant() {
        if (locked == 2) revert ReentrancyDetected();
        locked = 2;
        _;
        locked = 1;
    }

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    constructor() {
        owner = msg.sender;
    }

    // ---------------------------------------------------------------
    // Deposits
    // ---------------------------------------------------------------

    function deposit() external payable whenNotPaused {
        if (msg.value == 0) revert ZeroDeposit();

        balanceOf[msg.sender] += msg.value;
        totalDeposits += msg.value;

        emit Deposited(msg.sender, msg.value, balanceOf[msg.sender]);
    }

    receive() external payable {
        if (paused) revert ContractPaused();
        if (msg.value == 0) revert ZeroDeposit();

        balanceOf[msg.sender] += msg.value;
        totalDeposits += msg.value;

        emit Deposited(msg.sender, msg.value, balanceOf[msg.sender]);
    }

    // ---------------------------------------------------------------
    // Withdrawals
    // ---------------------------------------------------------------

    /**
     * @notice Withdraws `amount` of the caller's own deposited balance.
     * @dev Follows Checks-Effects-Interactions: the balance is decremented
     *      BEFORE the external call that sends ETH, so a malicious
     *      contract re-entering during the call sees an already-updated
     *      balance and cannot drain more than it deposited. The
     *      nonReentrant modifier is a second layer of defense on top of
     *      this ordering, not a replacement for it.
     */
    function withdraw(uint256 amount) public nonReentrant {
        uint256 currentBalance = balanceOf[msg.sender];

        if (amount > currentBalance) {
            revert InsufficientBalance(amount, currentBalance);
        }

        balanceOf[msg.sender] = currentBalance - amount;
        totalDeposits -= amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(msg.sender, amount, balanceOf[msg.sender]);
    }

    /// @notice Withdraws the caller's entire balance in one call.
    function withdrawAll() external {
        withdraw(balanceOf[msg.sender]);
    }

    // ---------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ---------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------

    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
