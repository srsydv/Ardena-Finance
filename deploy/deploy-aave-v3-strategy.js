/**
 * Deploy AaveV3Strategy for New AAVE Vault
 * 
 * This script deploys a new AaveV3Strategy contract for the AAVE vault:
 * - Vault: 0x3cd0145707C03316B48f8A254c494600c30ebf8d (AAVE Vault)
 * - Asset: AAVE (0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a)
 * - Aave Pool: 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951 (Sepolia)
 */

import hre from "hardhat";
const { ethers, upgrades } = hre;
import dotenv from "dotenv";
dotenv.config();

// Contract addresses
const CONTRACTS = {
  // New AAVE Vault
  vault: "0x3cd0145707C03316B48f8A254c494600c30ebf8d",
  // AAVE Token
  aaveToken: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a",
  // Aave V3 Pool (Sepolia)
  aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
  // Access Controller
  accessController: "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2"
};

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🚀 DEPLOYING NEW AAVEV3STRATEGY FOR AAVE VAULT");
  console.log("==============================================");
  console.log("👤 Deployer:", await deployer.getAddress());
  console.log("🔗 Network:", (await ethers.provider.getNetwork()).name);
  console.log("");

  // Verify existing contracts are accessible
  console.log("📋 STEP 1: VERIFYING EXISTING CONTRACTS");
  console.log("----------------------------------------");
  
  let contracts = {};
  
  // Define ABIs
  const ERC20_ABI = [
    "function name() external view returns (string)",
    "function symbol() external view returns (string)",
    "function decimals() external view returns (uint8)",
    "function balanceOf(address) external view returns (uint256)"
  ];
  
  const AAVE_POOL_ABI = [
    "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
    "function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))"
  ];
  
  try {
    contracts.vault = await ethers.getContractAt("Vault", CONTRACTS.vault);
    contracts.aaveToken = new ethers.Contract(CONTRACTS.aaveToken, ERC20_ABI, deployer);
    contracts.aavePool = new ethers.Contract(CONTRACTS.aavePool, AAVE_POOL_ABI, deployer);
    contracts.accessController = await ethers.getContractAt("AccessController", CONTRACTS.accessController);
    
    console.log("✅ Vault:", contracts.vault.target);
    console.log("✅ AAVE Token:", contracts.aaveToken.target);
    console.log("✅ Aave Pool:", contracts.aavePool.target);
    console.log("✅ Access Controller:", contracts.accessController.target);
    
  } catch (error) {
    console.error("❌ Failed to verify existing contracts:", error.message);
    process.exit(1);
  }
  console.log("");

  // Verify AAVE token details
  console.log("📋 STEP 2: VERIFYING AAVE TOKEN");
  console.log("-------------------------------");
  
  try {
    const [name, symbol, decimals] = await Promise.all([
      contracts.aaveToken.name(),
      contracts.aaveToken.symbol(),
      contracts.aaveToken.decimals()
    ]);
    
    console.log("✅ AAVE Name:", name);
    console.log("✅ AAVE Symbol:", symbol);
    console.log("✅ AAVE Decimals:", decimals.toString());
    
  } catch (error) {
    console.error("❌ Failed to verify AAVE token:", error.message);
    process.exit(1);
  }
  console.log("");

  // Check current vault state
  console.log("📋 STEP 3: CHECKING VAULT STATE");
  console.log("-------------------------------");
  
  try {
    const [vaultName, vaultSymbol, vaultAsset, strategiesLength] = await Promise.all([
      contracts.vault.name(),
      contracts.vault.symbol(),
      contracts.vault.asset(),
      contracts.vault.strategiesLength()
    ]);
    
    console.log("✅ Vault Name:", vaultName);
    console.log("✅ Vault Symbol:", vaultSymbol);
    console.log("✅ Vault Asset:", vaultAsset);
    console.log("✅ Current Strategies:", strategiesLength.toString());
    
    // List existing strategies
    for (let i = 0; i < strategiesLength; i++) {
      const strategyAddress = await contracts.vault.strategies(i);
      const bps = await contracts.vault.targetBps(strategyAddress);
      console.log(`   Strategy ${i}: ${strategyAddress} (${bps.toString()} bps)`);
    }
    
  } catch (error) {
    console.error("❌ Failed to check vault state:", error.message);
    process.exit(1);
  }
  console.log("");

  // Deploy new AaveV3Strategy
  console.log("📋 STEP 4: DEPLOYING NEW AAVEV3STRATEGY");
  console.log("---------------------------------------");
  
  let newStrategy;
  
  try {
    const AaveV3Strategy = await ethers.getContractFactory("AaveV3Strategy");
    
    console.log("🔧 Strategy Configuration:");
    console.log("   Vault:", CONTRACTS.vault);
    console.log("   AAVE Token:", CONTRACTS.aaveToken);
    console.log("   Aave Pool:", CONTRACTS.aavePool);
    console.log("");

    newStrategy = await upgrades.deployProxy(
      AaveV3Strategy,
      [
        CONTRACTS.vault,      // vault
        CONTRACTS.aaveToken,  // want (AAVE token)
        CONTRACTS.aavePool    // aavePool
      ],
      { kind: "uups", initializer: "initialize" }
    );
    
    await newStrategy.waitForDeployment();
    console.log("✅ New AaveV3Strategy deployed:", newStrategy.target);
    
    // Verify deployment
    try {
      const [vault, want] = await Promise.all([
        newStrategy.vault(),
        newStrategy.want()
      ]);
      
      console.log("✅ Strategy verification:");
      console.log("   Vault:", vault);
      console.log("   Want token:", want);
      
      // Try to get aavePool if the function exists
      try {
        const aavePool = await newStrategy.aavePool();
        console.log("   Aave pool:", aavePool);
      } catch (e) {
        console.log("   Aave pool: Function not available or different name");
      }
      
    } catch (error) {
      console.log("⚠️  Some verification functions not available:", error.message);
    }
    
  } catch (error) {
    console.error("❌ Failed to deploy AaveV3Strategy:", error.message);
    process.exit(1);
  }
  console.log("");

  // Configure strategy in vault (optional)
  console.log("📋 STEP 5: CONFIGURING STRATEGY IN VAULT");
  console.log("----------------------------------------");
  
  try {
    // Check if deployer has manager role
    const isManager = await contracts.accessController.isManager(await deployer.getAddress());
    console.log("👤 Deployer is manager:", isManager);
    
    if (isManager) {
      // Check current total allocation
      const totalAllocation = await contracts.vault.totalAllocation();
      console.log("📊 Current total allocation:", totalAllocation.toString(), "bps");
      
      // Calculate remaining allocation
      const remainingAllocation = 10000n - totalAllocation;
      console.log("📊 Remaining allocation:", remainingAllocation.toString(), "bps");
      
      if (remainingAllocation > 0n) {
        // Add strategy with remaining allocation (or 60% if there's enough space)
        const allocationToAdd = remainingAllocation >= 6000n ? 6000n : remainingAllocation;
        
        console.log("🔧 Adding strategy with allocation:", allocationToAdd.toString(), "bps");
        
        await (await contracts.vault.setStrategy(newStrategy.target, allocationToAdd)).wait();
        console.log("✅ Strategy added to vault with", allocationToAdd.toString(), "bps allocation");
        
        // Verify the update
        const updatedStrategiesLength = await contracts.vault.strategiesLength();
        console.log("📊 Updated strategies count:", updatedStrategiesLength.toString());
        
      } else {
        console.log("⚠️  Vault is at 100% allocation, cannot add new strategy");
        console.log("💡 You may need to remove an existing strategy first");
      }
      
    } else {
      console.log("⚠️  Deployer is not a manager, skipping strategy configuration");
      console.log("💡 You can configure the strategy manually later using the AccessController");
    }
    
  } catch (error) {
    console.error("❌ Failed to configure strategy:", error.message);
    console.log("💡 You can configure the strategy manually later");
  }
  console.log("");

  // Test the strategy
  console.log("📋 STEP 6: TESTING NEW STRATEGY");
  console.log("-------------------------------");
  
  try {
    const [vault, want] = await Promise.all([
      newStrategy.vault(),
      newStrategy.want()
    ]);
    
    console.log("✅ Strategy functions working:");
    console.log("   Vault:", vault);
    console.log("   Want token:", want);
    
    // Try to get additional functions if they exist
    try {
      const totalAssets = await newStrategy.totalAssets();
      console.log("   Total assets:", ethers.formatUnits(totalAssets, 18), "AAVE");
    } catch (e) {
      console.log("   Total assets: Function not available");
    }
    
    try {
      const balanceOfWant = await newStrategy.balanceOfWant();
      console.log("   Balance of want:", ethers.formatUnits(balanceOfWant, 18), "AAVE");
    } catch (e) {
      console.log("   Balance of want: Function not available");
    }
    
  } catch (error) {
    console.error("❌ Strategy test failed:", error.message);
    console.log("💡 Strategy deployed but some functions may have issues");
  }
  console.log("");

  // Final summary
  console.log("📋 DEPLOYMENT SUMMARY");
  console.log("====================");
  console.log("🎉 New AaveV3Strategy Successfully Deployed!");
  console.log("");
  console.log("📍 Contract Addresses:");
  console.log("   New AaveV3Strategy:", newStrategy.target);
  console.log("   Vault:", CONTRACTS.vault);
  console.log("   AAVE Token:", CONTRACTS.aaveToken);
  console.log("   Aave Pool:", CONTRACTS.aavePool);
  console.log("");
  console.log("⚙️  Configuration:");
  console.log("   Vault Asset: AAVE");
  console.log("   Strategy Type: AaveV3Strategy");
  console.log("   Protocol: Aave V3");
  console.log("");
  console.log("📝 Next Steps:");
  console.log("1. Test the strategy by depositing AAVE into the vault");
  console.log("2. Test investIdle() functionality");
  console.log("3. Verify AAVE deposits to Aave protocol work correctly");
  console.log("4. Update your UI to use the new strategy if needed");
  console.log("");
  console.log("📋 UPDATE DEPLOYEDCONTRACT.me:");
  console.log(`NewAAVEV3Strategy: ${newStrategy.target}`);
  console.log(`Vault: ${CONTRACTS.vault}`);
  console.log(`AAVE Token: ${CONTRACTS.aaveToken}`);
  console.log(`Aave Pool: ${CONTRACTS.aavePool}`);
  console.log("");
  console.log("✅ Deployment completed successfully!");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exit(1);
});
