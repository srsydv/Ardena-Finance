<div align="center">

# 🏦 Ardena Finance - Modular DeFi Vault Protocol

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.26.3-yellow?logo=hardhat)](https://hardhat.org)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-v5.4.0-blue)](https://openzeppelin.com)
[![Upgradeable](https://img.shields.io/badge/UUPS-Upgradeable-green)](#architecture)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

<br/>

*A production-ready, upgradeable vault framework with pluggable yield strategies, sophisticated fee mechanics, role-based access control, and automated keeper bots. Built on Velvet Capital's modular design principles.*

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Core Contracts](#-core-contracts)
- [Yield Strategies](#-yield-strategies)
- [Fee Structure](#-fee-structure)
- [Access Control](#-access-control)
- [Keeper Bots](#-keeper-bots)
- [Oracle System](#-oracle-system)
- [Deployment](#-deployment)
- [Testing](#-testing)
- [Security](#-security)
- [FAQ](#-faq)

---

## 🎯 Overview

**Ardena Finance** is an institutional-grade DeFi vault protocol that enables:
- **Modular Yield Generation**: Plug-and-play strategies (Aave V3 lending, Uniswap V3 LP)
- **ERC4626-Style Shares**: Standard vault interface with deposit/withdraw/share accounting
- **Upgradeable Design**: UUPS proxies for all core contracts
- **Fair Fee System**: Time-prorated management fees, realized performance fees, entry/exit fees
- **Automated Operations**: Keeper bots for harvesting, rebalancing, and maintenance
- **Robust Oracle Pricing**: Chainlink-based USD normalization with staleness checks
- **Safe Exchange Routing**: Whitelisted routers with slippage protection

---

## ✨ Key Features

### 🏗️ **Modular Architecture**
```json
{
  "vault": "ERC4626-style share accounting + TVL management",
  "strategies": ["AaveV3Strategy (lending)", "UniswapV3Strategy (LP fees)"],
  "modules": {
    "FeeModule": "Management, performance, entry, exit fees",
    "AccessController": "Owner, manager, keeper roles",
    "OracleModule": "Chainlink price feeds with USD normalization",
    "ExchangeHandler": "Whitelisted router swaps with safety checks",
    "IndexSwap": "Rebalancing engine with cooldown protection"
  }
}
```

### 💰 **Sophisticated Fee Mechanics**
- **Management Fee**: Time-prorated on TVL (max 20% APY)
- **Performance Fee**: Only on realized profits (max 30%)
- **Entry/Exit Fees**: Protocol revenue and anti-gaming (max 3% each)
- **Fair Accounting**: Separates realized PnL from unrealized TVL drift

### 🔐 **Multi-Role Access Control**
- **Owner**: Protocol governance, appoints managers/keepers
- **Manager**: Strategy allocation, rebalancing, investment decisions
- **Keeper**: Automated harvesting, bot-friendly operations

### 🤖 **Automated Keeper Bots**
- **Harvest Bot**: Collects yield, charges fees, reinvests
- **Rebalance Bot**: Maintains target allocations across strategies
- **Manager Bot**: Monitors TVL, executes strategic operations

---

## 🏛️ Architecture

### High-Level Flow
```
┌─────────────┐
│   Users     │
│ (Depositors)│
└──────┬──────┘
       │ deposit(USDC)
       ▼
┌─────────────────────────────────────┐
│            VAULT                     │
│  • ERC4626 share accounting          │
│  • TVL = idle + Σ strategy.assets() │
│  • Mints/burns shares                │
└────────┬────────────────────────────┘
         │ investIdle()
         ▼
┌──────────────────────────────────────┐
│         STRATEGIES                    │
│  ┌──────────────────────────────┐   │
│  │  AaveV3Strategy              │   │
│  │  • Lends USDC to Aave        │   │
│  │  • Auto-accruing aTokens     │   │
│  │  • Mark-to-market valuation  │   │
│  └──────────────────────────────┘   │
│                                       │
│  ┌──────────────────────────────┐   │
│  │  UniswapV3Strategy           │   │
│  │  • WETH/USDC LP position     │   │
│  │  • Collects swap fees        │   │
│  │  • Realize-on-harvest PnL    │   │
│  └──────────────────────────────┘   │
└───────────────────────────────────────┘
         │
         │ harvestAll() ← Keeper Bot
         ▼
┌──────────────────────────────────────┐
│         FEE MODULE                    │
│  • Mgmt fee = TVL × bps × dt / 365d  │
│  • Perf fee = realizedProfit × bps   │
└──────────────────────────────────────┘
```

### Contract Dependencies
```json
{
  "Vault": {
    "depends_on": ["AccessController", "FeeModule", "IStrategy[]"],
    "upgradeable": "UUPS",
    "proxy": "ERC1967Proxy"
  },
  "AaveV3Strategy": {
    "depends_on": ["IAavePool", "Vault"],
    "upgradeable": "UUPS",
    "valuation": "Mark-to-market"
  },
  "UniswapV3Strategy": {
    "depends_on": ["INonfungiblePositionManager", "IExchangeHandler", "IOracleRouter", "Vault"],
    "upgradeable": "UUPS",
    "valuation": "Realize-on-harvest"
  },
  "OracleModule": {
    "depends_on": ["AggregatorV3Interface (Chainlink)"],
    "upgradeable": "UUPS",
    "precision": "1e18 USD"
  },
  "IndexSwap": {
    "depends_on": ["Vault", "AccessController"],
    "upgradeable": "UUPS",
    "purpose": "Cooldown-controlled rebalancing"
  }
}
```

---

## 🧩 Core Contracts

### 1. **Vault** (`contracts/core/Vault.sol`)

The main entry point for users. Manages deposits, withdrawals, and strategy allocations.

#### **Key Functions**

| Function | Description | Access |
|----------|-------------|--------|
| `deposit(assets, receiver)` | Deposit USDC, mint shares (after entry fee) | Public |
| `withdraw(shares, receiver, swapData[][])` | Burn shares, return USDC (after exit fee) | Public |
| `investIdle(swapData[][])` | Deploy idle funds to strategies per `targetBps` | Manager |
| `harvestAll(swapData[][])` | Collect yield, charge fees, update accounting | Keeper |
| `rebalance(withdrawSwaps[][], investSwaps[][])` | Rebalance strategy allocations atomically | Manager |
| `setStrategy(strategy, bps)` | Register strategy with target allocation (bps) | Manager |
| `totalAssets()` | Returns TVL = idle + Σ strategy assets | View |
| `convertToShares(assets)` | Calculates shares for asset amount | View |

#### **Storage**

```json
{
  "asset": "IERC20 (e.g., USDC)",
  "totalSupply": "Total vault shares outstanding",
  "balanceOf": "mapping(address => uint256)",
  "strategies": "IStrategy[] array",
  "targetBps": "mapping(IStrategy => uint16) - allocation per strategy (sum ≤ 10000)",
  "depositCap": "Max TVL limit",
  "minHarvestInterval": "Cooldown between harvests (seconds)",
  "lastHarvest": "Timestamp of last harvest"
}
```

#### **Events**
```solidity
event Deposit(address indexed from, address indexed to, uint256 assets, uint256 net, uint256 shares);
event Withdraw(address indexed caller, address indexed to, uint256 assets, uint256 shares, uint256 exitFee, uint256 totalGot);
event Harvest(uint256 realizedProfit, uint256 mgmtFee, uint256 perfFee, uint256 tvlAfter);
event StrategySet(address strategy, uint16 bps);
```

---

### 2. **FeeModule** (`contracts/core/FeeModule.sol`)

Manages all fee configurations and calculations.

#### **Fee Types**

```json
{
  "managementFeeBps": {
    "description": "Annual fee on TVL, prorated per second",
    "max": "2000 (20% APY)",
    "formula": "TVL × bps × dt / (365 days × 10000)"
  },
  "performanceFeeBps": {
    "description": "Fee on realized profits only",
    "max": "3000 (30%)",
    "formula": "realizedProfit × bps / 10000"
  },
  "entryFeeBps": {
    "description": "Fee charged on deposits",
    "max": "300 (3%)",
    "formula": "depositAmount × bps / 10000"
  },
  "exitFeeBps": {
    "description": "Fee charged on withdrawals",
    "max": "300 (3%)",
    "formula": "withdrawAmount × bps / 10000"
  }
}
```

#### **Key Functions**

| Function | Description | Access |
|----------|-------------|--------|
| `setFees(mgmt, perf, entry, exit)` | Update fee parameters (bounds checked) | Governor |
| `takeEntryFee(amount)` | Returns (net, fee) tuple | View |
| `takeExitFee(amount)` | Returns (net, fee) tuple | View |
| `computeMgmtFee(tvl)` | Time-prorated mgmt fee since last charge | View |
| `onFeesCharged()` | Updates `lastFeeTimestamp` | External |
| `setTreasury(address)` | Update fee recipient | Governor |

---

### 3. **AccessController** (`contracts/core/AccessController.sol`)

Role-based access control for the protocol.

#### **Roles**

```json
{
  "owner": {
    "capabilities": ["Governance", "Appoint managers/keepers", "Update access rules"],
    "typical": "DAO multisig or timelock"
  },
  "managers": {
    "capabilities": ["Set strategy allocations", "Invest idle funds", "Rebalance", "Upgrade contracts"],
    "typical": "Protocol operators or automated strategies"
  },
  "keepers": {
    "capabilities": ["Harvest yields", "Execute scheduled tasks"],
    "typical": "Automated bots (Gelato, Chainlink Automation, custom)"
  }
}
```

#### **Key Functions**

| Function | Description | Access |
|----------|-------------|--------|
| `setOwner(address)` | Transfer ownership | Owner |
| `setManager(address, bool)` | Grant/revoke manager role | Owner |
| `setKeeper(address, bool)` | Grant/revoke keeper role | Owner |

---

### 4. **OracleModule** (`contracts/core/OracleModule.sol`)

Chainlink-based price oracle with USD normalization and staleness checks.

#### **Features**

- **Direct USD Feeds**: For tokens with native USD pairs (e.g., USDC/USD)
- **Composed Feeds**: Token/ETH × ETH/USD for tokens without direct USD feeds
- **Inversion Support**: Handles ETH/token feeds via `invert` flag
- **Staleness Protection**: Heartbeat-based freshness checks
- **1e18 Precision**: All prices normalized to 18 decimals

#### **Key Functions**

| Function | Description | Access |
|----------|-------------|--------|
| `setEthUsd(agg, heartbeat)` | Configure ETH/USD feed | Owner |
| `setTokenUsd(token, agg, heartbeat)` | Configure direct token/USD feed | Owner |
| `setTokenEthRoute(token, agg, invert, heartbeat)` | Configure token/ETH composition path | Owner |
| `price(token)` | Returns 1 token in USD (1e18) | View |
| `isPriceStale(token)` | True if any underlying feed is stale | View |

#### **Price Composition Example**

```solidity
// For WETH:
price(WETH) = ethUsd.latestAnswer() // Direct feed

// For tokens without USD feed (e.g., DAI):
// 1) Get DAI/ETH from Chainlink (e.g., 0.0005 ETH per DAI, scaled to 1e18)
// 2) Get ETH/USD from Chainlink (e.g., $2000 per ETH, scaled to 1e18)
// 3) Price(1 DAI) = (ETH/USD) × (1 / DAI_per_ETH)
//                  = 2000e18 × 1e18 / (2000e18) = 1e18 ($1 USD)
```

---

### 5. **ExchangeHandler** (`contracts/core/ExchangeHandler.sol`)

Secure swap router with whitelist and safety checks.

#### **Features**

- **Router Whitelist**: Only approved DEX routers can be called
- **Slippage Protection**: `minOut` enforcement on every swap
- **Flexible Calldata**: Supports any router interface (UniV2, UniV3, 0x, etc.)
- **Pull Pattern**: Strategies approve handler, handler pulls tokens, approves router

#### **Key Functions**

| Function | Description | Access |
|----------|-------------|--------|
| `setRouter(address, bool)` | Whitelist/delist router | Owner |
| `swap(bytes data)` | Execute swap with encoded parameters | External |

#### **Swap Data Format**

```json
{
  "encoding": "abi.encode(router, tokenIn, tokenOut, amountIn, minOut, to, routerCalldata)",
  "parameters": {
    "router": "Whitelisted DEX router address",
    "tokenIn": "Source token address",
    "tokenOut": "Destination token address",
    "amountIn": "Amount to swap (0 or type(uint256).max for full balance)",
    "minOut": "Minimum output (slippage protection)",
    "to": "Recipient of output tokens",
    "routerCalldata": "Router-specific function call (e.g., swapExactTokensForTokens)"
  }
}
```

---

### 6. **IndexSwap** (`contracts/core/IndexSwap.sol`)

Rebalancing engine with cooldown protection.

#### **Key Functions**

| Function | Description | Access |
|----------|-------------|--------|
| `rebalance(withdrawAmts[], withdrawSwaps[][], investSwaps[][])` | Rebalance vault to target weights | Manager |
| `setCooldown(seconds)` | Update minimum time between rebalances | Manager |

#### **Rebalance Flow**

```
1. Withdraw from over-allocated strategies → pull back to Vault
2. Vault's investIdle() → deploy to underweight strategies
3. Update lastRebalance timestamp
4. Emit Rebalanced(timestamp)
```

---

## 🌾 Yield Strategies

### Strategy Interface (`contracts/interfaces/IStrategy.sol`)

```solidity
interface IStrategy {
    function want() external view returns (address);
    function totalAssets() external view returns (uint256);
    function deposit(uint256 amount, bytes[] calldata swapData) external;
    function withdraw(uint256 amount, bytes[] calldata swapData) external returns (uint256);
    function withdrawAll() external returns (uint256);
    function harvest(bytes[] calldata swapData) external returns (uint256 profit);
}
```

---

### 1. **AaveV3Strategy** (`contracts/strategies/AaveV3Strategy.sol`)

Lends USDC to Aave V3 for passive yield.

#### **Features**

- **Mark-to-Market Valuation**: `totalAssets()` reflects real-time accrued interest via `liquidityIndex`
- **Auto-Compounding**: Interest accrues automatically on aTokens
- **No Manual Harvest**: `harvest()` returns 0 (yield tracked continuously)
- **Upgradeable & Re-wireable**: Can be reassigned to a new Vault via `setVault()`

#### **Key Functions**

```json
{
  "deposit(amountWant, swapData)": "Supply USDC to Aave, receive aUSDC",
  "withdraw(amount, swapData)": "Redeem USDC from Aave to Vault",
  "withdrawAll()": "Exit entire position (max withdrawal)",
  "harvest(swapData)": "No-op for Aave (returns 0)",
  "totalAssets()": "scaledBalance × liquidityIndex / 1e27 (scaled to want decimals)"
}
```

#### **Valuation**

```solidity
// Aave V3 uses a rebasing aToken with liquidityIndex (RAY = 1e27)
uint256 scaledBalance = IScaledBalanceToken(aToken).scaledBalanceOf(address(this));
uint256 liquidityIndex = aave.getReserveData(wantToken).liquidityIndex;
uint256 currentBalance = (scaledBalance * liquidityIndex) / 1e27;
```

---

### 2. **UniswapV3Strategy** (`contracts/strategies/UniswapV3Strategy.sol`)

Provides liquidity to Uniswap V3 pools and collects swap fees.

#### **Features**

- **Realize-on-Harvest Valuation**: Profit is only counted when fees are collected and swapped
- **Single NFT Position**: Mints once, then increases liquidity on subsequent deposits
- **Oracle-Based Pricing**: Converts token0/token1 balances to `want` using `OracleModule`
- **Automated Swap Routing**: Uses `ExchangeHandler` for token conversions
- **Math Adapter**: External contract for Uniswap v3 math (0.7.6 compatibility)

#### **Key Functions**

```json
{
  "deposit(amountWant, swapData)": "Swap USDC → WETH/USDC, mint/increase LP position",
  "withdraw(amount, swapData)": "Decrease liquidity, collect fees, swap to USDC",
  "withdrawAll()": "Remove all liquidity, collect all fees, liquidate to USDC",
  "harvest(swapData)": "Collect fees, swap to USDC, send realized profit to Vault",
  "totalAssets()": "Oracle-valued liquidity + uncollected fees + idle USDC"
}
```

#### **Position Management**

```solidity
// First deposit: mint new position
if (tokenId == 0) {
    (tokenId, , ,) = pm.mint(MintParams({
        token0: WETH,
        token1: USDC,
        fee: 500, // 0.05%
        tickLower: currentTick - 100*spacing,
        tickUpper: currentTick + 100*spacing,
        amount0Desired: balWETH,
        amount1Desired: balUSDC,
        ...
    }));
}
// Subsequent deposits: increase liquidity
else {
    pm.increaseLiquidity(IncreaseLiquidityParams({
        tokenId: tokenId,
        amount0Desired: balWETH,
        amount1Desired: balUSDC,
        ...
    }));
}
```

#### **Fee Collection & Harvest**

```solidity
// Collect all pending fees
(uint256 fee0, uint256 fee1) = pm.collect(CollectParams({
    tokenId: tokenId,
    recipient: address(this),
    amount0Max: type(uint128).max,
    amount1Max: type(uint128).max
}));

// Swap fees to want
uint256 before = IERC20(wantToken).balanceOf(address(this));
_executeSwaps(swapData); // WETH → USDC
uint256 after = IERC20(wantToken).balanceOf(address(this));

// Realized profit
uint256 profit = after - before;
if (profit > 0) wantToken.safeTransfer(vault, profit);
```

---

## 💸 Fee Structure

### Fee Calculation Examples

#### **Management Fee**

```solidity
// Time-prorated on TVL
// Fee = TVL × mgmtBps × (now - lastFeeTimestamp) / (365 days × 10000)

// Example: 10% APY on $1M TVL after 30 days
// mgmtBps = 1000 (10%)
// dt = 30 days = 2_592_000 seconds
// Fee = 1_000_000 × 1000 × 2_592_000 / (31_536_000 × 10000)
//     = $8,219.18 (≈ 10% × 30/365 × $1M)
```

#### **Performance Fee**

```solidity
// Only on realized profit (what actually arrived in Vault)
// Fee = realizedProfit × perfBps / 10000

// Example: 20% fee on $50k realized profit
// perfBps = 2000 (20%)
// Fee = 50_000 × 2000 / 10000 = $10,000
```

#### **Entry/Exit Fees**

```solidity
// Entry fee on deposits
// net = depositAmount - (depositAmount × entryBps / 10000)

// Example: 1% entry fee on $100k deposit
// entryBps = 100 (1%)
// fee = 100_000 × 100 / 10000 = $1,000
// net = $99,000 (goes to vault)

// Exit fee on withdrawals (same formula)
```

---

## 🔐 Access Control

### Role Matrix

| Action | Owner | Manager | Keeper | Public |
|--------|-------|---------|--------|--------|
| Deposit/Withdraw | ✅ | ✅ | ✅ | ✅ |
| Set Strategy | ❌ | ✅ | ❌ | ❌ |
| Invest Idle | ❌ | ✅ | ❌ | ❌ |
| Rebalance | ❌ | ✅ | ❌ | ❌ |
| Harvest | ❌ | ❌ | ✅ | ❌ |
| Set Fees | ✅ | ❌ | ❌ | ❌ |
| Appoint Roles | ✅ | ❌ | ❌ | ❌ |
| Upgrade Contracts | ✅/Manager* | ✅ | ❌ | ❌ |

*Upgrade authorization varies by contract (Vault: Manager, FeeModule: Governor, etc.)

---

## 🤖 Keeper Bots

Automated bots for protocol operations. Located in `bots/` directory.

### 1. **Harvest Bot** (`bots/harvestBot.js`)

**Purpose**: Periodically harvest yields from strategies and charge fees.

```json
{
  "trigger": "Time-based (minHarvestInterval cooldown)",
  "actions": [
    "Check if cooldown elapsed",
    "Build swap calldata for each strategy (off-chain routing)",
    "Call Vault.harvestAll(swapData[][])",
    "Emit telemetry/logs"
  ],
  "gas_optimization": "Batch harvests for all strategies in single tx",
  "error_handling": "Retry with exponential backoff, alert on persistent failures"
}
```

#### **Sample Code Flow**

```javascript
// bots/harvestBot.js
const { ethers } = require("ethers");
const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);

async function harvestLoop() {
  while (true) {
    try {
      const lastHarvest = await vault.lastHarvest();
      const minInterval = await vault.minHarvestInterval();
      
      if (Date.now() / 1000 >= lastHarvest + minInterval) {
        // Build swap routes for each strategy
        const swapData = await buildSwapData();
        
        // Execute harvest
        const tx = await vault.harvestAll(swapData, { gasLimit: 2_000_000 });
        await tx.wait();
        
        console.log(`✅ Harvest successful: ${tx.hash}`);
      }
      
      await sleep(3600000); // Check hourly
    } catch (err) {
      console.error("❌ Harvest failed:", err);
      await sleep(300000); // Retry in 5 min
    }
  }
}
```

---

### 2. **Rebalance Bot** (`bots/rebalanceBot.js`)

**Purpose**: Maintain target allocations across strategies.

```json
{
  "trigger": "Deviation from target allocation > threshold (e.g., 5%)",
  "actions": [
    "Fetch current strategy balances",
    "Compare to targetBps",
    "Calculate withdrawals from overweight strategies",
    "Calculate deposits to underweight strategies",
    "Call Vault.rebalance(withdrawSwaps[][], investSwaps[][])"
  ],
  "threshold": "5% deviation or manual trigger",
  "safety": "Cooldown enforced by IndexSwap contract"
}
```

---

### 3. **Manager Bot** (`bots/manager-bot.js`)

**Purpose**: High-level strategy management and monitoring.

```json
{
  "capabilities": [
    "Monitor TVL and strategy health",
    "Adjust strategy allocations based on market conditions",
    "Emergency pause/unpause",
    "Upgrade contract implementations",
    "Generate performance reports"
  ],
  "typical_use": "DAO-controlled or multisig-operated"
}
```

---

## 📊 Oracle System

### Chainlink Feed Configuration

#### **Example Setup**

```javascript
// deploy/configureOracles.js
const oracleModule = await ethers.getContract("OracleModule");

// 1. ETH/USD feed (required for all token/ETH compositions)
await oracleModule.setEthUsd(
  "0x694AA1769357215DE4FAC081bf1f309aDC325306", // Sepolia ETH/USD
  3600 // 1 hour heartbeat
);

// 2. USDC/USD direct feed
await oracleModule.setTokenUsd(
  USDC_ADDRESS,
  "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", // Sepolia USDC/USD
  86400 // 24 hour heartbeat
);

// 3. WETH via token/ETH composition (if needed)
await oracleModule.setTokenEthRoute(
  WETH_ADDRESS,
  "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  false, // not inverted (WETH/ETH = 1:1)
  3600
);
```

#### **Supported Networks**

```json
{
  "mainnet": {
    "ETH/USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    "USDC/USD": "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6"
  },
  "sepolia": {
    "ETH/USD": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    "USDC/USD": "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E"
  }
}
```

---

## 🚀 Deployment

### Prerequisites

```bash
# Node.js (v18+)
node --version

# Install dependencies
npm install

# Set up environment variables
cp env.template .env
# Edit .env with your private key, RPC URLs, etc.
```

### Deployment Steps

#### **1. Compile Contracts**

```bash
npx hardhat compile
```

#### **2. Deploy Core Contracts**

```bash
# Deploy to Sepolia testnet
npx hardhat run deploy/DeployOnSapolia.Script.js --network sepolia
```

**Deployment Order:**

```json
{
  "step_1": "Deploy AccessController (no dependencies)",
  "step_2": "Deploy FeeModule (depends on asset, treasury, governor)",
  "step_3": "Deploy OracleModule (depends on WETH address)",
  "step_4": "Deploy ExchangeHandler (no dependencies)",
  "step_5": "Deploy Vault (depends on AccessController, FeeModule, asset)",
  "step_6": "Deploy Strategies (depend on Vault, external protocols)",
  "step_7": "Deploy IndexSwap (depends on Vault, AccessController)",
  "step_8": "Configure roles, fees, and oracles"
}
```

#### **3. Configure System**

```javascript
// Set up roles
await accessController.setManager(MANAGER_ADDRESS, true);
await accessController.setKeeper(KEEPER_BOT_ADDRESS, true);

// Set fees (example: 10% mgmt, 20% perf, 1% entry, 0.5% exit)
await feeModule.setFees(1000, 2000, 100, 50);

// Register strategies with allocations
await vault.setStrategy(aaveStrategy.address, 6000); // 60% to Aave
await vault.setStrategy(uniStrategy.address, 4000);  // 40% to Uniswap V3

// Configure oracles (see Oracle System section)
```

#### **4. Verify Contracts**

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

Or use the batch verification script:

```bash
bash HelperTests/verify-all-contracts.sh
```

---

### Upgrade Contracts

Using UUPS pattern:

```javascript
// upgrade/upgradeVault.js
const { ethers, upgrades } = require("hardhat");

async function upgradeVault() {
  const VaultV2 = await ethers.getContractFactory("Vault");
  const upgraded = await upgrades.upgradeProxy(VAULT_PROXY_ADDRESS, VaultV2);
  await upgraded.deployed();
  
  console.log("✅ Vault upgraded at:", upgraded.address);
}
```

---

## 🧪 Testing

### Run Full Test Suite

```bash
# All tests
npx hardhat test

# E2E flow test
npx hardhat test test/vault.e2e.test.js

# With gas reporting
REPORT_GAS=true npx hardhat test

# With coverage
npx hardhat coverage
```

### Test Structure

```json
{
  "unit_tests": {
    "location": "test/",
    "coverage": [
      "Vault deposit/withdraw/share math",
      "Fee calculations (mgmt, perf, entry, exit)",
      "Strategy integrations (Aave, Uniswap)",
      "Oracle price feeds and staleness",
      "Access control role checks"
    ]
  },
  "e2e_tests": {
    "location": "test/vault.e2e.test.js",
    "flow": [
      "1. Deploy all contracts",
      "2. User deposits USDC → receives shares",
      "3. Manager invests idle funds → strategies deploy capital",
      "4. Simulate yield accrual (Aave interest, Uniswap fees)",
      "5. Keeper harvests → fees charged, profit realized",
      "6. User withdraws → burns shares, receives USDC (after exit fee)",
      "7. Assert final balances, TVL, share prices"
    ]
  },
  "helper_tests": {
    "location": "HelperTests/",
    "purpose": "Debug scripts for live networks (check roles, pool liquidity, oracle prices, etc.)"
  }
}
```

### Example Test

```javascript
// test/vault.e2e.test.js (simplified)
const { expect } = require("chai");

describe("Vault E2E Flow", function () {
  it("Full user journey: deposit → invest → harvest → withdraw", async () => {
    // 1. User deposits $10,000 USDC
    await usdc.approve(vault.address, parseUnits("10000", 6));
    await vault.deposit(parseUnits("10000", 6), user.address);
    
    // 2. Manager invests 60% to Aave, 40% to Uniswap
    await vault.connect(manager).investIdle([[], swapDataForUni]);
    
    // 3. Simulate 30 days of yield
    await time.increase(30 * 86400);
    
    // 4. Keeper harvests
    await vault.connect(keeper).harvestAll([[], swapDataForUni]);
    
    // 5. User withdraws all shares
    const shares = await vault.balanceOf(user.address);
    await vault.withdraw(shares, user.address, [[], []]);
    
    // 6. Assert profit
    const finalBalance = await usdc.balanceOf(user.address);
    expect(finalBalance).to.be.gt(parseUnits("10000", 6));
  });
});
```

---

## 🛡️ Security

### Best Practices

```json
{
  "access_control": {
    "owner": "Use multisig (Gnosis Safe) or timelock (DAO governance)",
    "manager": "Trusted operators only; consider role expiry",
    "keeper": "Bot addresses with limited privileges (harvest only)"
  },
  "strategy_safety": {
    "whitelist": "Only add audited, battle-tested strategies",
    "caps": "Set max allocation per strategy to limit exposure",
    "emergency_exit": "Implement pause/emergency withdraw functions"
  },
  "oracle_reliability": {
    "heartbeat": "Enforce strict staleness checks (< 1 hour for volatile assets)",
    "fallback": "Consider secondary oracle sources (Uniswap TWAP, etc.)",
    "manipulation": "Use time-weighted averages for DEX oracles"
  },
  "swap_routing": {
    "whitelist": "Only approved DEX routers (no arbitrary external calls)",
    "slippage": "Always enforce minOut on swaps",
    "MEV_protection": "Use private mempool (Flashbots, etc.) for large swaps"
  },
  "upgrades": {
    "uups_pattern": "Requires explicit authorization in contract logic",
    "timelock": "Add 48h delay for upgrades (community review)",
    "testing": "Thoroughly test upgrade paths on testnet first"
  }
}
```

### Audits

```json
{
  "status": "Not yet audited (pre-production)",
  "recommendations": [
    "OpenZeppelin Defender for contract monitoring",
    "Certora formal verification for critical paths",
    "Trail of Bits or Consensys Diligence audit before mainnet"
  ]
}
```

### Known Considerations

1. **Reentrancy**: Mitigated via checks-effects-interactions pattern
2. **Front-running**: Entry/exit fees discourage sandwich attacks
3. **Oracle Manipulation**: Staleness checks + Chainlink's decentralized feeds
4. **Strategy Risk**: Diversification across Aave (lending) + Uniswap (LP)
5. **Upgrade Risk**: UUPS requires explicit authorization, role-gated

---

## 📖 FAQ

<details>
<summary><b>Why realized profit vs TVL delta for performance fees?</b></summary>

TVL can remain constant even when profit moves from strategy to vault (e.g., Aave interest accrues continuously but vault sees it only after withdrawal). Realized PnL reflects what actually arrived in the vault during harvest, ensuring fair fee calculation.

**Example:**
- TVL before harvest: $1M (includes $50k unrealized Aave interest)
- TVL after harvest: $1M (interest still in Aave, not moved)
- Realized profit: $0 → No performance fee yet
- TVL after withdraw: $1.05M (interest collected) → Performance fee charged on $50k

</details>

<details>
<summary><b>Why separate Owner/Manager/Keeper roles?</b></summary>

- **Security**: Limits blast radius of compromised keys
- **Operational**: Keepers can harvest without allocation privileges
- **Governance**: Owner (DAO) retains ultimate control without day-to-day ops
- **Automation**: Keeper bots are stateless and can be replaced easily

</details>

<details>
<summary><b>Can I add custom strategies?</b></summary>

Yes! Implement the `IStrategy` interface:

```solidity
interface IStrategy {
    function want() external view returns (address);
    function totalAssets() external view returns (uint256);
    function deposit(uint256 amount, bytes[] calldata swapData) external;
    function withdraw(uint256 amount, bytes[] calldata swapData) external returns (uint256);
    function withdrawAll() external returns (uint256);
    function harvest(bytes[] calldata swapData) external returns (uint256 profit);
}
```

Then register it:

```javascript
await vault.connect(manager).setStrategy(customStrategy.address, 2000); // 20% allocation
```

</details>

<details>
<summary><b>How does Uniswap V3 strategy handle impermanent loss?</b></summary>

Impermanent loss is inherent to LP positions. The strategy:
1. Collects swap fees to offset IL
2. Uses wide tick ranges (±100 spacings) to reduce rebalancing frequency
3. Values position via oracle (not pool price) to prevent manipulation
4. Realizes profit only on fee collection, not unrealized price changes

**Mitigation:** Choose stable pairs (USDC/WETH) and monitor APY vs IL.

</details>

<details>
<summary><b>What networks are supported?</b></summary>

Currently configured for:
- **Ethereum Mainnet**: Production (requires mainnet Aave/Uniswap addresses)
- **Sepolia Testnet**: Primary testnet (pre-configured in scripts)
- **Local Hardhat**: Development (with mainnet forks)

**Adding new network:**
1. Update `hardhat.config.js` with RPC URL
2. Deploy contracts via deployment scripts
3. Configure protocol-specific addresses (Aave pools, Uniswap routers, Chainlink feeds)

</details>

<details>
<summary><b>How do I monitor vault performance?</b></summary>

**On-chain:**
- `vault.totalAssets()` → Current TVL
- `vault.totalSupply()` → Total shares outstanding
- Share price: `totalAssets() / totalSupply()`
- Historical `Harvest` events → Track realized profits and fees

**Off-chain:**
- Bot logs (harvest/rebalance telemetry)
- Block explorer (Etherscan) for tx history
- Dune Analytics dashboards (community-built)
- The Graph subgraphs (custom indexing)

</details>

<details>
<summary><b>What's the gas cost for typical operations?</b></summary>

**Estimated gas usage (Sepolia testnet):**

```json
{
  "deposit": "~150k gas (first deposit), ~80k gas (subsequent)",
  "withdraw": "~120k gas (idle funds), ~250k gas (with strategy withdrawal)",
  "investIdle": "~200k gas (2 strategies)",
  "harvestAll": "~300k gas (collect fees, swap, charge protocol fees)",
  "rebalance": "~400k gas (multi-strategy reallocation)"
}
```

*Mainnet costs will be higher due to denser contract state.*

</details>

---

## 📄 License

This project is licensed under the **MIT License**.

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📞 Contact & Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/your-repo/issues)
- **Documentation**: This README + inline code comments
- **Community**: [Discord](#) | [Telegram](#)

---

<div align="center">

**Built with ❤️ using Solidity, Hardhat, and OpenZeppelin**

[⬆ Back to Top](#-ardena-finance---modular-defi-vault-protocol)

</div>
