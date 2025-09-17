/*
  Hardhat deployment script for core contracts and strategies.

  Usage examples:
  - npx hardhat run deploy/Scripts.js
  - npx hardhat run deploy/Scripts.js --network arbitrum

  Optional env vars (dotenv supported):
  - WETH, ASSET, TREASURY, MANAGER, KEEPER
  - AAVE_POOL, UNISWAP_POSITION_MANAGER, UNISWAP_POOL
  - UNI_V3_ROUTER, SUSHI_ROUTER (to allowlist in ExchangeHandler)
  - DEPOSIT_CAP (asset units), VAULT_NAME, VAULT_SYMBOL, ASSET_DECIMALS
  - UNI_BPS, AAVE_BPS (target allocations; sum <= 10000)
  - ETH_USD_AGG, USDC_USD_AGG (Chainlink-like feeds for OracleModule)
  - ORACLE_HEARTBEAT (seconds)
*/

require("dotenv/config");
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function env(name, def) {
  return process.env[name] ?? def;
}

const DEFAULTS = {
  // Arbitrum One defaults
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  AAVE_POOL: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  UNISWAP_POSITION_MANAGER: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  UNISWAP_POOL: "0xC6962004f452bE9203591991D15f6b388e09E8D0", // USDC/WETH 0.05%
  UNI_V3_ROUTER: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  SUSHI_ROUTER: "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506",
};

// async function deployContracts() {
//   [deployer, user, treasury] = await ethers.getSigners();

//   // --- Impersonate whale ---
//   await network.provider.request({
//     method: "hardhat_impersonateAccount",
//     params: [USDC_WHALE],
//   });
//   const whale = await ethers.getSigner(USDC_WHALE);

//   // Give whale some ETH for gas
//   await network.provider.send("hardhat_setBalance", [
//     whale.address,
//     "0x1000000000000000000", // 1 ETH
//   ]);

//   // usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
//   usdc = await ethers.getContractAt(
//     "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
//     USDC_ADDRESS
//   );
//   // console.log("USDC contract at:", usdc.target); // ethers v6 uses .target instead of .address
//   // const code = await ethers.provider.getCode(USDC_ADDRESS);
//   // console.log("Deployed code at USDC:", code);

//   console.log(
//     "Whale USDC balance:",
//     (await usdc.balanceOf(whale.address)).toString()
//   );
//   // console.log("USDC:", usdc.target);
//   // console.log("Deployer:", deployer.address);
//   // console.log("treasury:", treasury.address);

//   // const v3pool = await ethers.getContractAt("IUniswapV3Pool", UNISWAP_POOL);
//   // console.log("pool token0", await v3pool.token0());
//   // console.log("pool token1", await v3pool.token1());
//   // console.log("pool fee", (await v3pool.fee()).toString());

//   // Transfer 10,000 USDC from whale to deployer
//   await usdc
//     .connect(whale)
//     .transfer(deployer.address, ethers.parseUnits("10000", 6));

//   // console.log(
//   //   "Deployer USDC balance:",
//   //   (await usdc.balanceOf(deployer.address)).toString()
//   // );

//   // const code = await ethers.provider.getCode(ETH_USD);
//   // console.log("Oracle code:", code !== "0x" ? "exists" : "empty!");

//   // const AAVE_POOL_code = await ethers.provider.getCode(AAVE_POOL);
//   // console.log(
//   //   "AAVE_POOL code:",
//   //   AAVE_POOL_code !== "0x" ? "exists" : "empty!"
//   // );

//   // const pool = new ethers.Contract(
//   //   AAVE_POOL,
//   //   [
//   //     "function getReserveData(address) view returns (\
//   //   uint256,uint128,uint128,uint128,uint128,uint128,uint40,uint16,\
//   //   address,address,address,address,uint128,uint128,uint128)",
//   //   ],
//   //   ethers.provider
//   // );

//   // const rd = await pool.getReserveData(USDC_ADDRESS);
//   // console.log("id:", rd[7]); // 12 on Arbitrum
//   // console.log("aToken:", rd[8]); // 0x625E77... (aUSDC)
//   // console.log("stableDebt:", rd[9]);
//   // console.log("variableDebt:", rd[10]);

//   // expect(await usdc.balanceOf(deployer.address)).to.equal(
//   //   ethers.parseUnits("10000", 6)
//   // );

//   const Oracle = await ethers.getContractFactory("OracleModule");
//   const oracle = await Oracle.deploy(WETH);

//   // ETH/USD (needed for any token that uses token/ETH composition)
//   await oracle.setEthUsd(ETH_USD, "864000");
//   // Direct USD feeds
//   await oracle.setTokenUsd(usdc.target, USDC_USD, "864000");

//   // (Optional) composition route example for a token without USD feed:
//   // await oracle.setTokenEthRoute(TOKEN, UNI_ETH, /*invert=*/false, heartbeat);

//   // --- Deploy FeeModule + AccessController ---
//   const FeeModule = await ethers.getContractFactory("FeeModule");
//   fees = await FeeModule.deploy(
//     usdc.target,
//     treasury.address,
//     deployer.address
//   );

//   // console.log("Fee:", fees.target);

//   const Access = await ethers.getContractFactory("AccessController");
//   access = await Access.deploy(deployer.address);

//   // console.log("Access:", access.target);

//   // --- Deploy Vault ---
//   const Vault = await ethers.getContractFactory("Vault");
//   vault = await Vault.deploy(
//     usdc.target,
//     "My Vault",
//     "MVLT",
//     access.target,
//     fees.target,
//     usdc.target, // oracle (set to zero for now)
//     ethers.parseUnits("1000000", 6), // deposit cap
//     6 // decimals
//   );

//   // console.log("Vault:", vault.target);
//   // --- Deploy Aave Strategy ---
//   const AaveV3Strategy = await ethers.getContractFactory("AaveV3Strategy");
//   aaveStrat = await AaveV3Strategy.deploy(
//     vault.target,
//     usdc.target,
//     AAVE_POOL
//   );

//   // console.log("aaveStrat:", aaveStrat.target);

//   // --- Deploy ExchangeHandler ---
//   const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
//   exchanger = await ExchangeHandler.deploy(deployer.address);
//   await exchanger.setRouter(SUSHI_ROUTER, true);

//   // console.log("exchanger:", exchanger.target);

//   // --- Deploy Uniswap Strategy ---
//   const UniswapV3Strategy = await ethers.getContractFactory(
//     "UniswapV3Strategy"
//   );
//   uniStrat = await UniswapV3Strategy.deploy(
//     vault.target,
//     usdc.target,
//     UNISWAP_POSITION_MANAGER,
//     UNISWAP_POOL,
//     exchanger.target, // dummy exchanger (not used in test)
//     oracle.target // dummy oracle
//   );

//   // console.log("uniStrat:", uniStrat.target);

//   // After deploying AccessController
//   await access.setManager(deployer.address, true);
//   await access.setKeeper(deployer.address, true);

//   // --- Add strategies (50/50) ---
//   await vault.setStrategy(aaveStrat.target, 5000);
//   await vault.setStrategy(uniStrat.target, 5000);

//   return {
//     deployer,
//     user,
//     treasury,
//     usdc,
//     vault,
//     fees,
//     access,
//     aaveStrat,
//     uniStrat,
//     exchanger,
//     mockRouter,
//   };
// }

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  const cfg = {
    WETH: env("WETH", DEFAULTS.WETH),
    ASSET: env("ASSET", DEFAULTS.USDC),
    AAVE_POOL: env("AAVE_POOL", DEFAULTS.AAVE_POOL),
    UNISWAP_POSITION_MANAGER: env(
      "UNISWAP_POSITION_MANAGER",
      DEFAULTS.UNISWAP_POSITION_MANAGER
    ),
    UNISWAP_POOL: env("UNISWAP_POOL", DEFAULTS.UNISWAP_POOL),
    UNI_V3_ROUTER: env("UNI_V3_ROUTER", DEFAULTS.UNI_V3_ROUTER),
    SUSHI_ROUTER: env("SUSHI_ROUTER", DEFAULTS.SUSHI_ROUTER),
    TREASURY: env("TREASURY", deployer.address),
    MANAGER: env("MANAGER", deployer.address),
    KEEPER: env("KEEPER", deployer.address),
    DEPOSIT_CAP: env("DEPOSIT_CAP", "100000000000000"), // default 1e14 (with 6 decimals -> 1e8 units) adjust as needed
    VAULT_NAME: env("VAULT_NAME", "My Vault"),
    VAULT_SYMBOL: env("VAULT_SYMBOL", "MVLT"),
    ASSET_DECIMALS: Number(env("ASSET_DECIMALS", "6")),
    UNI_BPS: Number(env("UNI_BPS", "10000")),
    AAVE_BPS: Number(env("AAVE_BPS", "0")),
    ETH_USD_AGG: env("ETH_USD_AGG"),
    USDC_USD_AGG: env("USDC_USD_AGG"),
    ORACLE_HEARTBEAT: env("ORACLE_HEARTBEAT", "864000"),
  };

  console.log(`\nNetwork: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);

  // Deploy OracleModule (needs WETH address)
  const Oracle = await ethers.getContractFactory("OracleModule");
  const oracle = await Oracle.deploy(cfg.WETH);
  await oracle.waitForDeployment();
  console.log("OracleModule:", oracle.target);

  // Optionally wire feeds if provided
  if (cfg.ETH_USD_AGG) {
    const tx = await oracle.setEthUsd(cfg.ETH_USD_AGG, cfg.ORACLE_HEARTBEAT);
    await tx.wait();
    console.log("- setEthUsd:", cfg.ETH_USD_AGG);
  }
  if (cfg.USDC_USD_AGG) {
    const tx = await oracle.setTokenUsd(
      cfg.ASSET,
      cfg.USDC_USD_AGG,
      cfg.ORACLE_HEARTBEAT
    );
    await tx.wait();
    console.log("- setTokenUsd(ASSET):", cfg.USDC_USD_AGG);
  }

  // Deploy FeeModule
  const FeeModule = await ethers.getContractFactory("FeeModule");
  const fees = await FeeModule.deploy(
    cfg.ASSET,
    cfg.TREASURY,
    deployer.address
  );
  await fees.waitForDeployment();
  console.log("FeeModule:", fees.target);

  // Deploy AccessController
  const Access = await ethers.getContractFactory("AccessController");
  const access = await Access.deploy(deployer.address);
  await access.waitForDeployment();
  console.log("AccessController:", access.target);

  // Deploy Vault
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(
    cfg.ASSET,
    cfg.VAULT_NAME,
    cfg.VAULT_SYMBOL,
    access.target,
    fees.target,
    oracle.target,
    cfg.DEPOSIT_CAP,
    cfg.ASSET_DECIMALS
  );
  await vault.waitForDeployment();
  console.log("Vault:", vault.target);

  // Deploy ExchangeHandler and allowlist routers
  const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
  const exchanger = await ExchangeHandler.deploy(deployer.address);
  await exchanger.waitForDeployment();
  console.log("ExchangeHandler:", exchanger.target);
  const routersToAllow = [cfg.UNI_V3_ROUTER, cfg.SUSHI_ROUTER].filter(Boolean);
  for (const r of routersToAllow) {
    const tx = await exchanger.setRouter(r, true);
    await tx.wait();
    console.log("- router allowed:", r);
  }

  // Deploy strategies
  const AaveV3Strategy = await ethers.getContractFactory("AaveV3Strategy");
  const aaveStrat = await AaveV3Strategy.deploy(
    vault.target,
    cfg.ASSET,
    cfg.AAVE_POOL
  );
  await aaveStrat.waitForDeployment();
  console.log("AaveV3Strategy:", aaveStrat.target);

  const UniswapV3Strategy = await ethers.getContractFactory(
    "UniswapV3Strategy"
  );
  const uniStrat = await UniswapV3Strategy.deploy(
    vault.target,
    cfg.ASSET,
    cfg.UNISWAP_POSITION_MANAGER,
    cfg.UNISWAP_POOL,
    exchanger.target,
    oracle.target
  );
  await uniStrat.waitForDeployment();
  console.log("UniswapV3Strategy:", uniStrat.target);

  // Roles
  await (await access.setManager(cfg.MANAGER, true)).wait();
  await (await access.setKeeper(cfg.KEEPER, true)).wait();
  console.log("Roles set: manager=", cfg.MANAGER, "keeper=", cfg.KEEPER);

  // Strategy targets
  if (cfg.AAVE_BPS > 0) {
    await (await vault.setStrategy(aaveStrat.target, cfg.AAVE_BPS)).wait();
    console.log("- setStrategy Aave:", cfg.AAVE_BPS, "bps");
  }
  if (cfg.UNI_BPS > 0) {
    await (await vault.setStrategy(uniStrat.target, cfg.UNI_BPS)).wait();
    console.log("- setStrategy UniV3:", cfg.UNI_BPS, "bps");
  }

  // Save addresses
  const out = {
    network: network.name,
    deployer: deployer.address,
    config: cfg,
    contracts: {
      OracleModule: oracle.target,
      FeeModule: fees.target,
      AccessController: access.target,
      Vault: vault.target,
      ExchangeHandler: exchanger.target,
      AaveV3Strategy: aaveStrat.target,
      UniswapV3Strategy: uniStrat.target,
    },
  };
  const outDir = path.join(__dirname, "addresses");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `addresses-${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log("Saved:", outFile);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
