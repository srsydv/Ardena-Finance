// scripts/set-aave-per-weth-aggregator.js
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

// Minimal ABIs
const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24, uint16, uint16, uint16, uint8, bool)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
];
const ERC20_META_ABI = ["function decimals() external view returns (uint8)"];
const MOCK_AGG_ABI = [
  "function decimals() external view returns (uint8)",
  "function setAnswer(int256 a) external",
];

async function updateMockAggregatorWithWethInAavePrice({
  rpcUrl,
  privateKey,
  poolAddress,   // Uniswap v3 AAVE/WETH pool
  aaveAddress,   // AAVE token address
  wethAddress,   // WETH token address
  aggregator,    // MockAggregatorV3 address
}) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || rpcUrl || `https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik`);
  const pkRaw = process.env.PK || privateKey;
  if (!pkRaw) throw new Error("Missing PK (set env PK or pass privateKey)");
  const pk = pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`;
  const signer = new ethers.Wallet(pk, provider);

  // Default to deployed MockAggregatorV3 from DEPLOYEDCONTRACT.me if env/arg not provided
  const DEFAULT_AGG = "0x24Ab86F4Cc75a5E0016d18BD887fF21CA254a949";
  const candidateAgg = (process.env.AGG || aggregator || DEFAULT_AGG).toString();
  const aggregatorAddr = ethers.isAddress(candidateAgg) ? candidateAgg : DEFAULT_AGG;

  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const agg = new ethers.Contract(aggregatorAddr, MOCK_AGG_ABI, signer);

  // Read pool state
  const [slot0, token0, token1] = await Promise.all([
    pool.slot0(),
    pool.token0(),
    pool.token1(),
  ]);
  const sqrtPriceX96 = BigInt(slot0.sqrtPriceX96);

  // Read decimals
  const [dec0, dec1] = await Promise.all([
    new ethers.Contract(token0, ERC20_META_ABI, provider).decimals(),
    new ethers.Contract(token1, ERC20_META_ABI, provider).decimals(),
  ]);
  const d0 = BigInt(dec0);
  const d1 = BigInt(dec1);

  // Compute AAVE per 1 WETH at 1e18 scale
  // Price(T1 in T0) = (sqrtPriceX96^2 * 10^(d0-d1)) / 2^192
  // We want: AAVE per WETH
  const Q96 = 1n << 96n;
  const Q192 = Q96 * Q96;
  const sp2 = sqrtPriceX96 * sqrtPriceX96;

  let aavePerWeth1e18;
  if (token0.toLowerCase() === aaveAddress.toLowerCase() && token1.toLowerCase() === wethAddress.toLowerCase()) {
    // token0=AAVE, token1=WETH → price(AAVE/WETH) = AAVE per WETH = (Q192 * 10^(d1-d0)) / sp2
    const scale = 10n ** (d1 - d0); // usually 10^(18-18)=1
    aavePerWeth1e18 = (Q192 * scale * 10n**18n) / sp2;
  } else if (token0.toLowerCase() === wethAddress.toLowerCase() && token1.toLowerCase() === aaveAddress.toLowerCase()) {
    // token0=WETH, token1=AAVE → price(AAVE/WETH) = (sp2 * 10^(d0-d1)) / Q192
    const scale = 10n ** (d0 - d1);
    aavePerWeth1e18 = (sp2 * scale * 10n**18n) / Q192;
  } else {
    throw new Error("Pool is not the AAVE/WETH pair you expect.");
  }

  // Scale to aggregator decimals (MockAggregatorV3 commonly uses 8 like Chainlink)
  let aggDecimals = 8n;
  try { aggDecimals = BigInt(await agg.decimals()); } catch {}
  const answer = aavePerWeth1e18 / (10n ** (18n - aggDecimals)); // 1e18 → 1eAgg

  console.log("AAVE per 1 WETH (1e18):", ethers.formatUnits(aavePerWeth1e18, 18));
  console.log(`Setting MockAggregatorV3 @ ${aggregatorAddr} (decimals=${aggDecimals}) to:`, answer.toString());

  const tx = await agg.setAnswer(answer);
  console.log("setAnswer tx:", tx.hash);
  await tx.wait();
  console.log("✅ Oracle updated");
}

// Example usage (fill your values or load from env)
await updateMockAggregatorWithWethInAavePrice({
  rpcUrl: "https://sepolia.infura.io/v3/YOUR_KEY",
  privateKey: process.env.PK,
  poolAddress: "0x0E98753e483679703c902a0f574646d3653ad9eA", // AAVE/WETH v3 pool
  aaveAddress: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a",
  wethAddress: "0x4530fABea7444674a775aBb920924632c669466e",
  aggregator: "0xYourMockAggregatorV3",
});