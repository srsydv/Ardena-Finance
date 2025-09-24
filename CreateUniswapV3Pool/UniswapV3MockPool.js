/*
  Uniswap V3 pool creator for Ethereum Sepolia: WETH <-> AAVE (Circle testnet)

  How to use:
  1) Get Sepolia AAVE (testnet) from Circle Faucet (10 AAVE/hr):
     https://faucet.circle.com/
  2) Ensure you have Sepolia ETH for gas; wrap to WETH if you plan to seed liquidity.
  3) Set env vars (dotenv supported) and run:
     WETH=0xYourWETH AAVE=0xYourAAVE INIT_AAVE_PER_WETH=100 SEED_AAVE=5000000 SEED_WETH_WEI=50000000000000000 \
       npx hardhat run deploy/UniswapV3MockPool.js --network sepolia

  Env vars:
  - WETH: address of WETH9 on Sepolia (required)
  - AAVE: address of Circle testnet AAVE on Sepolia (required)
  - FEE: 500|3000|10000 (default 500)
  - INIT_AAVE_PER_WETH: initial human price (default 100)
  - SEED_AAVE: amount in AAVE smallest units to seed (optional, e.g., 5000000 for 5 AAVE)
  - SEED_WETH_WEI: amount in wei to seed (optional, e.g., 50000000000000000 for 0.05 WETH)
  - WRAP_ETH_WEI: if set >0, wraps that much ETH into WETH9 before seeding

  Notes:
  - Uniswap V3 addresses are canonical across many networks and work on Sepolia:
    Factory:      0x1F98431c8aD98523631AE4a59f267346ea31F984
    PositionMgr:  0xC36442b4a4522E871399CD717aBDD847Ab11FE88
    SwapRouter:   0xE592427A0AEce92De3Edee1F18E0157C05861564
*/

import dotenv from "dotenv";
dotenv.config();
import hre from "hardhat";
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
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
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
  "function mint(address to, uint256 amount) returns (bool)",
  "function owner() view returns (address)",
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

  const WETH = "0x4530fABea7444674a775aBb920924632c669466e"; // NEW WETH address
  const AAVE = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a"
  if (!WETH || !AAVE) {
    throw new Error(
      "Please set WETH and AAVE env vars to Sepolia token addresses."
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
  const INIT_AAVE_PER_WETH = 10; // 1 WETH = 10 AAVE
  const SEED_AAVE = envBigInt("SEED_AAVE", "50000000000000000000"); // 50 AAVE (18 decimals)
  const SEED_WETH_WEI = envBigInt("SEED_WETH_WEI", "5000000000000000000"); // 5 WETH (18 decimals)
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
    WETH.toLowerCase() < AAVE.toLowerCase() ? [WETH, AAVE] : [AAVE, WETH];

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
  const aavePerWeth = BigInt(INIT_AAVE_PER_WETH);
  let amount0; // for token0
  let amount1; // for token1
  if (t0.toLowerCase() === AAVE.toLowerCase()) {
    // token0=AAVE(18), token1=WETH(18): 1 WETH = P AAVE → amount0= P AAVE, amount1= 1 WETH
    amount0 = aavePerWeth * 10n ** 18n;
    amount1 = 1n * 10n ** 18n;
  } else {
    // token0=WETH(18), token1=AAVE(18): 1 WETH = P AAVE → amount0= 1 WETH, amount1= P AAVE
    amount0 = 1n * 10n ** 18n;
    amount1 = aavePerWeth * 10n ** 18n;
  }

  const sqrtPriceX96 = encodeSqrtPriceX96ByAmounts(amount1, amount0);

  // create & initialize
  console.log("\n=== POOL CONFIGURATION ===");
  console.log("WETH Address:", WETH);
  console.log("AAVE Address:", AAVE);
  console.log("Target Price: 1 WETH =", INIT_AAVE_PER_WETH, "AAVE");
  console.log("Seed Liquidity: 5 WETH + 50 AAVE");
  console.log("Fee Tier:", FEE, "(0.05%)");
  
  // Check and mint tokens if needed
  console.log("\n=== CHECKING TOKEN BALANCES ===");
  const [wethContract, aaveContract] = await Promise.all([
    ethers.getContractAt(ERC20_META, WETH),
    ethers.getContractAt(ERC20_META, AAVE)
  ]);
  
  const [wethBalance, aaveBalance] = await Promise.all([
    wethContract.balanceOf(deployer.address),
    aaveContract.balanceOf(deployer.address)
  ]);
  
  const requiredWETH = ethers.parseUnits("5", 18); // 5 WETH
  const requiredAAVE = ethers.parseUnits("50", 18); // 50 AAVE
  
  console.log("Current WETH Balance:", ethers.formatUnits(wethBalance, 18));
  console.log("Current AAVE Balance:", ethers.formatUnits(aaveBalance, 18));
  console.log("Required WETH:", ethers.formatUnits(requiredWETH, 18));
  console.log("Required AAVE:", ethers.formatUnits(requiredAAVE, 18));
  
  // Mint WETH if needed
  if (wethBalance < requiredWETH) {
    const mintAmount = requiredWETH + ethers.parseUnits("5", 18); // Mint extra for gas
    console.log("\n=== MINTING WETH TOKENS ===");
    console.log("Minting", ethers.formatUnits(mintAmount, 18), "WETH...");
    
    try {
      const mintTx = await wethContract.mint(deployer.address, mintAmount);
      await mintTx.wait();
      console.log("✅ WETH tokens minted successfully!");
    } catch (error) {
      console.error("❌ Failed to mint WETH:", error.message);
      throw error;
    }
  } else {
    console.log("✅ Sufficient WETH balance");
  }
  
  // Mint AAVE if needed
  if (aaveBalance < requiredAAVE) {
    const mintAmount = requiredAAVE + ethers.parseUnits("10", 18); // Mint extra for gas
    console.log("\n=== MINTING AAVE TOKENS ===");
    console.log("Minting", ethers.formatUnits(mintAmount, 18), "AAVE...");
    
    try {
      const mintTx = await aaveContract.mint(deployer.address, mintAmount);
      await mintTx.wait();
      console.log("✅ AAVE tokens minted successfully!");
    } catch (error) {
      console.error("❌ Failed to mint AAVE:", error.message);
      throw error;
    }
  } else {
    console.log("✅ Sufficient AAVE balance");
  }
  
  console.log("\nCreating and initializing pool...");
  const tx = await pm.createAndInitializePoolIfNecessary(
    t0,
    t1,
    FEE,
    sqrtPriceX96
  );
  console.log("Transaction sent:", tx.hash);
  console.log("Waiting for confirmation...");
  const rc = await tx.wait();
  console.log("Transaction confirmed!");
  const poolAddr = await factory.getPool(t0, t1, FEE);
  console.log("Pool:", poolAddr);
  console.log(
    `Initialized ${sym0}/${sym1} fee=${FEE} sqrtPriceX96=${sqrtPriceX96.toString()}`
  );

  // Optional: seed minimal liquidity
  if (SEED_AAVE !== undefined || SEED_WETH_WEI !== undefined) {
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
      ethers.getContractAt(ERC20_META, AAVE),
    ]);
    if (SEED_WETH_WEI)
      await (await cW.approve(NFP_MANAGER, SEED_WETH_WEI)).wait();
    if (SEED_AAVE) await (await cU.approve(NFP_MANAGER, SEED_AAVE)).wait();

    // map desired amounts to amount0/1 for mint params
    const amount0Desired =
      t0.toLowerCase() === AAVE.toLowerCase()
        ? SEED_AAVE ?? 0n
        : SEED_WETH_WEI ?? 0n;
    const amount1Desired =
      t1.toLowerCase() === AAVE.toLowerCase()
        ? SEED_AAVE ?? 0n
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

  console.log("\n=== SUCCESS ===");
  console.log("✅ Pool created with price: 1 WETH =", INIT_AAVE_PER_WETH, "AAVE");
  console.log("✅ Liquidity added: 5 WETH + 50 AAVE");
  console.log("\nUse this pool address in UniswapV3Strategy constructor:");
  console.log("  positionManager:", NFP_MANAGER);
  console.log("  pool:", poolAddr);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
