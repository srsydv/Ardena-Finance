/**
 * manager-bot.js
 * - Node >=18
 * - ethers v6
 *
 * Purpose: Listen -> debounce -> simulate -> send investIdle() from manager EOA
 *
 * WARNING: Keep manager private key secure. Prefer KMS/HSM.
 */

import dotenv from "dotenv";
dotenv.config();
import { ethers } from "ethers";

const RPC = process.env.RPC_URL;
const MANAGER_PK = process.env.MANAGER_PK; // manager private key (prefer KMS)
const VAULT_ADDRESS = process.env.VAULT_ADDRESS;
const DEBOUNCE_SECONDS = Number(process.env.DEBOUNCE_SECONDS || 90);
const POLL_RETRY_MS = Number(process.env.POLL_RETRY_MS || 5000);

if (!RPC || !MANAGER_PK || !VAULT_ADDRESS) {
  console.error("Set RPC_URL, MANAGER_PK, VAULT_ADDRESS in .env");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC);
const managerSigner = new ethers.Wallet(MANAGER_PK, provider);

// Minimal vault ABI (adjust if your vault has different names)
const vaultAbi = [
  "event Deposit(address indexed from, address indexed to, uint256 assets, uint256 net, uint256 shares)",
  "function canInvest() external view returns (bool)",
  "function investIdle(bytes[][] calldata allSwapData) external",
  "function lastInvested() external view returns (uint256)",
  "function targetBps(address strategy) external view returns (uint16)",
  "function strategiesLength() external view returns (uint256)",
  "function strategies(uint256 index) external view returns (address)"
];

const vaultIface = new ethers.Interface(vaultAbi);
const vault = new ethers.Contract(VAULT_ADDRESS, vaultAbi, provider);

// Simple in-memory state (for single-instance). Use Redis for multi-instance.
let debounceTimer = null;
let pendingEvent = null;
let busy = false;
let lastHandledBlock = 0;

const CONTRACTS = {
    vault: "0x3cd0145707C03316B48f8A254c494600c30ebf8d",
    asset: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a", // AAVE TOKEN (like UI)
    usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    weth: "0x4530fABea7444674a775aBb920924632c669466e", // NEW AAVE WETH
    aaveStrategy: "0x9362c59c71321c77CaeE86f9Cf02cbBF3b64277D", // NEW AAVE STRATEGY
    uniStrategy: "0x65cDA0b70d3D09139c0a78059082F885714a0Fe7", // NEW UNISWAP STRATEGY
    accessController: "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2",
    feeModule: "0x3873DaFa287f80792208c36AcCfC82370428b3DB",
    oracle: "0x6EE0A849079A5b63562a723367eAae77F3f5EB21",
    exchanger: "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF",
    mathAdapter: "0x263b2a35787b3D9f8c2aca02ce2372E9f7CD438E",
    poolAddress: "0x0E98753e483679703c902a0f574646d3653ad9eA", // NEW AAVE POOL
    indexSwap: "0x34C4E1883Ed95aeb100F79bdEe0291F44C214fA2",
    ethUsdAgg: "0x497369979EfAD100F83c509a30F38dfF90d11585",
    // New working addresses
    newSwapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" // NEW WORKING ROUTER
};

// Create contract instances
const assetAbi = [
    "function balanceOf(address account) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)"
];
const asset = new ethers.Contract(CONTRACTS.asset, assetAbi, provider);

const exchangerAbi = [
    "function setRouter(address router, bool ok) external",
    "function swap(bytes data) external returns (uint256 amountOut)"
];
const exchanger = new ethers.Contract(CONTRACTS.exchanger, exchangerAbi, managerSigner);

// Replace this with your real builder for swap payload (0x/Uniswap quoter)
// async function buildAllSwapData() {
//   // Example placeholder: empty strategies payload.
//   return [];
// }

async function buildAllSwapData(totalIdleAmount) {
    try {
        console.log('Creating swap data for invest with amount:', totalIdleAmount.toString());
        
        // Get the UniswapV3 strategy allocation from the vault
        const uniStrategyAddress = CONTRACTS.uniStrategy;
        const targetBps = await vault.targetBps(uniStrategyAddress);
        console.log('UniswapV3 strategy targetBps:', targetBps.toString());
        
        // Calculate how much goes to UniswapV3 strategy
        const idleAmountBigInt = BigInt(totalIdleAmount.toString());
        const targetBpsBigInt = BigInt(targetBps.toString());
        const toUniStrategy = (idleAmountBigInt * targetBpsBigInt) / 10000n;
        console.log('Amount going to UniswapV3 strategy:', toUniStrategy.toString());
        
        // For UniswapV3, swap half to WETH (like in vault.e2e.test.js)
        const amountIn = toUniStrategy / 2n;
        console.log('Amount to swap (USDC -> WETH):', amountIn.toString());

        // Uniswap V3 Router address (SwapRouter02) - NEW WORKING ROUTER
        const UNISWAP_V3_ROUTER = CONTRACTS.newSwapRouter; // Use new working router
        console.log('🔍 DEBUG: Using router address:', UNISWAP_V3_ROUTER);
        console.log('🔍 DEBUG: Expected new router:', '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
        console.log('🔍 DEBUG: Router addresses match:', UNISWAP_V3_ROUTER === '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
        const poolFee = 500; // 0.05% fee tier

        // ES Module compatible import for Uniswap artifact
        let artifact;
        // try {
            // Use dynamic import for ES modules (exactly like test file)
            const swapRouterModule = await import(
                "@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json",
                { with: { type: "json" } }
            );
            artifact = swapRouterModule.default;
            console.log('✅ Using dynamic import for SwapRouter02 artifact in invest');
        // } catch (error) {
        //     console.log('Dynamic import failed, trying fallback ABI:', error.message);
        //     // Fallback to direct ABI
        //     // artifact = {
        //     //     abi: [
        //     //         "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
        //     //     ]
        //     // };
        //     console.log('✅ Using fallback SwapRouter02 ABI for invest');
        // }
  
        const swapRouterInterface = new ethers.Interface(artifact.abi);

        // Get deadline (20 minutes from now) - same as test
        const deadline = Math.floor(Date.now() / 1000) + 1200;

        // Create exactInputSingle parameters - exactly like test
        const params = {
            tokenIn: CONTRACTS.asset, // AAVE instead of USDC
            tokenOut: CONTRACTS.weth,
            fee: poolFee,
            recipient: CONTRACTS.uniStrategy, // deliver WETH to the strategy
            deadline: deadline,
            amountIn: amountIn,
            amountOutMinimum: 0n, // for tests; in prod use a quoted minOut
            sqrtPriceLimitX96: 0n
        };

        console.log('Swap params:', params);

        // Encode exactInputSingle call - same as test
        const routerCalldata = swapRouterInterface.encodeFunctionData("exactInputSingle", [params]);

        console.log('Router calldata:', routerCalldata);

        // Pack payload for ExchangeHandler.swap(bytes) - EXACTLY like test
        // abi.encode(address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to, bytes routerCalldata)
        const payload = ethers.AbiCoder.defaultAbiCoder().encode(
            [
                "address",
                "address",
                "address",
                "uint256",
                "uint256",
                "address",
                "bytes",
            ],
            [
                UNISWAP_V3_ROUTER,
                CONTRACTS.asset, // AAVE instead of USDC
                CONTRACTS.weth,
                amountIn,
                0n,
                CONTRACTS.uniStrategy,
                routerCalldata,
            ]
        );

        console.log('Final payload:', payload);

        // Allow the router in ExchangeHandler - same as test
        // await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
        // try {
        //     // const isAllowed = await exchanger.routers(router);
        //     // if (isAllowed) {
        //     //   console.log("✅ Router already allowed:", router);
        //     //   return true;
        //     // }
        
        //     console.log("Router not allowed, setting now...");
        //     const tx = await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
        //     console.log("setRouter tx sent:", tx.hash);
        //     await tx.wait();
        //     console.log("setRouter confirmed!");
        //   } catch (err) {
        //     console.error("Failed to set router:", err);
        //   }

        // Create allSwapData array with correct structure (dynamically like test)
        // Get all strategies from vault to determine correct indices
        const strategiesLength = await vault.strategiesLength();
        const strategies = [];
        let activeStrategyIndex = -1;
        
        for (let i = 0; i < strategiesLength; i++) {
            const strategyAddress = await vault.strategies(i);
            strategies.push(strategyAddress);
            if (strategyAddress.toLowerCase() === CONTRACTS.uniStrategy.toLowerCase()) {
                activeStrategyIndex = i;
            }
        }
        
        console.log('Strategies found:', strategies);
        console.log('Active strategy (UniswapV3) index:', activeStrategyIndex);
        
        if (activeStrategyIndex === -1) {
            console.error('UniswapV3 strategy not found in vault strategies!');
            return []; // Return empty array if strategy not found
        }
        
        // Create allSwapData: empty arrays for all strategies, payload only for active strategy
        const allSwapData = [];
        for (let i = 0; i < strategies.length; i++) {
            if (i === activeStrategyIndex) {
                allSwapData.push([payload]); // Active strategy gets the swap payload
            } else {
                allSwapData.push([]); // Inactive strategies get empty array
            }
        }
        
        console.log('Final allSwapData:', allSwapData);
        console.log('AllSwapData structure check - should be array of arrays:', Array.isArray(allSwapData[0]), Array.isArray(allSwapData[1]));
        console.log('AllSwapData length:', allSwapData.length);
        console.log('AllSwapData[0] length:', allSwapData[0].length);
        console.log('AllSwapData[1] length:', allSwapData[1].length);

        return allSwapData;
    } catch (error) {
        console.error('Error creating swap data for invest:', error);
        return []; // Return empty array if swap data creation fails
    }
}

// Try to decode revert reason (Error(string)). Returns string or fallback.
function decodeRevertData(data) {
  if (!data) return "No revert data";
  try {
    if (typeof data === "string" && data.startsWith("0x08c379a0")) {
      // Error(string)
      const reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + data.slice(10))[0];
      return reason;
    }
    // fallback: try to toUtf8String from likely offset
    try {
      return ethers.toUtf8String(data);
    } catch {}
    return "Unknown revert payload: " + String(data).slice(0, 200);
  } catch (e) {
    return "Failed to decode revert: " + String(e);
  }
}


async function attemptInvest() {
  if (busy) {
    console.log("Bot busy; skipping attempt");
    return;
  }
  busy = true;
  try {
    console.log(new Date().toISOString(), "Attempting investIdle() as manager:", await managerSigner.getAddress());

    // quick canInvest check as read-only (from provider)
    // let can;
    // try {
    //   can = await vault.connect(provider).canInvest();
    // } catch (e) {
    //   console.error("canInvest() failed:", e);
    //   can = false;
    // }
    // if (!can) {
    //   console.log("canInvest returned false; skipping");
    //   busy = false;
    //   return;
    // }
    const idleAmount = await asset.balanceOf(CONTRACTS.vault);
    console.log('Idle amount in vault:', idleAmount.toString());
    
    if (idleAmount == 0) {
        console.log('No idle funds to invest, skipping investIdle call');
        busy = false;
        return;
    }

    // Build payload (replace with your builder)
    const allSwapData = await buildAllSwapData(idleAmount);
    console.log('Built swap data:', allSwapData);
    console.log('SwapData type:', typeof allSwapData);
    console.log('SwapData is array:', Array.isArray(allSwapData));
    console.log('SwapData length:', allSwapData ? allSwapData.length : 'undefined');

    // Check if allSwapData is valid
    if (!allSwapData || !Array.isArray(allSwapData) || allSwapData.length === 0) {
        console.error('Invalid swap data returned from buildAllSwapData');
        busy = false;
        return;
    }

    // Use contract connected to manager signer (same as integration.js)
    const vaultWithSigner = vault.connect(managerSigner);

    // Call investIdle directly (same approach as integration.js)
    console.log('About to call investIdle with data:', allSwapData);
    console.log('Transaction will be sent from:', await managerSigner.getAddress());
    
    const tx = await vaultWithSigner.investIdle(allSwapData);
    console.log("Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction mined:", receipt.transactionHash, "status:", receipt.status, "gasUsed:", receipt.gasUsed?.toString());
  } catch (err) {
    console.error("attemptInvest error:", err);
  } finally {
    busy = false;
  }
}

async function onDeposit(from, amount, event) {
  // avoid reprocessing same block
  if (event.blockNumber <= lastHandledBlock) {
    console.log("Old deposit event; block:", event.blockNumber);
    return;
  }
  lastHandledBlock = event.blockNumber;
  console.log(new Date().toISOString(), "Deposit observed:", from, amount.toString(), "block:", event.blockNumber);

  // debounce: wait DEBOUNCE_SECONDS before executing
  pendingEvent = { from, amount, block: event.blockNumber };
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    await attemptInvest();
  }, DEBOUNCE_SECONDS * 1000);
}

// start bot
async function start() {
  console.log("Manager bot starting. Manager address:", await managerSigner.getAddress());
  console.log("Listening to Deposit events on vault:", VAULT_ADDRESS);
  
  // Get current block number
  const currentBlock = await provider.getBlockNumber();
  console.log("Current block number:", currentBlock);
  
  // subscribe
  const filter = vault.filters.Deposit();
  console.log("Setting up Deposit event listener...");
  
  vault.on("Deposit", (from, to, assets, net, shares, event) => {
    console.log("🎉 DEPOSIT EVENT DETECTED!");
    console.log("From:", from);
    console.log("To:", to);
    console.log("Assets:", assets.toString());
    console.log("Net:", net.toString());
    console.log("Shares:", shares.toString());
    console.log("Event:", event);
    try {
      onDeposit(from, assets, event);
    } catch (e) {
      console.error("Failed to parse deposit log:", e);
    }
  });
  
  console.log("✅ Deposit event listener set up successfully!");

  // graceful shutdown
  process.on("SIGINT", () => {
    console.log("Shutting down...");
    vault.removeAllListeners();
    process.exit(0);
  });
}

start().catch((e) => {
  console.error("bot start failed:", e);
  process.exit(1);
});