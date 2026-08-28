# DeFi Vault Contracts

Security-focused Solidity vault demonstrating defensive smart-contract engineering through deposits, withdrawals, pausability, reentrancy protection, and adversarial testing.

> **Status:** Educational / portfolio project.  
> **Not audited. Not intended for production use or custody of real funds.**

## Overview

`StakingVault` is a minimal ETH vault that lets users deposit and withdraw their own funds while maintaining per-user accounting on-chain.

The contract intentionally does **not** implement yield generation. The goal of this project is to demonstrate secure handling of user funds and adversarial testing patterns that are relevant to real DeFi protocols.

The repository includes a dedicated `ReentrancyAttacker` test contract that attempts to re-enter the vault during an ETH withdrawal. This makes the security tests exercise an actual attack path rather than merely checking that a protection modifier exists.

## Security Properties

### Checks-Effects-Interactions

Withdrawal accounting is updated before the vault performs the external ETH transfer.

If a recipient attempts to re-enter during the transfer, the vault has already reduced the recipient's recorded balance.

### Reentrancy protection

The vault uses an explicit `nonReentrant` guard as defense in depth on top of CEI.

The test suite deploys an attacker contract and verifies that the reentrant withdrawal fails without allowing additional funds to be extracted.

### Custom errors

The contract uses Solidity custom errors instead of string-based `require` messages.

Examples include:

- `ZeroDeposit`
- `ZeroWithdrawal`
- `InsufficientBalance`
- `TransferFailed`
- `NotOwner`
- `ContractPaused`
- `ReentrancyDetected`

This keeps failure modes explicit and avoids unnecessary revert-string overhead.

### Pull-over-push withdrawals

The vault only sends ETH when a user explicitly requests a withdrawal.

It does not automatically distribute funds to users or third parties.

### Emergency pause

The owner can pause deposits in an emergency.

Withdrawals remain available while paused so that existing depositors can recover their funds.

### Failed-transfer safety

If an ETH transfer to the withdrawing address fails, the transaction reverts.

The test suite verifies that accounting is preserved when the recipient rejects ETH.

### Forced ETH

The vault also tests the case where ETH is forced into the contract outside the normal deposit flow.

This demonstrates the distinction between:

- `address(this).balance`, which represents the contract's actual ETH balance;
- `totalDeposits`, which represents tracked user deposits.

Forced ETH does not silently become attributed to a depositor.

## Test Coverage

The test suite covers:

- individual deposits;
- multiple deposits;
- isolated user balances;
- zero-value deposits;
- deposit events;
- total deposit accounting;
- direct ETH transfers through `receive()`;
- partial withdrawals;
- full withdrawals;
- zero-value withdrawals;
- over-withdrawal protection;
- account isolation;
- withdrawal events;
- withdrawal accounting;
- owner-only pause;
- paused deposits;
- withdrawals while paused;
- unpausing;
- reentrancy attacks;
- failed ETH transfers;
- forced ETH;
- vault balance reporting.

Current test result:

```text
23 passing
