import { ethers } from "ethers";
import fetch from "node-fetch";
import vaultAbi from "../artifacts/contracts/Vault.sol/Vault.json" assert { type: "json" };
import stratAbi from "../artifacts/contracts/interfaces/IStrategy.sol/IStrategy.json" assert { type: "json" };

// === CONFIG ===
const RPC_URL = process.env.RPC_URL;             // Infura/Alchemy RPC
const PRIVATE_KEY = process.env.PRIVATE_KEY;     // Manager's key
const VAULT_ADDRESS = process.env.VAULT;         // Vault contract
const STRATEGY_ADDR = process.env.STRATEGY;      // Strategy to rebalance
const ONEINCH_API_KEY = process.env.ONEINCH_KEY; // get from 1inch.dev
const THRESHOLD_BPS = 500;                       // 5% drift tolerance

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // mainnet example
const WETH = "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

async function main() {
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultAbi.abi, signer);

  // 1. Read TVL + strategy balance
  const tvl = await vault.totalAssets();
  const stratVal = await (new ethers.Contract(STRATEGY_ADDR, stratAbi.abi, provider)).totalAssets();
  const targetBps = await vault.targetBps(STRATEGY_ADDR);
  const pct = stratVal * 10000n / tvl;

  console.log(`Vault TVL: ${ethers.formatUnits(tvl, 6)} USDC`);
  console.log(`Strategy: ${ethers.formatUnits(stratVal, 6)} USDC`);
  console.log(`Target: ${targetBps} bps, Actual: ${pct} bps`);

  const diff = pct > targetBps ? pct - targetBps : targetBps - pct;
  if (diff <= THRESHOLD_BPS) {
    console.log("✅ No rebalance needed");
    return;
  }

  console.log("⚠️ Rebalance triggered!");

  // 2. Example: Move 5000 USDC → WETH
  const amountIn = ethers.parseUnits("5000", 6);

  const url = `https://api.1inch.dev/swap/v5.2/1/swap?fromTokenAddress=${USDC}&toTokenAddress=${WETH}&amount=${amountIn}&fromAddress=${VAULT_ADDRESS}&slippage=50`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${ONEINCH_API_KEY}` }});
  const quote = await res.json();
  if (!quote.tx) throw new Error("No swap data from 1inch");

  const router = quote.tx.to;
  const routerData = quote.tx.data;
  const minOut = ethers.parseUnits("1", 18); // replace with quote.toTokenAmount if desired

  // 3. Encode calldata for ExchangeHandler
  const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address","address","address","uint256","uint256","address","bytes"],
    [router, USDC, WETH, amountIn, minOut, STRATEGY_ADDR, routerData]
  );

  // 4. Call investIdle(allSwapData)
  const tx = await vault.investIdle([[swapData]]); // nested array
  const rc = await tx.wait();

  console.log("✅ Rebalance executed in tx:", rc.hash);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
