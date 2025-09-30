import dotenv from "dotenv";
dotenv.config();
import hre from "hardhat";

const { ethers, upgrades } = hre;

async function main() {
  console.log("=== Deploying Vault (UUPS) - simple, no strategies ===");

  // Config
  const ASSET = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a"; // AAVE
  const ACCESS = "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2"; // AccessController
  const FEES = "0x3873DaFa287f80792208c36AcCfC82370428b3DB"; // FeeModule
  const NAME = "Shrish AAVE Vault";
  const SYMBOL = "sAAVE";
  const DECIMALS = 18; // AAVE decimals
  const DEPOSIT_CAP = ethers.parseUnits("1000000000", 18); // 1B AAVE cap

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Asset:", ASSET);
  console.log("Access:", ACCESS);
  console.log("Fees:", FEES);

  const Vault = await ethers.getContractFactory("Vault");
  const vault = await upgrades.deployProxy(
    Vault,
    [ASSET, NAME, SYMBOL, ACCESS, FEES, DEPOSIT_CAP, DECIMALS],
    { kind: "uups", initializer: "initialize" }
  );
  await vault.waitForDeployment();

  const proxy = await vault.getAddress();
  const impl = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log("✅ Vault proxy:", proxy);
  console.log("Implementation:", impl);

  // Sanity checks
  console.log("name():", await vault.name());
  console.log("symbol():", await vault.symbol());
  console.log("asset():", await vault.asset());
  console.log("decimals():", await vault.decimals());
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});


