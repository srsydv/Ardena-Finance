/**
 * Deploy Vault Contract with AAVE Asset
 * 
 * This script deploys a new Vault contract using:
 * - Asset: AAVE (0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a)
 * - Name: AaveUNI6040
 * - Symbol: AUNI
 * - Uses existing deployed contracts for other components
 */

import hre from "hardhat";
const { ethers, upgrades } = hre;
import dotenv from "dotenv";
dotenv.config();

// Contract addresses from DEPLOYEDCONTRACT.me
const EXISTING_CONTRACTS = {
  oracle: "0x6EE0A849079A5b63562a723367eAae77F3f5EB21",
  fees: "0x3873DaFa287f80792208c36AcCfC82370428b3DB", 
  access: "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2",
  exchanger: "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF",
  mathAdapter: "0x263b2a35787b3D9f8c2aca02ce2372E9f7CD438E",
  // New strategy addresses
  uniswapV3Strategy: "0x6B018844b6Edd87f7F6355643fEB5090Da02b209",
  aaveV3Strategy: "0xCc02bC41a7AF1A35af4935346cABC7335167EdC9"
};

// New configuration
const NEW_VAULT_CONFIG = {
  asset: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a", // AAVE
  name: "AaveUNI6040",
  symbol: "AUNI",
  cap: "100000000", // 100M AAVE (in smallest units)
  decimals: 18 // AAVE has 18 decimals (corrected from 6)
};

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🚀 DEPLOYING NEW VAULT WITH AAVE ASSET");
  console.log("=====================================");
  console.log("👤 Deployer:", await deployer.getAddress());
  console.log("🔗 Network:", (await ethers.provider.getNetwork()).name);
  console.log("");

  // Verify existing contracts are accessible
  console.log("📋 STEP 1: VERIFYING EXISTING CONTRACTS");
  console.log("----------------------------------------");
  
  const contracts = {};
  
  try {
    contracts.oracle = await ethers.getContractAt("OracleModule", EXISTING_CONTRACTS.oracle);
    contracts.fees = await ethers.getContractAt("FeeModule", EXISTING_CONTRACTS.fees);
    contracts.access = await ethers.getContractAt("AccessController", EXISTING_CONTRACTS.access);
    contracts.exchanger = await ethers.getContractAt("ExchangeHandler", EXISTING_CONTRACTS.exchanger);
    contracts.mathAdapter = await ethers.getContractAt("UniswapV3MathAdapter", EXISTING_CONTRACTS.mathAdapter);
    contracts.uniswapV3Strategy = await ethers.getContractAt("UniswapV3Strategy", EXISTING_CONTRACTS.uniswapV3Strategy);
    contracts.aaveV3Strategy = await ethers.getContractAt("AaveV3Strategy", EXISTING_CONTRACTS.aaveV3Strategy);
    
    console.log("✅ Oracle:", contracts.oracle.target);
    console.log("✅ Fees:", contracts.fees.target);
    console.log("✅ Access:", contracts.access.target);
    console.log("✅ Exchanger:", contracts.exchanger.target);
    console.log("✅ MathAdapter:", contracts.mathAdapter.target);
    console.log("✅ UniswapV3Strategy:", contracts.uniswapV3Strategy.target);
    console.log("✅ AaveV3Strategy:", contracts.aaveV3Strategy.target);
    
  } catch (error) {
    console.error("❌ Failed to verify existing contracts:", error.message);
    process.exit(1);
  }
  console.log("");

  // Verify AAVE asset
  console.log("📋 STEP 2: VERIFYING AAVE ASSET");
  console.log("--------------------------------");
  
  const ERC20_ABI = [
    "function name() external view returns (string)",
    "function symbol() external view returns (string)",
    "function decimals() external view returns (uint8)",
    "function balanceOf(address) external view returns (uint256)"
  ];
  
  try {
    const aaveAsset = new ethers.Contract(NEW_VAULT_CONFIG.asset, ERC20_ABI, deployer);
    const [name, symbol, decimals] = await Promise.all([
      aaveAsset.name().catch(() => "AAVE"),
      aaveAsset.symbol(),
      aaveAsset.decimals()
    ]);
    
    console.log("✅ Asset Address:", NEW_VAULT_CONFIG.asset);
    console.log("✅ Asset Name:", name);
    console.log("✅ Asset Symbol:", symbol);
    console.log("✅ Asset Decimals:", decimals.toString());
    
    if (decimals !== NEW_VAULT_CONFIG.decimals) {
      console.log("⚠️  Warning: Expected decimals", NEW_VAULT_CONFIG.decimals, "but got", decimals.toString());
    }
    
  } catch (error) {
    console.error("❌ Failed to verify AAVE asset:", error.message);
    process.exit(1);
  }
  console.log("");

  // Deploy new Vault
  console.log("📋 STEP 3: DEPLOYING NEW VAULT");
  console.log("------------------------------");
  
  let vault;
  try {
    const Vault = await ethers.getContractFactory("Vault");
    const vaultCap = ethers.parseUnits(NEW_VAULT_CONFIG.cap, NEW_VAULT_CONFIG.decimals);
    
    console.log("🔧 Vault Configuration:");
    console.log("   Asset:", NEW_VAULT_CONFIG.asset);
    console.log("   Name:", NEW_VAULT_CONFIG.name);
    console.log("   Symbol:", NEW_VAULT_CONFIG.symbol);
    console.log("   Cap:", NEW_VAULT_CONFIG.cap, "AAVE");
    console.log("   Cap (wei):", vaultCap.toString());
    console.log("   Decimals:", NEW_VAULT_CONFIG.decimals);
    console.log("");

    vault = await upgrades.deployProxy(
      Vault,
      [
        NEW_VAULT_CONFIG.asset,           // asset
        NEW_VAULT_CONFIG.name,            // name
        NEW_VAULT_CONFIG.symbol,          // symbol
        contracts.access.target,          // accessController
        contracts.fees.target,            // feeModule
        vaultCap,                         // cap
        NEW_VAULT_CONFIG.decimals         // decimals
      ],
      { kind: "uups", initializer: "initialize" }
    );
    
    await vault.waitForDeployment();
    console.log("✅ New Vault deployed:", vault.target);
    console.log("");
    
  } catch (error) {
    console.error("❌ Failed to deploy Vault:", error.message);
    process.exit(1);
  }

  // Configure strategies (optional - if you want to add them to this vault)
  console.log("📋 STEP 4: CONFIGURING STRATEGIES (OPTIONAL)");
  console.log("---------------------------------------------");
  
  try {
    const vault = await ethers.getContractAt("Vault", vault.target);
    
    // Check if deployer has manager role
    const isManager = await contracts.access.isManager(await deployer.getAddress());
    console.log("👤 Deployer is manager:", isManager);
    
    if (isManager) {
      console.log("🔧 Adding strategies to new vault...");
      
      // Add AaveV3Strategy with 60% allocation
      await (await vault.setStrategy(contracts.aaveV3Strategy.target, 6000)).wait();
      console.log("✅ Added AaveV3Strategy with 60% allocation");
      
      // Add UniswapV3Strategy with 40% allocation  
      await (await vault.setStrategy(contracts.uniswapV3Strategy.target, 4000)).wait();
      console.log("✅ Added UniswapV3Strategy with 40% allocation");
      
    } else {
      console.log("⚠️  Deployer is not a manager, skipping strategy configuration");
      console.log("💡 You can configure strategies later using the AccessController");
    }
    
  } catch (error) {
    console.error("❌ Failed to configure strategies:", error.message);
    console.log("💡 You can configure strategies manually later");
  }
  console.log("");

  // Final summary
  console.log("📋 DEPLOYMENT SUMMARY");
  console.log("====================");
  console.log("🎉 New Vault Successfully Deployed!");
  console.log("");
  console.log("📍 Contract Addresses:");
  console.log("   New Vault:", vault.target);
  console.log("");
  console.log("⚙️  Configuration:");
  console.log("   Asset:", NEW_VAULT_CONFIG.asset, "(AAVE)");
  console.log("   Name:", NEW_VAULT_CONFIG.name);
  console.log("   Symbol:", NEW_VAULT_CONFIG.symbol);
  console.log("   Cap:", NEW_VAULT_CONFIG.cap, "AAVE");
  console.log("");
  console.log("🔗 Connected to existing infrastructure:");
  console.log("   Oracle:", contracts.oracle.target);
  console.log("   Fees:", contracts.fees.target);
  console.log("   Access:", contracts.access.target);
  console.log("   Exchanger:", contracts.exchanger.target);
  console.log("   MathAdapter:", contracts.mathAdapter.target);
  console.log("");
  console.log("📝 Next Steps:");
  console.log("1. Update your .env file with the new vault address");
  console.log("2. Test the vault by depositing some AAVE");
  console.log("3. Verify strategies are working correctly");
  console.log("4. Update your UI to use the new vault address");
  console.log("");
  console.log("✅ Deployment completed successfully!");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exit(1);
});
