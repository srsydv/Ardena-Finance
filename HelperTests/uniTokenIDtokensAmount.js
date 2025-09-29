import hre from "hardhat";

const { ethers } = hre;

// Strategy address from your deployment
const STRATEGY_ADDR = "0x65cDA0b70d3D09139c0a78059082F885714a0Fe7";

const STRATEGY_ABI = [
  "function tokenId() view returns (uint256)",
  "function pm() view returns (address)",
  "function pool() view returns (address)",
  "function math() view returns (address)",
];

const PM_ABI = [
  // nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128, tokensOwed0, tokensOwed1
  "function positions(uint256 tokenId) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
];

const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
];

const MATH_ABI = [
  "function getSqrtRatioAtTick(int24 tick) pure returns (uint160)",
  "function getAmountsForLiquidity(uint160 sqrtPriceX96, uint160 sqrtRatioAX96, uint160 sqrtRatioBX96, uint128 liquidity) pure returns (uint256 amount0, uint256 amount1)",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

function formatUnits(bn, decimals) {
  const d = Number(decimals);
  const value = BigInt(bn.toString());
  const base = 10n ** BigInt(d);
  const intPart = value / base;
  const frac = value % base;
  const fracStr = frac.toString().padStart(d, "0").replace(/0+$/, "");
  return fracStr.length ? `${intPart}.${fracStr}` : `${intPart}`;
}

async function main() {
  const provider = ethers.provider;
  const strategy = new ethers.Contract(STRATEGY_ADDR, STRATEGY_ABI, provider);

  const tokenId = await strategy.tokenId();
  if (tokenId === 0n) {
    console.log("NO_POS: tokenId == 0 (no position)");
    return;
  }

  const [pmAddr, poolAddr, mathAddr] = await Promise.all([
    strategy.pm(),
    strategy.pool(),
    strategy.math(),
  ]);

  const pm = new ethers.Contract(pmAddr, PM_ABI, provider);
  const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
  const math = new ethers.Contract(mathAddr, MATH_ABI, provider);

  const [slot, token0Addr, token1Addr] = await Promise.all([
    pool.slot0(),
    pool.token0(),
    pool.token1(),
  ]);
  const sqrtPriceX96 = slot[0];

  const pos = await pm.positions(tokenId);
  const tickLower = pos[5];
  const tickUpper = pos[6];
  const liquidity = pos[7];
  const tokensOwed0 = pos[10];
  const tokensOwed1 = pos[11];

  const [sqrtA, sqrtB] = await Promise.all([
    math.getSqrtRatioAtTick(tickLower),
    math.getSqrtRatioAtTick(tickUpper),
  ]);

  const [amt0, amt1] = await math.getAmountsForLiquidity(
    sqrtPriceX96,
    sqrtA,
    sqrtB,
    liquidity
  );

  const erc0 = new ethers.Contract(token0Addr, ERC20_ABI, provider);
  const erc1 = new ethers.Contract(token1Addr, ERC20_ABI, provider);
  const [sym0, sym1, dec0, dec1, idle0, idle1] = await Promise.all([
    erc0.symbol().catch(() => "T0"),
    erc1.symbol().catch(() => "T1"),
    erc0.decimals().catch(() => 18),
    erc1.decimals().catch(() => 18),
    erc0.balanceOf(STRATEGY_ADDR).catch(() => 0n),
    erc1.balanceOf(STRATEGY_ADDR).catch(() => 0n),
  ]);

  console.log("Strategy:", STRATEGY_ADDR);
  console.log("tokenId:", tokenId.toString());
  console.log("token0:", token0Addr, sym0);
  console.log("token1:", token1Addr, sym1);

  console.log("Position principal in-range:");
  console.log(`  ${sym0}:`, formatUnits(amt0, dec0));
  console.log(`  ${sym1}:`, formatUnits(amt1, dec1));

  console.log("Uncollected fees (tokensOwed):");
  console.log(`  ${sym0}:`, formatUnits(tokensOwed0, dec0));
  console.log(`  ${sym1}:`, formatUnits(tokensOwed1, dec1));

  console.log("Idle balances in strategy:");
  console.log(`  ${sym0}:`, formatUnits(idle0, dec0));
  console.log(`  ${sym1}:`, formatUnits(idle1, dec1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


