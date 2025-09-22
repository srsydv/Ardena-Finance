/*
  Fixed upgrade script for UniswapV3Strategy contract on Sepolia.
  
  This script properly handles the upgrade authorization by checking the owner
  and providing clear guidance on how to proceed.
  
  Usage:
    npx hardhat run deploy/upgradeUniswapV3StrategyFixed.js --network sepolia
*/

require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== UPGRADING UNISWAPV3STRATEGY ON SEPOLIA ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Contract addresses from DEPLOYEDCONTRACT.me
    const UNI_STRATEGY_ADDRESS = "0xe7bA69Ffbc10Be7c5dA5776d768d5eF6a34Aa191";
    const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
    const ACCESS_CONTROLLER_ADDRESS = "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";
    
    console.log("\n=== STEP 1: CHECKING CURRENT STATE ===");
    
    try {
        const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
        const currentStrategy = UniswapV3Strategy.attach(UNI_STRATEGY_ADDRESS);
        
        // Get current implementation address
        const currentImpl = await upgrades.erc1967.getImplementationAddress(UNI_STRATEGY_ADDRESS);
        console.log("Current UniswapV3Strategy implementation:", currentImpl);
        
        // Check strategy configuration
        const vault = await currentStrategy.vault();
        const wantToken = await currentStrategy.wantToken();
        const tokenId = await currentStrategy.tokenId();
        const totalAssets = await currentStrategy.totalAssets();
        
        // Check owner
        const owner = await currentStrategy.owner();
        console.log("Strategy owner:", owner);
        console.log("Is deployer the owner?", owner.toLowerCase() === deployer.address.toLowerCase());
        
        // Check manager status
        const AccessController = await ethers.getContractFactory("AccessController");
        const accessController = AccessController.attach(ACCESS_CONTROLLER_ADDRESS);
        const isManager = await accessController.managers(deployer.address);
        console.log("Is deployer a manager?", isManager);
        
        console.log("Strategy configuration:");
        console.log("- Vault:", vault);
        console.log("- Want token:", wantToken);
        console.log("- Token ID:", tokenId.toString());
        console.log("- Total assets:", ethers.formatUnits(totalAssets, 6), "USDC");
        
    } catch (error) {
        console.error("❌ Failed to check current strategy state:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 2: ENSURING MANAGER ROLE ===");
    
    try {
        const AccessController = await ethers.getContractFactory("AccessController");
        const accessController = AccessController.attach(ACCESS_CONTROLLER_ADDRESS);
        
        const isManager = await accessController.managers(deployer.address);
        console.log("Is deployer a manager?", isManager);
        
        if (!isManager) {
            console.log("Setting manager role...");
            const setManagerTx = await accessController.setManager(deployer.address, true);
            await setManagerTx.wait();
            console.log("✅ Manager role set!");
            
            // Verify again
            const isManagerAfter = await accessController.managers(deployer.address);
            console.log("Is deployer a manager after setting?", isManagerAfter);
        }
        
    } catch (error) {
        console.error("❌ Failed to set manager role:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 3: ATTEMPTING UPGRADE ===");
    
    try {
        // Deploy new implementation
        console.log("Deploying new UniswapV3Strategy implementation...");
        const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
        const newStrategyImpl = await UniswapV3Strategy.deploy();
        await newStrategyImpl.waitForDeployment();
        console.log("New implementation deployed at:", newStrategyImpl.target);
        
        // Try to upgrade the proxy
        console.log("Attempting to upgrade proxy...");
        const upgradeTx = await upgrades.upgradeProxy(UNI_STRATEGY_ADDRESS, UniswapV3Strategy);
        await upgradeTx.waitForDeployment();
        
        // Verify the upgrade
        const newImpl = await upgrades.erc1967.getImplementationAddress(UNI_STRATEGY_ADDRESS);
        console.log("New UniswapV3Strategy implementation:", newImpl);
        console.log("✅ UniswapV3Strategy upgrade completed!");
        
    } catch (error) {
        console.error("❌ Upgrade failed:", error.message);
        
        if (error.message.includes("execution reverted")) {
            console.log("\n🔍 ANALYSIS:");
            console.log("The upgrade failed with 'execution reverted'. This could be because:");
            console.log("1. The old strategy still uses onlyOwner authorization");
            console.log("2. The deployer is not a manager in AccessController");
            console.log("3. The strategy doesn't have the updated AccessController-based authorization");
            
            console.log("\n💡 SOLUTIONS:");
            console.log("1. **Deploy a new strategy** (RECOMMENDED):");
            console.log("   - Deploy new UniswapV3Strategy with AccessController authorization");
            console.log("   - Use vault.deleteStrategy() to remove old strategy");
            console.log("   - Use vault.setStrategy() to add new strategy");
            console.log("   - This preserves all existing functionality");
            
            console.log("\n2. **Ensure manager role is set**:");
            console.log("   - Check if deployer is a manager in AccessController");
            console.log("   - Set manager role if needed: accessController.setManager(deployer.address, true)");
            
            console.log("\n📝 RECOMMENDED APPROACH:");
            console.log("Since you've updated the UniswapV3Strategy with AccessController authorization:");
            console.log("1. Deploy new UniswapV3Strategy with updated authorization");
            console.log("2. Remove old strategy from vault");
            console.log("3. Add new strategy to vault");
            console.log("4. Test investIdle functionality");
            
            console.log("\n🚀 NEXT STEPS:");
            console.log("Run: npx hardhat run deploy/deployNewUniswapV3StrategyFixed.js --network sepolia");
        }
        
        throw error;
    }
    
    console.log("\n=== STEP 4: VERIFICATION ===");
    
    try {
        const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
        const strategy = UniswapV3Strategy.attach(UNI_STRATEGY_ADDRESS);
        
        // Test that the strategy still works
        const vault = await strategy.vault();
        const wantToken = await strategy.wantToken();
        const tokenId = await strategy.tokenId();
        const totalAssets = await strategy.totalAssets();
        
        console.log("✅ UniswapV3Strategy functions working:");
        console.log("- Vault:", vault);
        console.log("- Want token:", wantToken);
        console.log("- Token ID:", tokenId.toString());
        console.log("- Total assets:", ethers.formatUnits(totalAssets, 6), "USDC");
        
    } catch (error) {
        console.error("❌ Verification failed:", error.message);
        throw error;
    }
    
    console.log("\n🎉 UPGRADE COMPLETED SUCCESSFULLY!");
}

main().catch((error) => {
    console.error("Upgrade failed:", error);
    process.exit(1);
});
