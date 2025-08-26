# Velvet Capital-inspired Modular DeFi Vaults

A modular, production-inspired DeFi vault framework for managing tokenized portfolios with pluggable strategies, robust fee mechanics, and role-based operations. It supports both mark-to-market and realize-on-harvest strategies, time-pro-rated management fees, performance fees, entry/exit fees, and end-to-end tests that validate real vault flows.

## Contents
- Overview
- Architecture
- Core contracts and functions
- Strategies and how they differ
- Fees and accounting model
- Access control and roles
- Rebalancing and indices
- Events and telemetry
- Local development and testing
- Deployment notes
- Security considerations
- FAQ

## Overview
- The `Vault` accepts deposits of a single asset (e.g., USDC) and mints shares.
- Managers assign target allocations to strategies; `investIdle()` pushes idle capital out.
- Keepers run `harvestAll()` to realize profits and charge fees.
- Withdrawals redeem shares for underlying assets, pulling from strategies if needed.
- Clean separation of concerns: accounting (`Vault`), fees (`FeeModule`), roles (`AccessController`), execution (`Strategies`), and routing (`IndexSwap`, `IExchangeHandler`).

## Architecture
- **Vault**: ERC4626-style share accounting, TVL measurement, investing, harvesting, withdrawing.
- **FeeModule**: management, performance, entry, and exit fees with time-based accrual for mgmt.
- **AccessController**: `owner`, `manager`, `keeper` roles.
- **Strategies**: plug-ins that can be mark-to-market (Aave-like) or realize-on-harvest (Uniswap V3-like).
- **IndexSwap**: optional component for target weights and cooldown-based rebalances via `IExchangeHandler`.
- **PortfolioFactory**: deploys new parametrized `Vault` instances.

### Why this design
- **Modularity**: Swap strategies without changing vault logic.
- **Correctness**: Explicit accounting for realized vs unrealized profit.
- **Security**: Strict role gating and safe token transfers.
- **Testability**: Mocks simulate both continuous and realized yield.

## Core contracts and functions

### `contracts/core/Vault.sol`
- Key storage:
  - `name`, `symbol`, `decimals`, `asset`
  - `access` (`AccessController`), `fees` (`FeeModule`), `oracle`
  - `totalSupply`, `balanceOf` (share accounting)
  - `strategies[]`, `targetBps` mapping
  - `depositCap`, `minHarvestInterval`, `lastHarvest`

- User flows:
  - `deposit(uint256 assets, address receiver) → shares`
    - Transfers `assets` from user.
    - Entry fee charged via `FeeModule.takeEntryFee`.
    - Mints `shares = convertToShares(netAssets)`.
    - Emits `Deposit`.
    - Importance: ensures fair share pricing and protocol revenue at entry.
  - `withdraw(uint256 shares, address receiver) → assets`
    - Burns `shares`, computes owed `assets = convertToAssets(shares)`.
    - Pulls shortfall from strategies, pro-rata naive loop.
    - Exit fee charged via `FeeModule.takeExitFee` then pays treasury.
    - Emits `Withdraw`.
    - Importance: predictable exit, fund safety via liquidity pull.

- View helpers:
  - `totalAssets()`
    - Sums vault idle + `strategy.totalAssets()` across strategies.
    - Importance: canonical TVL used for fees, share pricing, sanity checks.
  - `convertToShares(uint256 assets)` and `convertToAssets(uint256 shares)`
    - ERC4626-style conversions for mint/redeem.

- Strategy/management:
  - `setStrategy(IStrategy s, uint16 bps)` onlyManager
    - Registers strategy and sets target basis points (sum ≤ 10_000).
    - Importance: capital allocation policy.
  - `investIdle()` onlyManager
    - Pushes idle `asset` pro-rata to strategies per `targetBps`.
    - Uses `safeApprove` then `s.deposit(toSend)`.
    - Importance: keeps capital productive.

- Harvesting:
  - `harvestAll()` onlyKeeper
    - Cooldown guarded by `minHarvestInterval`.
    - Records `beforeTA` and `idleBefore`.
    - Calls `strategy.harvest()` on all strategies.
      - Mark-to-market strategies usually return 0 and don’t transfer.
      - Realize-on-harvest strategies usually transfer realized profit to vault.
    - Records `afterTA` and `idleAfter`.
    - Computes:
      - `realizedProfit = max(idleAfter - idleBefore, 0)` (what actually arrived)
      - `mgmt = fees.computeMgmtFee(afterTA)` (time-pro-rated on full TVL)
      - `perf = realizedProfit * performanceFeeBps / 1e4`
    - Pays fees from vault idle to `treasury`, updates timestamps, emits:
      - `Harvest(realizedProfit, mgmt, perf, afterTA)`
    - Importance: clean separation of realized profit vs TVL changes; robust fee charging.

### `contracts/core/FeeModule.sol`
- Parameters: `managementFeeBps`, `performanceFeeBps`, `entryFeeBps`, `exitFeeBps`, `treasury`
- `setFees(mgmt, perf, entryF, exitF)` onlyGovernor with bounds
- `takeEntryFee(amount) → (net, fee)`
- `takeExitFee(amount) → (net, fee)`
- `computeMgmtFee(tvl)`: `tvl * mgmtBps * dt / (365 days * 1e4)`
- `onFeesCharged()`: updates `lastFeeTimestamp`
- Importance: fee policy is explicit, predictable, and time-based.

### `contracts/core/AccessController.sol`
- Roles: `owner`, `managers[address]`, `keepers[address]`
- Setters: `setOwner`, `setManager`, `setKeeper` (onlyOwner)
- Modifiers: `onlyOwner`, `onlyManager`, `onlyKeeper`
- Importance: operational safety and separation of duties.

### `contracts/core/IndexSwap.sol` (optional)
- `TokenWeight[] targets`, `cooldown`, `lastRebalance`
- `updateTargets`, `setCooldown`, `rebalance(bytes[] swapCalldatas)`
- Importance: structured rebalancing to target weights using `IExchangeHandler` to execute swaps.

### `contracts/core/PortfolioFactory.sol`
- `deployVault(asset, name, symbol, access, fees, oracle, cap, decimals) → vault`
- Importance: bootstrap new vaults with consistent parameters.

## Strategies and how they differ

### `contracts/mocks/MockStrategyMarkToMarket.sol` (Aave-like)
- `totalAssets()`: returns full token balance held by the strategy.
- `deposit(amount)`: pulls tokens from vault using `SafeTransferLib`.
- `harvest()`: returns 0 (yield accrues continuously in `totalAssets()`).
- Importance: good for lending markets where interest accrues linearly and is visible at all times.

### `contracts/mocks/MockStrategyRealizeProfit.sol` (UniV3-like)
- Tracks `principal`. `totalAssets()` returns the strategy token balance (so pending fees are visible to TVL).
- `harvest()`: transfers only the pending portion (`balance - principal`) to the vault and returns that realized profit.
- Importance: realistic for LP-style strategies where fees accumulate and are collected on harvest.

### `contracts/strategies/UniswapV3Strategy.sol` (reference)
- Demonstrates minting LP positions, collecting fees, and swapping non-want tokens to `want`.
- `_liquidateToWant()` converts token0/token1 to `want`, then transfers to `vault`.
- Importance: blueprint for building real UniswapV3 strategies.

### `contracts/strategies/AaveV3Strategy.sol` (skeleton/example)
- Shows how a lending-style strategy may integrate.

## Fees and accounting model
- **Entry/Exit fees**: charged at deposit/withdrawal; support protocol revenue and economic alignment.
- **Management fee**: time-pro-rated; charged on TVL to pay for strategy management/ops.
- **Performance fee**: charged on realized profit (not paper gains), ensuring alignment with performance.

This combination prevents fee gaming and ensures users are treated fairly regardless of where funds sit (vault idle or inside strategies).

## Access control and roles
- **Owner**: governance authority; appoints managers/keepers.
- **Manager**: adjusts strategies and allocations; calls `investIdle()`.
- **Keeper**: performs `harvestAll()` on a schedule; can be a bot.
- Importance: production-ready operational model and safety.

## Rebalancing and indices
- `IndexSwap` enables weight targets and cooldown-controlled rebalances through `IExchangeHandler`.
- Use cases: index-like portfolios, “smart beta” allocations, or simple diversification.

## Events and telemetry
- `Vault.Deposit`, `Vault.Withdraw`, `Vault.Harvest(grossProfit, mgmtFee, perfFee, tvlAfter)`
- `FeeModule.FeesUpdated`, `FeeModule.TreasuryUpdated`
- `AccessController.OwnerUpdated`, `ManagerSet`, `KeeperSet`
- Importance: off-chain bots and analytics can verify state and fees without scanning balances.

## Local development and testing
- Requirements: Node.js, npm, Hardhat.
- Install: `npm install`
- Compile: `npx hardhat compile`
- Run tests: `npx hardhat test`
- Notable tests: `test/vault.e2e.spec.js` — deposit → invest → simulate yield → harvest → fees → withdraw; asserts profits, mgmt/perf fees, and treasury deltas.

## Deployment notes
- Configure `hardhat.config.js` (compiler version, optimizer; consider `viaIR: true` for complex strategies).
- Deploy `AccessController`, `FeeModule`, then `Vault` via `PortfolioFactory`.
- Wire strategies and set `targetBps` via `setStrategy`.
- Set `minHarvestInterval` and `depositCap` according to ops policy.

## Security considerations
- Start with conservative `targetBps` and whitelist strategies.
- Carefully validate routers and calldata in `IExchangeHandler`.
- Only trusted keepers should harvest.
- Consider time locks and multi-sig for `owner` and `governor`.
- Add pausing/guard rails (not included here) before production use.

## FAQ
- Why realized profit vs TVL delta for performance fees?
  - TVL can be unchanged even when profit moves from strategy to vault; realized profit reflects what actually arrived and aligns incentives.
- Why separate roles?
  - Reduces risk: managers adjust allocations, keepers harvest, owners govern.
- Can I add new strategies?
  - Yes. Implement `IStrategy` and wire them via `setStrategy`. Follow the mark-to-market or realize-on-harvest pattern.

## Quick start (common commands)
- Compile: `npx hardhat compile`
- Test: `npx hardhat test`
- Gas report: `REPORT_GAS=true npx hardhat test`
