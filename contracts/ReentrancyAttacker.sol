// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStakingVault {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

/**
 * @title ReentrancyAttacker
 * @notice Test-only contract that attempts to re-enter StakingVault.withdraw
 *         during the ETH transfer, to prove the vault's guard actually
 *         stops the attack rather than just assuming it does.
 */
contract ReentrancyAttacker {
    IStakingVault public immutable vault;

    uint256 public reentryAttempts;

    constructor(address vaultAddress) {
        vault = IStakingVault(vaultAddress);
    }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw(msg.value);
    }

    receive() external payable {
        reentryAttempts += 1;

        if (address(vault).balance >= msg.value) {
            vault.withdraw(msg.value);
        }
    }
}

contract ForceSend {
    constructor() payable {}

    function forceSend(address payable target) external {
        selfdestruct(target);
    }
}

contract RejectingReceiver {
    IStakingVault public immutable vault;

    constructor(address vaultAddress) {
        vault = IStakingVault(vaultAddress);
    }

    function deposit() external payable {
        vault.deposit{value: msg.value}();
    }

    function withdraw(uint256 amount) external {
        vault.withdraw(amount);
    }

    receive() external payable {
        revert("ETH rejected");
    }
}
