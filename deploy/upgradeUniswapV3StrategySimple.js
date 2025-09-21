/*
  Simple upgrade script for UniswapV3Strategy contract on Sepolia.
  
  This script attempts to upgrade the UniswapV3Strategy by deploying a new implementation
  and calling upgradeToAndCall directly. If that fails due to authorization, it provides
  guidance on alternative approaches.
  
  Usage:
    npx hardhat run deploy/upgradeUniswapV3StrategySimple.js --network sepolia
*/

require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== UPGRADING UNISWAPV3STRATEGY ON SEPOLIA ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Contract addresses from DEPLOYEDCONTRACT.me
    const UNI_STRATEGY_ADDRESS = "0x350e30c578cbcFA4eeba04855DC909F3252EEFe6";
    const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
    
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
        
        console.log("Strategy configuration:");
        console.log("- Vault:", vault);
        console.log("- Want token:", wantToken);
        console.log("- Token ID:", tokenId.toString());
        console.log("- Total assets:", ethers.formatUnits(totalAssets, 6), "USDC");
        
    } catch (error) {
        console.error("❌ Failed to check current strategy state:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 2: ATTEMPTING UPGRADE ===");
    
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
        
        if (error.message.includes("NOT_VAULT")) {
            console.log("\n🔍 ANALYSIS:");
            console.log("The UniswapV3Strategy's _authorizeUpgrade function only allows the vault");
            console.log("to authorize upgrades, but the vault doesn't have upgrade permissions");
            console.log("for the strategy.");
            
            console.log("\n💡 SOLUTIONS:");
            console.log("1. **Modify the strategy contract** to allow manager upgrades:");
            console.log("   - Change _authorizeUpgrade to check access.managers(msg.sender)");
            console.log("   - Redeploy and upgrade");
            
            console.log("\n2. **Deploy a new strategy** and migrate funds:");
            console.log("   - Deploy new UniswapV3Strategy with updated code");
            console.log("   - Update vault to use new strategy");
            console.log("   - Migrate any existing positions");
            
            console.log("\n3. **Use a different upgrade mechanism**:");
            console.log("   - Implement a migration function");
            console.log("   - Use a factory pattern for strategy deployment");
            
            console.log("\n📝 RECOMMENDED APPROACH:");
            console.log("Modify the UniswapV3Strategy contract to allow manager upgrades:");
            console.log("```solidity");
            console.log("function _authorizeUpgrade(address newImplementation) internal view override {");
            console.log("    require(access.managers(msg.sender), \"NOT_MANAGER\");");
            console.log("}");
            console.log("```");
            
            console.log("\nThen redeploy and upgrade the contract.");
        }
        
        throw error;
    }
    
    console.log("\n=== STEP 3: VERIFICATION ===");
    
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
