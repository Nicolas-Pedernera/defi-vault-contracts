# DeFi Vault Contracts

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-3-yellow?logo=hardhat)](https://hardhat.org/)
[![Tests](https://img.shields.io/badge/tests-23%20passing-brightgreen)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)

> Security-focused Ethereum smart-contract project demonstrating defensive Solidity engineering, secure ETH accounting, and adversarial testing.

**Status:** Educational / portfolio project.  
**Not audited. Not intended for production use or custody of real funds.**

---

## Overview

`StakingVault` is a minimal ETH vault that allows users to deposit and withdraw their own funds while maintaining isolated on-chain accounting.

The project intentionally focuses on **security and correctness rather than yield generation**.

### Core functionality

- ETH deposits with per-user balances
- Multiple deposits per account
- Partial and full withdrawals
- Owner-controlled emergency pause
- Withdrawals remain available while paused
- ETH reception through `receive()`
- Aggregate accounting through `totalDeposits`
- Solidity custom errors
- Reentrancy protection
- Safe handling of failed ETH transfers

---

## Architecture

```text
                         Ethereum / EVM
                               │
                               │ ETH
                               ▼
                    ┌─────────────────────┐
                    │    StakingVault     │
                    │                     │
                    │ balances[address]   │
                    │ totalDeposits       │
                    │ pause state         │
                    │ reentrancy guard    │
                    └──────────┬──────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
             deposit()                withdraw()
                  │                         │
                  ▼                         ▼
             User accounting          ETH transfer
                                            │
                                            ▼
                                      User / Contract
