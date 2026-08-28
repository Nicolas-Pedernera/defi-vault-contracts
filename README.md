# DeFi Vault Contracts

Security-focused Ethereum smart contract project implementing an ETH staking vault with defensive accounting, access control, emergency pausing, and adversarial testing.

The project is designed as a practical demonstration of secure Solidity development, automated testing, and common DeFi threat scenarios.

## Overview

`StakingVault` allows users to:

- Deposit ETH and maintain an individual accounting balance.
- Make multiple deposits.
- Withdraw partially or completely.
- Withdraw while the vault is paused.
- Receive ETH through the contract's `receive()` function.

The implementation also addresses several security-sensitive scenarios:

- Reentrancy attacks.
- Failed ETH transfers.
- Forced ETH transfers.
- Unauthorized administrative actions.
- Zero-value deposits and withdrawals.
- Per-user accounting isolation.
- Aggregate deposit accounting.

## Security Model

The vault separates **accounting state** from the contract's actual ETH balance.

Two values are intentionally distinguished:

```text
address(this).balance
        │
        └── Actual ETH held by the contract

totalDeposits
        │
        └── ETH accounted for as user deposits
