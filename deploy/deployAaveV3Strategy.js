import dotenv from "dotenv";
dotenv.config();
import hre from "hardhat";

const { ethers, upgrades } = hre;

async function main() {
  console.log("=== Deploying AaveV3Strategy (UUPS) - deploy only ===");

  const VAULT = "0x3cd0145707C03316B48f8A254c494600c30ebf8d";
  const AAVE = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a";
  const AAVE_POOL = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951"; // from UI config

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Vault:", VAULT);
  console.log("Want (AAVE):", AAVE);
  console.log("AaveV3 Pool:", AAVE_POOL);

  const Strategy = await ethers.getContractFactory("AaveV3Strategy");
  const strat = await upgrades.deployProxy(Strategy, [VAULT, AAVE, AAVE_POOL], {
    kind: "uups",
    initializer: "initialize",
  });
  await strat.waitForDeployment();
  const proxy = await strat.getAddress();
  const impl = await upgrades.erc1967.getImplementationAddress(proxy);

  console.log("✅ AaveV3Strategy proxy:", proxy);
  console.log("Implementation:", impl);

  // Quick smoke check
  console.log("want():", await strat.want());
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});


