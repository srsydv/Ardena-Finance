/**
 * keeper_relayer.js
 *
 * Usage examples at bottom of file.
 *
 * Requirements:
 *  - node >= 16
 *  - npm i axios ethers dotenv
 *  - set .env values (RPC_URL, PRIVATE_KEY, ZEROX_API optional, CHAIN_ID default 42161)
 *
 * This script builds payloads for your ExchangeHandler.swap(...):
 *  abi.encode(address router,
 *             address tokenIn,
 *             address tokenOut,
 *             uint256 amountIn,
 *             uint256 minOut,
 *             address to,
 *             bytes routerCalldata)
 *
 * It uses 0x /swap/v1/quote to obtain router + calldata.
 */

require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const { ethers } = require("ethers");

// --- CONFIG from env ---
const RPC_URL = process.env.ALCHEMY_ARBITRUM_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ZEROX_API = process.env.ZEROX_API || "";
const CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 42161; // Arbitrum default
const SLIPPAGE_BPS_DEFAULT = Number(process.env.SLIPPAGE_BPS || 50); // 0.5%

// provider & signer (optional use)
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;

// --- Helper: build 0x quote and pack payload ---
async function build0xSwapPayload({
  sellToken,
  buyToken,
  amountIn, // string or BigInt decimal-string smallest units
  recipient, // address that should receive bought tokens (usually strategy address)
  slippageBps = SLIPPAGE_BPS_DEFAULT,
  chainId = CHAIN_ID,
  zeroXApiKey = ZEROX_API,
  skipQuote = false, // if true, skip web call and build placeholder (debug)
}) {
  if (!sellToken || !buyToken || !recipient) {
    throw new Error("build0xSwapPayload: missing param(s)");
  }
  if (!amountIn || BigInt(amountIn) === 0n) {
    throw new Error(
      "build0xSwapPayload: amountIn must be > 0 for a meaningful 0x quote"
    );
  }

  // Request a 0x quote
  const url = `https://api.0x.org/swap/allowance-holder/quote`;
  const params = {
    sellToken,
    buyToken,
    sellAmount: amountIn.toString(),
    taker: recipient,
    chainId,
  };

  const headers = {};
  if (zeroXApiKey) {
    headers["0x-api-key"] = zeroXApiKey;
    headers["0x-version"] = "v2";
  }

  if (skipQuote) {
    // Useful for offline testing — fill with placeholders
    const placeholderRouter = ethers.constants.AddressZero;
    const placeholderCalldata = "0x";
    const placeholderBuy = "0";
    const minOut = BigInt(placeholderBuy) * BigInt(10000 - slippageBps) / 10000n;
    return {
      payload: ethers.utils.defaultAbiCoder.encode(
        ["address","address","address","uint256","uint256","address","bytes"],
        [placeholderRouter, sellToken, buyToken, amountIn.toString(), minOut.toString(), recipient, placeholderCalldata]
      ),
      quote: null,
      minOut: minOut.toString(),
    };
  }

  const res = await axios.get(url, { params, headers, timeout: 120_000 });
  const quote = res.data;

  // 0x returns buyAmount (expected output) as string in smallest units
  const buyAmount = BigInt(quote.buyAmount || "0");
  const minOut = (buyAmount * BigInt(10000 - slippageBps)) / 10000n;

  // Pack into your ExchangeHandler layout
  const payload = ethers.utils.defaultAbiCoder.encode(
    ["address","address","address","uint256","uint256","address","bytes"],
    [quote.to, sellToken, buyToken, amountIn.toString(), minOut.toString(), recipient, quote.data]
  );

  return { payload, quote, minOut: minOut.toString(), buyAmount: buyAmount.toString() };
}

// --- Helpers to build bytes[][] arrays ---
// strategiesInfo: array of strategy descriptors in vault index order
// e.g. [{ address: "0x...", swaps: [ { sellToken, buyToken, amountIn, slippageBps } ] }, ... ]
async function buildAllSwapData(strategiesInfo, opts = {}) {
  // returns bytes[][] (JS nested arrays with hex strings)
  const allSwapData = [];
  for (let i = 0; i < strategiesInfo.length; i++) {
    const st = strategiesInfo[i];
    const inner = [];
    if (st.swaps && st.swaps.length > 0) {
      for (let j = 0; j < st.swaps.length; j++) {
        const s = st.swaps[j];
        const { payload } = await build0xSwapPayload({
          sellToken: s.sellToken,
          buyToken: s.buyToken,
          amountIn: s.amountIn.toString(),
          recipient: s.recipient || st.address,
          slippageBps: s.slippageBps ?? opts.slippageBps ?? SLIPPAGE_BPS_DEFAULT,
          chainId: opts.chainId ?? CHAIN_ID,
          zeroXApiKey: opts.zeroXApiKey ?? ZEROX_API,
          skipQuote: opts.skipQuote ?? false,
        });
        inner.push(payload);
      }
    }
    allSwapData.push(inner);
  }
  return allSwapData;
}

// --- Optional: write JSON to disk for your tests to read later ---
function saveAllSwapDataToFile(allSwapData, filename = "swapdata.json") {
  // allSwapData is bytes[][] (hex strings)
  fs.writeFileSync(filename, JSON.stringify(allSwapData, null, 2));
  console.log("Saved swapdata to", filename);
}

// --- Optional: call Vault.investIdle or Vault.harvestAll (requires signer) ---
async function submitToVault(vaultAddress, vaultAbi, methodName, allSwapData, gasLimit) {
  if (!signer) throw new Error("No signer configured (set PRIVATE_KEY in .env)");
  const vault = new ethers.Contract(vaultAddress, vaultAbi, signer);
  const tx = await vault[methodName](allSwapData, { gasLimit: gasLimit ?? 8_000_000 });
  console.log(`Submitted tx ${tx.hash} -> waiting...`);
  const r = await tx.wait();
  console.log("Mined in", r.blockNumber, "gasUsed", r.gasUsed.toString());
  return r;
}

/* ============ CLI / Example usage =============
   You can run this script as a standalone builder:
   node keeper_relayer.js build-invest sample-config.json
   node keeper_relayer.js build-harvest sample-config.json

   Or import functions in your tests and call buildAllSwapData(...) directly.

   sample-config.json structure (example below)
==============================================*/

async function demoAndExit() {
  console.log("Demo: build sample investSwapData and save to swapdata.json");

  // Example strategies in vault order (index 0 = Aave, index 1 = Uniswap)
  // Replace tokens/addresses/amounts as needed for your test run
  const strategiesInfo = [
    {
      // Aave: no swaps needed (empty array)
      address: "0x0000000000000000000000000000000000000001",
      swaps: [],
    },
    {
      // Uni: convert some USDC -> WETH to prepare LP
      address: "0x0000000000000000000000000000000000000002",
      swaps: [
        {
          sellToken: process.env.USDC_ADDRESS || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          buyToken: process.env.WETH_ADDRESS || "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
          amountIn: process.env.EXAMPLE_AMOUNT_IN || "250000000", // USDC 250 * 1e6
          // recipient omitted -> will default to strategy.address
          slippageBps: 50,
        },
      ],
    },
  ];

  const allSwapData = await buildAllSwapData(strategiesInfo);
  console.log("Built allSwapData:", JSON.stringify(allSwapData, null, 2).slice(0, 1000));
  saveAllSwapDataToFile(allSwapData);
  process.exit(0);
}

// CLI arg handling - minimal
async function mainCli() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === "help") {
    console.log("Keeper/Relayer helper");
    console.log("Commands:");
    console.log("  node keeper_relayer.js demo              # build example swapdata.json");
    console.log("  node keeper_relayer.js build <jsonFile>  # build swapdata using config file");
    console.log("  node keeper_relayer.js send <method> <vaultAbi.json> <vaultAddress> <swapdata.json>  # send tx (requires PRIVATE_KEY)");
    process.exit(0);
  }

  if (cmd === "demo") {
    await demoAndExit();
  }

  if (cmd === "build") {
    const cfgFile = argv[1];
    if (!cfgFile) {
      console.error("Pass config file path (json). Example schema below.");
      process.exit(1);
    }
    const raw = fs.readFileSync(cfgFile, "utf8");
    const cfg = JSON.parse(raw);
    const allSwapData = await buildAllSwapData(cfg.strategies, cfg.opts || {});
    const out = cfg.output || "swapdata.json";
    saveAllSwapDataToFile(allSwapData, out);
    process.exit(0);
  }

  if (cmd === "send") {
    const method = argv[1]; // investIdle or harvestAll
    const abiFile = argv[2];
    const vaultAddr = argv[3];
    const swapdataFile = argv[4];
    if (!method || !abiFile || !vaultAddr || !swapdataFile) {
      console.error("Usage: send <method> <vaultAbi.json> <vaultAddress> <swapdata.json>");
      process.exit(1);
    }
    const vaultAbi = JSON.parse(fs.readFileSync(abiFile, "utf8"));
    const allSwapData = JSON.parse(fs.readFileSync(swapdataFile, "utf8"));
    await submitToVault(vaultAddr, vaultAbi, method, allSwapData);
    process.exit(0);
  }

  console.log("Unknown cmd", cmd);
  process.exit(1);
}

if (require.main === module) {
  mainCli().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}

// Export functions for programmatic use (e.g., from tests)
module.exports = {
  build0xSwapPayload,
  buildAllSwapData,
  saveAllSwapDataToFile,
  submitToVault,
};
