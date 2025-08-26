<div align="center">

# Velvet Capital‑inspired Modular DeFi Vaults

[![Solidity](https://img.shields.io/badge/Solidity-0.8.x-363636?logo=solidity)](https://soliditylang.org)
[![Hardhat](https://img.shields.io/badge/Hardhat-Paris%20EVM-yellow?logo=hardhat)](https://hardhat.org)
[![Tests](https://img.shields.io/badge/Tests-e2e%20included-28a745)](#local-development-and-testing)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

<br/>

<i>A modular vault framework with pluggable strategies, robust fee mechanics, and role‑based operations. Supports mark‑to‑market and realize‑on‑harvest strategies, time‑pro‑rated management fees, performance fees, entry/exit fees, and a complete e2e test flow.</i>

</div>

---

## 🔎 Quick Overview

- The `Vault` accepts a single asset (e.g., USDC), mints/burns shares, and measures TVL.
- Managers allocate capital across strategies with `targetBps`; `investIdle()` deploys idle funds.
- Keepers call `harvestAll()` to realize PnL and charge fees.
- Withdrawals are pro‑rata; vault pulls liquidity from strategies when needed.

---

## 📚 Table of Contents
- Overview and Motivation
- Architecture (high‑level)
- Core contracts (with key functions)
- Strategies (how they differ)
- Fees and accounting model
- Access control and roles
- Rebalancing and indices
- Events and telemetry
- Local development and testing
- Deployment notes
- Security considerations
- FAQ

---

<details>
<summary><b>💡 Overview and Motivation</b></summary>

Why this design matters:
- **Modularity**: swap strategies without changing vault logic.
- **Correctness**: separates realized PnL from TVL drift; fees are fair and explicit.
- **Security**: strict role gating and safe transfers.
- **Testability**: mocks simulate continuous yield vs realized‑on‑harvest.

</details>

<details>
<summary><b>🏗️ Architecture (high‑level)</b></summary>

- **Vault**: ERC4626‑style share accounting, TVL, invest/harvest/withdraw.
- **FeeModule**: mgmt/perf/entry/exit fees, time‑based mgmt accrual.
- **AccessController**: `owner`, `manager`, `keeper` roles.
- **Strategies**: mark‑to‑market (Aave‑like) and realize‑on‑harvest (UniV3‑like).
- **IndexSwap**: optional target weights with cooldown rebalances via `IExchangeHandler`.
- **PortfolioFactory**: deploys parametrized `Vault` instances.

</details>

<details>
<summary><b>🧩 Core contracts and key functions</b></summary>

### `contracts/core/Vault.sol`
- Storage: `asset`, `access`, `fees`, `oracle`, `depositCap`, `minHarvestInterval`, `lastHarvest`, `strategies`, `targetBps`, `totalSupply`, `balanceOf`.
- Users:
  - `deposit(assets, receiver)` → shares
  - `withdraw(shares, receiver)` → assets (pulls from strategies if needed)
- Views:
  - `totalAssets()` sums vault idle + all `strategy.totalAssets()`
  - `convertToShares` / `convertToAssets` for pricing
- Management:
  - `setStrategy(s, bps)` register + allocate
  - `investIdle()` deploy idle funds per `targetBps`
- Harvesting (`onlyKeeper`):
  - Records `beforeTA`, `idleBefore` → calls `strategy.harvest()` → records `afterTA`, `idleAfter`
  - `realizedProfit = max(idleAfter - idleBefore, 0)`
  - `mgmt = fees.computeMgmtFee(afterTA)`; `perf = realizedProfit * perfBps / 1e4`
  - Pays fees to treasury; emits `Harvest(realizedProfit, mgmt, perf, afterTA)`

### `contracts/core/FeeModule.sol`
- `setFees(mgmt, perf, entry, exit)` (bounded)
- `takeEntryFee(amount)` / `takeExitFee(amount)`
- `computeMgmtFee(tvl) = tvl * mgmtBps * dt / (365d * 1e4)`
- `onFeesCharged()` updates accrual timestamp

### `contracts/core/AccessController.sol`
- `setOwner`, `setManager`, `setKeeper` with `onlyOwner`
- Modifiers: `onlyOwner`, `onlyManager`, `onlyKeeper`

### Optional
- `IndexSwap`: targets + cooldown; `rebalance(bytes[] calldata swaps)`
- `PortfolioFactory`: `deployVault(...) → address`

</details>

<details>
<summary><b>🔁 Strategies (two patterns)</b></summary>

### Mark‑to‑market (Aave‑like)
- `totalAssets()` reflects all accrued interest continuously.
- `harvest()` usually returns 0; no transfers needed.
- Importance: good for lending markets where interest accrues linearly and is visible at all times.

### Realize‑on‑harvest (UniV3‑like)
- Strategy tracks `principal`; pending fees exist as token balance.
- `harvest()` transfers only the pending portion to the vault and returns realized PnL.
- Importance: realistic for LP‑style strategies where fees accumulate and are collected on harvest.

### Reference implementations
- `mocks/MockStrategyMarkToMarket.sol`
- `mocks/MockStrategyRealizeProfit.sol`
- `strategies/UniswapV3Strategy.sol` (showcases mint/collect/swap to want)

</details>

<details>
<summary><b>💸 Fees and accounting model</b></summary>

- **Entry/Exit fees**: protocol revenue and anti‑gaming at boundaries.
- **Management fee**: time‑pro‑rated on TVL (fair cost of capital management).
- **Performance fee**: charged only on realized profit (aligns incentives).

This prevents fee gaming and treats users fairly whether funds are idle or invested.

</details>

<details>
<summary><b>🔐 Access control and roles</b></summary>

- **Owner**: governance; appoints managers/keepers.
- **Manager**: sets strategies and allocations; calls `investIdle()`.
- **Keeper**: runs `harvestAll()` safely on schedule (bot‑friendly).

</details>

<details>
<summary><b>🧭 Rebalancing and indices</b></summary>

- `IndexSwap` enables target weights and cooldown‑controlled rebalances via `IExchangeHandler`.
- Use cases: index portfolios, smart‑beta allocations, diversification.

</details>

<details>
<summary><b>📡 Events and telemetry</b></summary>

- `Vault.Deposit`, `Vault.Withdraw`, `Vault.Harvest(grossProfit, mgmtFee, perfFee, tvlAfter)`
- `FeeModule.FeesUpdated`, `FeeModule.TreasuryUpdated`
- `AccessController.OwnerUpdated`, `ManagerSet`, `KeeperSet`

</details>

<details>
<summary><b>🧑‍💻 Local development and testing</b></summary>

- Requirements: Node.js, npm, Hardhat
- Install: `npm install`
- Compile: `npx hardhat compile`
- Test: `npx hardhat test`
- Notable: `test/vault.e2e.spec.js` (deposit → invest → simulate yield → harvest → fees → withdraw)

</details>

<details>
<summary><b>🚀 Deployment notes</b></summary>

- Configure `hardhat.config.js` (optimizer; consider `viaIR: true` for complex codegen).
- Deploy `AccessController`, `FeeModule`, then `Vault` (or via `PortfolioFactory`).
- Wire strategies and `targetBps`; set `minHarvestInterval`, `depositCap`.

</details>

<details>
<summary><b>🛡️ Security considerations</b></summary>

- Conservative `targetBps`, strict strategy allowlists.
- Validate routers/calldata in `IExchangeHandler`.
- Trusted keepers only; consider timelocks/multisig for governance.
- Consider pause/guard rails before mainnet use.

</details>

<details>
<summary><b>❓ FAQ</b></summary>

- Why realized profit vs TVL delta for performance fees?
  - TVL can remain constant when profit moves from strategy to vault; realized PnL reflects what actually arrived.
- Why separate roles?
  - Reduces risk and mirrors production ops: managers allocate, keepers harvest, owners govern.
- Can I add strategies?
  - Yes. Implement `IStrategy` and plug it via `setStrategy`. Follow the two patterns above.

</details>

---

### ⚡ Quick start

- Compile: `npx hardhat compile`
- Test: `npx hardhat test`
- Gas report: `REPORT_GAS=true npx hardhat test`
