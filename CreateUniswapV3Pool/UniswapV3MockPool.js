/*
  Uniswap V3 pool creator for Ethereum Sepolia: WETH <-> USDC (Circle testnet)

  How to use:
  1) Get Sepolia USDC (testnet) from Circle Faucet (10 USDC/hr):
     https://faucet.circle.com/
  2) Ensure you have Sepolia ETH for gas; wrap to WETH if you plan to seed liquidity.
  3) Set env vars (dotenv supported) and run:
     WETH=0xYourWETH USDC=0xYourUSDC INIT_USDC_PER_WETH=100 SEED_USDC=5000000 SEED_WETH_WEI=50000000000000000 \
       npx hardhat run deploy/UniswapV3MockPool.js --network sepolia

  Env vars:
  - WETH: address of WETH9 on Sepolia (required)
  - USDC: address of Circle testnet USDC on Sepolia (required)
  - FEE: 500|3000|10000 (default 500)
  - INIT_USDC_PER_WETH: initial human price (default 100)
  - SEED_USDC: amount in USDC smallest units to seed (optional, e.g., 5000000 for 5 USDC)
  - SEED_WETH_WEI: amount in wei to seed (optional, e.g., 50000000000000000 for 0.05 WETH)
  - WRAP_ETH_WEI: if set >0, wraps that much ETH into WETH9 before seeding

  Notes:
  - Uniswap V3 addresses are canonical across many networks and work on Sepolia:
    Factory:      0x1F98431c8aD98523631AE4a59f267346ea31F984
    PositionMgr:  0xC36442b4a4522E871399CD717aBDD847Ab11FE88
    SwapRouter:   0xE592427A0AEce92De3Edee1F18E0157C05861564
*/

require("dotenv").config();
const hre = require("hardhat");
const { ethers } = hre;

// const UNIV3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const UNIV3_FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c";
// const NFP_MANAGER   = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const NFP_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
const IUniswapV3FactoryABI = [
  "function getPool(address,address,uint24) view returns (address)",
];

const INonfungiblePositionManagerABI = [
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) returns (address pool)",
  "function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
];

const IUniswapV3PoolABI = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function tickSpacing() view returns (int24)",
  "function fee() view returns (uint24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
];

const ERC20_META = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

const WETH9_ABI = [
  "function deposit() payable",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

function env(name, def) {
  const v = process.env[name];
  return v === undefined || v === "" ? def : v;
}

function envBigInt(name, def) {
  const v = env(name, def);
  if (v === undefined) return undefined;
  return BigInt(v);
}

// BigInt integer sqrt (Newton)
function sqrtBigInt(n) {
  if (n <= 1n) return n;
  let x0 = n,
    x1 = (n >> 1n) + 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x1 + n / x1) >> 1n;
  }
  return x0;
}

// sqrtPriceX96 from token1/token0 amounts (in smallest units)
function encodeSqrtPriceX96ByAmounts(amount1, amount0) {
  // sqrtPriceX96 = floor( sqrt((amount1 << 192) / amount0) )
  const ratio = (amount1 << 192n) / amount0;
  return sqrtBigInt(ratio);
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const WETH = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
  const USDC = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
  if (!WETH || !USDC) {
    throw new Error(
      "Please set WETH and USDC env vars to Sepolia token addresses."
    );
  }

  // Sanity check that Uniswap V3 is deployed at the provided addresses on this network
  const codeF = await ethers.provider.getCode(UNIV3_FACTORY);
  const codePM = await ethers.provider.getCode(NFP_MANAGER);
  if (codeF === "0x")
    throw new Error(
      `UniswapV3Factory not deployed on this network: ${UNIV3_FACTORY}`
    );
  if (codePM === "0x")
    throw new Error(
      `NonfungiblePositionManager not deployed on this network: ${NFP_MANAGER}`
    );

  const FEE = 500; // 500=0.05%, 3000=0.3%, 10000=1%
  const INIT_USDC_PER_WETH = 2; // human price
  const SEED_USDC = envBigInt("SEED_USDC", undefined); // in 10^6
  const SEED_WETH_WEI = envBigInt("SEED_WETH_WEI", undefined); // in wei
  const WRAP_ETH_WEI = envBigInt("WRAP_ETH_WEI", "0");

  const factory = await ethers.getContractAt(
    IUniswapV3FactoryABI,
    UNIV3_FACTORY
  );
  const pm = await ethers.getContractAt(
    INonfungiblePositionManagerABI,
    NFP_MANAGER
  );

  // sort tokens for Uniswap (token0 < token1)
  const [t0, t1] =
    WETH.toLowerCase() < USDC.toLowerCase() ? [WETH, USDC] : [USDC, WETH];

  // read decimals
  const [t0c, t1c] = await Promise.all([
    ethers.getContractAt(ERC20_META, t0),
    ethers.getContractAt(ERC20_META, t1),
  ]);
  const [sym0, sym1, dec0, dec1] = await Promise.all([
    t0c.symbol(),
    t1c.symbol(),
    t0c.decimals(),
    t1c.decimals(),
  ]);

  // initial price amounts in smallest units matching token order
  const usdcPerWeth = BigInt(INIT_USDC_PER_WETH);
  let amount0; // for token0
  let amount1; // for token1
  if (t0.toLowerCase() === USDC.toLowerCase()) {
    // token0=USDC(6), token1=WETH(18): 1 WETH = P USDC → amount0= P USDC, amount1= 1 WETH
    amount0 = usdcPerWeth * 10n ** 6n;
    amount1 = 1n * 10n ** 18n;
  } else {
    // token0=WETH(18), token1=USDC(6)
    amount0 = 1n * 10n ** 18n;
    amount1 = usdcPerWeth * 10n ** 6n;
  }

  const sqrtPriceX96 = encodeSqrtPriceX96ByAmounts(amount1, amount0);

  // create & initialize
  const tx = await pm.createAndInitializePoolIfNecessary(
    t0,
    t1,
    FEE,
    sqrtPriceX96
  );
  const rc = await tx.wait();
  const poolAddr = await factory.getPool(t0, t1, FEE);
  console.log("Pool:", poolAddr);
  console.log(
    `Initialized ${sym0}/${sym1} fee=${FEE} sqrtPriceX96=${sqrtPriceX96.toString()}`
  );

  // Optional: seed minimal liquidity
  if (SEED_USDC !== undefined || SEED_WETH_WEI !== undefined) {
    const pool = await ethers.getContractAt(IUniswapV3PoolABI, poolAddr);
    const spacing = Number(await pool.tickSpacing());
    const s0 = await pool.slot0();
    const tick = Number(s0.tick);
    const nearest = Math.floor(tick / spacing) * spacing;
    const k = 10; // ±10 spacings (~±1% for 500)
    const lower = nearest - k * spacing;
    const upper = nearest + k * spacing;

    // wrap ETH to WETH if requested
    if (WRAP_ETH_WEI && WRAP_ETH_WEI > 0n) {
      const weth = await ethers.getContractAt(WETH9_ABI, WETH);
      await (await weth.deposit({ value: WRAP_ETH_WEI })).wait();
      console.log("Wrapped ETH → WETH:", WRAP_ETH_WEI.toString());
    }

    // approvals
    const [cW, cU] = await Promise.all([
      ethers.getContractAt(ERC20_META, WETH),
      ethers.getContractAt(ERC20_META, USDC),
    ]);
    if (SEED_WETH_WEI)
      await (await cW.approve(NFP_MANAGER, SEED_WETH_WEI)).wait();
    if (SEED_USDC) await (await cU.approve(NFP_MANAGER, SEED_USDC)).wait();

    // map desired amounts to amount0/1 for mint params
    const amount0Desired =
      t0.toLowerCase() === USDC.toLowerCase()
        ? SEED_USDC ?? 0n
        : SEED_WETH_WEI ?? 0n;
    const amount1Desired =
      t1.toLowerCase() === USDC.toLowerCase()
        ? SEED_USDC ?? 0n
        : SEED_WETH_WEI ?? 0n;

    const deadline =
      (await ethers.provider.getBlock("latest")).timestamp + 1800;
    const mintArgs = {
      token0: t0,
      token1: t1,
      fee: FEE,
      tickLower: lower,
      tickUpper: upper,
      amount0Desired,
      amount1Desired,
      amount0Min: 0,
      amount1Min: 0,
      recipient: deployer.address,
      deadline,
    };
    const m = await pm.mint(mintArgs);
    const mr = await m.wait();
    // decode return via interface if needed; quick print pool state:
    console.log("Seeded liquidity. lower=", lower, "upper=", upper);
    console.log("Pool L:", (await pool.liquidity()).toString());
  }

  console.log("\nUse this pool address in UniswapV3Strategy constructor:");
  console.log("  positionManager:", NFP_MANAGER);
  console.log("  pool:", poolAddr);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
