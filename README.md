# DeFi Vault Contracts

Solidity smart contracts for a staking vault, built with a deliberate focus on the security patterns that matter in real DeFi products — not just "it compiles and works on the happy path."

## Overview

`StakingVault` lets users deposit and withdraw ETH, tracking individual balances on-chain. It intentionally does not implement yield — the point of this project is to demonstrate correct, defensible handling of user funds under adversarial conditions, which is the hard part of any real vault, lending pool, or exchange contract.

The repository includes a `ReentrancyAttacker` contract used exclusively in the test suite to actually attempt draining the vault, rather than just asserting that a guard "should" work.

## Security Patterns Demonstrated

- **Checks-Effects-Interactions (CEI):** balances are updated *before* any external call that sends ETH, so a reentrant call sees already-updated state.
- **Reentrancy guard as defense in depth:** a `nonReentrant` modifier backs up CEI ordering rather than replacing it — the test suite proves both layers by actually attacking the contract.
- **Custom errors instead of require strings:** cheaper gas, and each failure mode is explicit and typed.
- **Pull-over-push withdrawals:** users withdraw their own funds; the contract never pushes ETH anywhere unprompted.
- **Emergency pause:** the owner can halt new deposits without ever blocking existing users from withdrawing their own funds.

## Project Structure

```text
contracts/
├── StakingVault.sol         # main vault: deposit, withdraw, pause
└── ReentrancyAttacker.sol   # test-only contract used to attack the vault

test/
└── StakingVault.ts          # full test suite, including a live reentrancy attack
```

## Running locally

```bash
npm install
npm run compile
npm test
```

## What the reentrancy test actually does

Rather than trusting that `nonReentrant` works, the test suite deploys a real attacking contract that:

1. Deposits ETH into the vault.
2. Calls `withdraw()`.
3. Inside its own `receive()` function — triggered by the vault sending ETH back — tries to call `withdraw()` again *before the first call has finished*.

The reentrant call hits the guard and reverts, which causes the outer ETH transfer to fail, which unwinds the entire attack transaction. The test asserts the vault's balance is left exactly as it was before the attack — the attacker extracts zero extra ETH.

## Tech Stack

- Solidity 0.8.24
- Hardhat
- TypeScript
- Chai / Hardhat Toolbox

## License

MIT — see [LICENSE](./LICENSE) for details.

## Author

**Nicolás Pedernera**

Systems Engineer — Universidad de Buenos Aires, 2024

Focused on backend engineering, fintech, cryptocurrency, blockchain infrastructure, and AI systems.

GitHub: https://github.com/Nicolas-Pedernera
LinkedIn: https://www.linkedin.com/in/nicolas-pedernera-zendx/
Upwork: https://www.upwork.com/freelancers/~017eec2171ae9d8805
