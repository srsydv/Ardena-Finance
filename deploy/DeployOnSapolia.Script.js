/*
  Sepolia deployment script for UUPS-upgradeable protocol.

  What this script does:
  - Validates required env vars (WANT, WETH, PK in hardhat.config.js account)
  - Deploys UUPS proxies for: OracleModule, FeeModule, AccessController, Vault, ExchangeHandler
  - Deploys UniswapV3MathAdapter (non-upgradeable)
  - Ensures a Uniswap v3 pool exists for WANT/WETH at the selected fee tier (creates+initializes if needed)
  - Deploys UniswapV3Strategy and adds it to the Vault with the desired allocation
  - Optionally deploys AaveV3Strategy if AAVE_POOL is provided
  - Configures AccessController roles and ExchangeHandler router whitelist
  - Optionally configures Oracle feeds (ETH/USD and token/USD) if provided
  - Prints a compact JSON summary of deployed addresses

  Usage:
    npx hardhat run --network sepolia deploy/Scripts.js

  Required env:
    - WANT                  ERC20 address used as Vault asset (e.g., USDC on Sepolia)
    - WETH                  WETH address on Sepolia

  Optional env:
    - TREASURY              Treasury address for FeeModule (defaults to deployer)
    - VAULT_NAME            Defaults to "My Vault"
    - VAULT_SYMBOL          Defaults to "MVLT"
    - VAULT_CAP             Human-readable cap in WANT units, defaults to 100000000 (1e8)
    - STRAT_ALLOC_BPS       Allocation bps for Uniswap strategy in Vault, defaults to 10000
    - AAVE_POOL             Aave v3 Pool address; if set, deploy AaveV3Strategy
    - UNISWAP_FACTORY       Defaults to 0x1F98431c8aD98523631AE4a59f267346ea31F984
    - UNISWAP_POSITION_MANAGER Defaults to 0xC36442b4a4522E871399CD717aBDD847Ab11FE88
    - UNISWAP_V3_ROUTER     Defaults to 0xE592427A0AEce92De3Edee1F18E0157C05861564
    - UNISWAP_FEE           Defaults to 500 (0.05%)
    - INIT_PRICE_USDC_PER_WETH Defaults to 4000 (only used to initialize pool if missing)
    - ORACLE_ETH_USD_AGG    Chainlink ETH/USD feed (optional)
    - ORACLE_TOKEN_USD_AGG  Chainlink WANT/USD feed (optional)
    - INDEX_COOLDOWN        IndexSwap cooldown seconds (optional, default 3600)
*/

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { ethers, upgrades } = require("hardhat");

// Uniswap ABIs
const {
  abi: IUniswapV3FactoryABI,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
const {
  abi: INonfungiblePositionManagerABI,
} = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");

// Minimal metadata interface to fetch decimals
const ERC20_META = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env ${name}`);
  }
  return v.trim();
}

function optionalEnv(name, def) {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : def;
}

// BigInt integer sqrt (Newton method)
function sqrtBigInt(n) {
  if (n <= 1n) return n;
  let x0 = n;
  let x1 = (n >> 1n) + 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x1 + n / x1) >> 1n;
  }
  return x0;
}

// encode sqrt(price) * 2^96 from token1/token0 amounts (in smallest units)
function encodeSqrtPriceX96ByAmounts(amount1, amount0) {
  const ratio = (amount1 << 192n) / amount0; // (amount1/amount0) * 2^192
  return sqrtBigInt(ratio);
}

async function ensureUniswapPool({
  want,
  weth,
  factoryAddr,
  pmAddr,
  fee,
  initPriceUSDCperWETH,
}) {
  const factory = await ethers.getContractAt(IUniswapV3FactoryABI, factoryAddr);
  let poolAddress = await factory.getPool(want, weth, fee);
  if (poolAddress !== ethers.ZeroAddress) {
    return poolAddress;
  }

  const [t0, t1] = want.toLowerCase() < weth.toLowerCase() ? [want, weth] : [weth, want];

  // Fetch decimals
  const t0c = await ethers.getContractAt(ERC20_META, t0);
  const t1c = await ethers.getContractAt(ERC20_META, t1);
  const [dec0, dec1] = await Promise.all([t0c.decimals(), t1c.decimals()]);

  // Build reasonable initial price. Target: 1 WETH = P USDC (P = initPriceUSDCperWETH)
  const P = BigInt(Math.floor(Number(initPriceUSDCperWETH)));
  let amount0, amount1; // in smallest units
  if (t0.toLowerCase() === want.toLowerCase()) {
    // token0 = USDC, token1 = WETH
    amount0 = BigInt(ethers.parseUnits(P.toString(), dec0).toString());
    amount1 = BigInt(ethers.parseUnits("1", dec1).toString());
  } else {
    // token0 = WETH, token1 = USDC
    amount0 = BigInt(ethers.parseUnits("1", dec0).toString());
    amount1 = BigInt(ethers.parseUnits(P.toString(), dec1).toString());
  }

  const sqrtPriceX96 = encodeSqrtPriceX96ByAmounts(amount1, amount0).toString();

  const pm = await ethers.getContractAt(INonfungiblePositionManagerABI, pmAddr);
  const tx = await pm.createAndInitializePoolIfNecessary(t0, t1, fee, sqrtPriceX96);
  await tx.wait();

  poolAddress = await factory.getPool(want, weth, fee);
  if (poolAddress === ethers.ZeroAddress) {
    throw new Error("Failed to create Uniswap v3 pool");
  }
  return poolAddress;
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 11155111n) {
    console.warn(`Warning: expected Sepolia (11155111), current chainId=${chainId}`);
  }

  const WANT = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
  const WETH = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";

  const TREASURY = "0x69a4Bdf914f4d71FB207eaF571AF3eC85F5987E3";
  const VAULT_NAME = "AaveUNI6040";
  const VAULT_SYMBOL = "AUNI";
  const VAULT_CAP_HUMAN = "100000000";// 1e8 WANT units by default
  const AAVE_POOL = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";

  const UNISWAP_FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" // Sepolia
  const UNISWAP_PM = "0x1238536071E1c677A632429e3655c799b22cDA52" // Sepolia
  const UNISWAP_V3_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" // SwapRouter02 Sepolia
  const UNIVERSAL_ROUTER = "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b" // Sepolia
  const UNISWAP_FEE = 500;
  const INIT_PRICE_USDC_PER_WETH = 100;

  // const ORACLE_ETH_USD_AGG = optionalEnv("ORACLE_ETH_USD_AGG", "");
  // const ORACLE_TOKEN_USD_AGG = optionalEnv("ORACLE_TOKEN_USD_AGG", "");
  const INDEX_COOLDOWN = 60;

  // Query WANT metadata
  const wantMeta = await ethers.getContractAt(ERC20_META, WANT);
  const [wantSymbol, wantDecimals] = await Promise.all([
    wantMeta.symbol().catch(() => "WANT"),
    wantMeta.decimals(),
  ]);
  const vaultCap = ethers.parseUnits(VAULT_CAP_HUMAN, wantDecimals);

  // Deploy OracleModule (UUPS)
  const Oracle = await ethers.getContractFactory("OracleModule");
  const oracle = await upgrades.deployProxy(Oracle, [WETH], {
    kind: "uups",
    initializer: "initialize",
  });
  await oracle.waitForDeployment();

  console.log("Oracle:", oracle.target);

  // Deploy FeeModule (UUPS)
  const FeeModule = await ethers.getContractFactory("FeeModule");
  const fees = await upgrades.deployProxy(
    FeeModule,
    [WANT, TREASURY, deployer.address],
    { kind: "uups", initializer: "initialize" }
  );
  await fees.waitForDeployment();

  console.log("Fees:", fees.target);

  // Deploy AccessController (UUPS)
  const Access = await ethers.getContractFactory("AccessController");
  const access = await upgrades.deployProxy(Access, [deployer.address], {
    kind: "uups",
    initializer: "initialize",
  });
  await access.waitForDeployment();

  console.log("Access:", access.target);

  // Deploy Vault (UUPS)
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await upgrades.deployProxy(
    Vault,
    [WANT, VAULT_NAME, VAULT_SYMBOL, access.target, fees.target, vaultCap, wantDecimals],
    { kind: "uups", initializer: "initialize" }
  );
  await vault.waitForDeployment();

  console.log("Vault:", vault.target);

  // Deploy ExchangeHandler (UUPS)
  const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
  const exchanger = await upgrades.deployProxy(
    ExchangeHandler,
    [deployer.address],
    { kind: "uups", initializer: "initialize" }
  );
  await exchanger.waitForDeployment();

  console.log("Exchanger:", exchanger.target);

  // Allow Uniswap v3 router(s)
  await (await exchanger.setRouter(UNISWAP_V3_ROUTER, true)).wait();
  await (await exchanger.setRouter(UNIVERSAL_ROUTER, true)).wait();

  // Grant roles
  await (await access.setManager(deployer.address, true)).wait();
  await (await access.setKeeper(deployer.address, true)).wait();

  // Deploy UniswapV3MathAdapter (0.7.6, non-upgradeable)
  const MathAdapter = await ethers.getContractFactory("UniswapV3MathAdapter");
  const math = await MathAdapter.deploy();
  await math.waitForDeployment();
  console.log("MathAdapter:", math.target);

  // Ensure Uniswap v3 pool exists for WANT/WETH
  const poolAddress = await ensureUniswapPool({
    want: WANT,
    weth: WETH,
    factoryAddr: UNISWAP_FACTORY,
    pmAddr: UNISWAP_PM,
    fee: UNISWAP_FEE,
    initPriceUSDCperWETH: INIT_PRICE_USDC_PER_WETH,
  });
  console.log("PoolAddress:", poolAddress);

  // Deploy UniswapV3Strategy (UUPS)
  const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
  const uniStrat = await upgrades.deployProxy(
    UniswapV3Strategy,
    [vault.target, WANT, UNISWAP_PM, poolAddress, exchanger.target, oracle.target, math.target],
    { kind: "uups", initializer: "initialize" }
  );
  await uniStrat.waitForDeployment();
  console.log("UniswapV3Strategy:", uniStrat.target);
  // Optional: AaveV3Strategy
  let aaveStrat = null;
  if (AAVE_POOL) {
    const AaveV3Strategy = await ethers.getContractFactory("AaveV3Strategy");
    aaveStrat = await upgrades.deployProxy(
      AaveV3Strategy,
      [vault.target, WANT, AAVE_POOL],
      { kind: "uups", initializer: "initialize" }
    );
    await aaveStrat.waitForDeployment();
    console.log("AaveV3Strategy:", aaveStrat.target);
  }

  // Optional: IndexSwap
  const IndexSwap = await ethers.getContractFactory("IndexSwap");
  const indexSwap = await upgrades.deployProxy(
    IndexSwap,
    [vault.target, access.target, INDEX_COOLDOWN],
    { kind: "uups", initializer: "initialize" }
  );
  await indexSwap.waitForDeployment();
  console.log("IndexSwap:", indexSwap.target);

  // Vault strategy allocations
  if (aaveStrat) {
    await (await vault.setStrategy(aaveStrat.target, 6000)).wait();
    await (await vault.setStrategy(uniStrat.target, 4000)).wait();
    } else {
    await (await vault.setStrategy(uniStrat.target, 10000)).wait(); // 100% to Uniswap if no Aave
  }
  
  // Optional: Configure oracle feeds
  const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
      const ethUsdAgg = await MockAgg.deploy(0, 8);
  console.log("EthUsdAgg:", ethUsdAgg.target);
  // if (ORACLE_ETH_USD_AGG) {
    await (await oracle.setEthUsd(ethUsdAgg.target, "864000")).wait();
  // }
  // if (ORACLE_TOKEN_USD_AGG) {
  //   await (await oracle.setTokenUsd(WANT, ORACLE_TOKEN_USD_AGG, "864000")).wait();
  // }

  const out = {
    network: Number(chainId),
    deployer: deployer.address,
    tokens: { WANT, WETH, wantSymbol, wantDecimals },
    uniswap: {
      factory: UNISWAP_FACTORY,
      positionManager: UNISWAP_PM,
      router: UNISWAP_V3_ROUTER,
      fee: UNISWAP_FEE,
      // pool: poolAddress,
    },
    core: {
      // oracle: await oracle.getAddress(),
      // fees: await fees.getAddress(),
      // access: await access.getAddress(),
      // vault: await vault.getAddress(),
      // exchanger: await exchanger.getAddress(),
      // mathAdapter: await math.getAddress(),
      indexSwap: await indexSwap.getAddress(),
    },
    strategies: {
      // uniswapV3: uniStrat ? await uniStrat.getAddress() : null,
      // aaveV3: aaveStrat ? await aaveStrat.getAddress() : null,
    },
  };

  // Print structured JSON (user preference)
  console.log(JSON.stringify(out, null, 2));

  // Persist to deployments/{network}.json
  try {
    const dir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const networkName = chainId === 11155111n ? "sepolia" : `chain-${chainId}`;
    const file = path.join(dir, `${networkName}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`Deployment info saved to: ${file}`);
  } catch (e) {
    console.warn("Could not write deployments file:", e.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


