import dotenv from "dotenv";
import hre from "hardhat";

dotenv.config();

const { ethers, upgrades } = hre;

async function main() {
  console.log("=== Deploying OracleModule (UUPS) with new WETH ===");

  const DEFAULT_WETH = "0x4530fABea7444674a775aBb920924632c669466e"; // new WETH (force override)
  const DEFAULT_AAVE = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a"; // AAVE token
  const DEFAULT_ETH_USD_AGG = "0x497369979EfAD100F83c509a30F38dfF90d11585"; // from DEPLOYEDCONTRACT.me

  // Force using the requested WETH, ignore any stale env WETH
  const WETH = ethers.getAddress(DEFAULT_WETH);
  const AAVE = ethers.getAddress(process.env.WANT_AAVE || process.env.AAVE || DEFAULT_AAVE);
  const ETH_USD_AGG = ethers.getAddress(process.env.ETH_USD_AGG || DEFAULT_ETH_USD_AGG);
  const HEARTBEAT = Number(process.env.ORACLE_HEARTBEAT || 86400); // 24h

  // If you want a fixed ratio for AAVE per 1 ETH (8 decimals for Chainlink-style)
  // Example: 1 ETH = 10 AAVE -> 10 * 1e8 = 1000000000
  const AAVE_PER_ETH_8D = Number(process.env.AAVE_PER_ETH_8D || 1000000000);

  console.log("WETH:", WETH);
  console.log("AAVE:", AAVE);
  console.log("ETH/USD Agg:", ETH_USD_AGG);
  console.log("Heartbeat:", HEARTBEAT);
  console.log("AAVE per ETH (8d):", AAVE_PER_ETH_8D);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy proxy
  const Oracle = await ethers.getContractFactory("OracleModule");
  const oracle = await upgrades.deployProxy(Oracle, [WETH], {
    kind: "uups",
    initializer: "initialize",
  });
  await oracle.waitForDeployment();
  const oracleProxy = await oracle.getAddress();
  const impl = await upgrades.erc1967.getImplementationAddress(oracleProxy);
  console.log("OracleModule proxy:", oracleProxy);
  console.log("OracleModule impl:", impl);

  // Configure ETH/USD
  console.log("Setting ETH/USD feed...");
  const tx1 = await oracle.setEthUsd(ETH_USD_AGG, HEARTBEAT);
  console.log("  tx:", tx1.hash);
  await tx1.wait();

  // Proactively refresh ETH/USD mock aggregator timestamp and value to avoid staleness
  try {
    const ethUsdAgg = await ethers.getContractAt("MockAggregatorV3", ETH_USD_AGG);
    const dec = await ethUsdAgg.decimals();
    const ethUsdAnswer = BigInt(3000) * (10n ** BigInt(dec)); // 3000 USD
    const txRefresh = await ethUsdAgg.setAnswer(ethUsdAnswer);
    await txRefresh.wait();
    console.log("ETH/USD mock refreshed to:", 3000, "with", dec, "decimals");
  } catch (e) {
    console.log("(Info) ETH/USD aggregator not a mock or refresh failed:", e.message || e);
  }

  // Deploy AAVE/ETH mock aggregator (token per ETH, not inverted)
  console.log("Deploying MockAggregatorV3 for AAVE/ETH (token per ETH)...");
  const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
  const aaveEthAgg = await MockAgg.deploy(AAVE_PER_ETH_8D, 8);
  await aaveEthAgg.waitForDeployment();
  const aaveEthAggAddr = await aaveEthAgg.getAddress();
  console.log("AAVE/ETH MockAggregator:", aaveEthAggAddr);

  console.log("Setting AAVE token/ETH route (invert=false)...");
  const tx2 = await oracle.setTokenEthRoute(AAVE, aaveEthAggAddr, false, HEARTBEAT);
  console.log("  tx:", tx2.hash);
  await tx2.wait();

  // Smoke test prices
  console.log("Reading prices...");
  const wethUsd = await oracle.price(WETH);
  const aaveUsd = await oracle.price(AAVE);
  console.log("WETH (USD 1e18):", ethers.formatUnits(wethUsd, 18));
  console.log("AAVE (USD 1e18):", ethers.formatUnits(aaveUsd, 18));
  const ratio = Number(ethers.formatUnits(wethUsd, 18)) / Number(ethers.formatUnits(aaveUsd, 18));
  console.log("Implied 1 WETH =", ratio.toFixed(6), "AAVE");

  console.log("=== Done ===");
  console.log(JSON.stringify({
    oracleProxy,
    implementation: impl,
    weth: WETH,
    aave: AAVE,
    ethUsdAgg: ETH_USD_AGG,
    aaveEthAgg: aaveEthAggAddr,
  }, null, 2));
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});


