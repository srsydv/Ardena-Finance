// keeper.js
// Builds bytes[][] swap calldata using 0x /swap/v1/quote and saves result to swapdata.json
// Requires: axios, ethers (v6), dotenv, fs-extra

require("dotenv").config();
const axios = require("axios");
const fs = require("fs-extra");
const { ethers } = require("ethers");

const ZEROX_API = process.env.ZEROX_API || "";
const CHAIN_ID = Number(process.env.CHAIN_ID || 42161); // Arbitrum by default
const SLIPPAGE_BPS_DEFAULT = Number(process.env.SLIPPAGE_BPS || 50);

/**
 * Build a single 0x-based payload in the exact layout ExchangeHandler expects:
 * abi.encode(address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to, bytes routerCalldata)
 *
 * Params:
 *  - sellToken (address)
 *  - buyToken (address)
 *  - amountIn (string | BigInt) in smallest units
 *  - recipient (address) -> typically the strategy address
 *  - slippageBps (number)
 */
async function build0xSwapPayload({
  sellToken,
  buyToken,
  amountIn,
  recipient,
  slippageBps = SLIPPAGE_BPS_DEFAULT,
  chainId = CHAIN_ID,
  zeroXApiKey = ZEROX_API,
}) {
  if (!sellToken || !buyToken || !recipient) throw new Error("missing params");
  if (!amountIn || BigInt(amountIn) === 0n) throw new Error("amountIn must be > 0");

  const url = `https://api.0x.org/swap/v1/quote`;
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

  const res = await axios.get(url, { params, headers, timeout: 120_000 });
  const quote = res.data;
  const buyAmount = BigInt(quote.buyAmount || "0");
  const minOut = (buyAmount * BigInt(10000 - slippageBps)) / 10000n;

  const payload = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "address", "uint256", "uint256", "address", "bytes"],
    [quote.to, sellToken, buyToken, amountIn.toString(), minOut.toString(), recipient, quote.data]
  );

  return { payload, quote, minOut: minOut.toString(), buyAmount: buyAmount.toString() };
}

/**
 * Build allSwapData for vault strategies.
 * strategiesInfo: [{ address: <strategyAddr>, swaps: [{ sellToken, buyToken, amountIn, slippageBps? }, ...] }, ...]
 * returns bytes[][] as JS array of hex strings
 */
async function buildAllSwapData(strategiesInfo, opts = {}) {
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
        });
        inner.push(payload);
      }
    }
    allSwapData.push(inner);
  }
  return allSwapData;
}

/**
 * Save bytes[][] to a json file
 */
async function saveAllSwapDataToFile(allSwapData, filename = "swapdata.json") {
  await fs.writeFile(filename, JSON.stringify(allSwapData, null, 2));
  console.log("Saved swapdata to", filename);
}

/* ------------------- CLI demo ------------------- */
async function demo() {
  console.log("Keeper demo: building example invest allSwapData and saving to swapdata.json");

  // EXAMPLE: adapt to your vault strategy order
  const strategiesInfo = [
    { address: "0x0000000000000000000000000000000000000001", swaps: [] }, // e.g., Aave (no swaps)
    {
      address: "0x0000000000000000000000000000000000000002", // Uniswap strategy
      swaps: [
        {
          sellToken: process.env.USDC_ADDRESS || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          buyToken: process.env.WETH_ADDRESS || "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
          amountIn: process.env.EXAMPLE_AMOUNT_IN || "250000000", // 250 USDC (1e6)
          slippageBps: 50,
        },
      ],
    },
  ];

  const allSwapData = await buildAllSwapData(strategiesInfo);
  await saveAllSwapDataToFile(allSwapData, "swapdata.json");
  console.log("Done.");
}

if (require.main === module) {
  demo().catch((e) => {
    console.error("keeper error:", e);
    process.exit(1);
  });
}

// Export for programmatic use from tests
module.exports = { build0xSwapPayload, buildAllSwapData, saveAllSwapDataToFile };
