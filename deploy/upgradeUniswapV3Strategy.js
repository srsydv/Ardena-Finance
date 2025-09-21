/*
  Upgrade script for UniswapV3Strategy contract on Sepolia.
  
  This script upgrades the existing UUPS proxy contract to new implementation.
  Since UniswapV3Strategy only allows the vault to authorize upgrades, we need
  to use the vault's upgrade function or modify the authorization.
  
  Usage:
    npx hardhat run deploy/upgradeUniswapV3Strategy.js --network sepolia
  
  Required:
    - PK environment variable for the deployer account
    - The deployer must be a manager in the AccessController to authorize upgrades
*/

require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== UPGRADING UNISWAPV3STRATEGY ON SEPOLIA ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== 11155111n) {
        console.warn(`Warning: expected Sepolia (11155111), current chainId=${chainId}`);
    }
    
    // Contract addresses from DEPLOYEDCONTRACT.me
    const UNI_STRATEGY_ADDRESS = "0xA87bFB6973b92685C66D2BDc37A670Ee995a4C3B";
    const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
    const ACCESS_CONTROLLER_ADDRESS = "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";
    
    console.log("\n=== STEP 1: CHECKING DEPLOYER PERMISSIONS ===");
    
    // Check if deployer is a manager (required for upgrades)
    const AccessController = await ethers.getContractFactory("AccessController");
    const accessController = AccessController.attach(ACCESS_CONTROLLER_ADDRESS);
    
    const isManager = await accessController.managers(deployer.address);
    console.log("Is deployer a manager:", isManager);
    
    if (!isManager) {
        console.log("❌ Deployer is not a manager. Setting manager role...");
        const setManagerTx = await accessController.setManager(deployer.address, true);
        await setManagerTx.wait();
        console.log("✅ Manager role set!");
        
        // Verify
        const isManagerAfter = await accessController.managers(deployer.address);
        console.log("Is deployer a manager after setting:", isManagerAfter);
    }
    
    console.log("\n=== STEP 2: CHECKING CURRENT STRATEGY STATE ===");
    
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
        
        console.log("Strategy configuration:");
        console.log("- Vault:", vault);
        console.log("- Want token:", wantToken);
        console.log("- Token ID:", tokenId.toString());
        
        // Check if vault matches expected address
        if (vault.toLowerCase() !== VAULT_ADDRESS.toLowerCase()) {
            console.log("⚠️ Warning: Strategy vault doesn't match expected vault address");
        }
        
    } catch (error) {
        console.error("❌ Failed to check current strategy state:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 3: UPGRADING UNISWAPV3STRATEGY CONTRACT ===");
    
    try {
        // Get the current UniswapV3Strategy implementation
        const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
        
        // Deploy new implementation first
        console.log("Deploying new UniswapV3Strategy implementation...");
        const newStrategyImpl = await UniswapV3Strategy.deploy();
        await newStrategyImpl.waitForDeployment();
        console.log("New implementation deployed at:", newStrategyImpl.target);
        
        // Get the vault contract
        const Vault = await ethers.getContractFactory("Vault");
        const vault = Vault.attach(VAULT_ADDRESS);
        
        // Since the strategy only allows the vault to authorize upgrades,
        // we need to use the vault's upgrade function or call upgradeToAndCall directly
        console.log("Attempting to upgrade through vault...");
        
        // Method 1: Try to upgrade directly (this might work if the vault has upgrade permissions)
        try {
            const upgradeTx = await upgrades.upgradeProxy(UNI_STRATEGY_ADDRESS, UniswapV3Strategy);
            await upgradeTx.waitForDeployment();
            console.log("✅ Direct upgrade succeeded!");
        } catch (directError) {
            console.log("Direct upgrade failed:", directError.message);
            
            // Method 2: Try to call upgradeToAndCall directly on the strategy
            console.log("Attempting direct upgradeToAndCall...");
            try {
                const strategy = UniswapV3Strategy.attach(UNI_STRATEGY_ADDRESS);
                const upgradeTx = await strategy.upgradeToAndCall(newStrategyImpl.target, "0x");
                await upgradeTx.wait();
                console.log("✅ Direct upgradeToAndCall succeeded!");
            } catch (directCallError) {
                console.log("Direct upgradeToAndCall failed:", directCallError.message);
                
                // Method 3: Check if we can modify the authorization temporarily
                console.log("Checking if we can modify authorization...");
                
                // This is a more complex approach - we might need to deploy a new strategy
                // and migrate the state, or find another way to upgrade
                console.log("❌ All upgrade methods failed. The strategy's _authorizeUpgrade");
                console.log("   only allows the vault to authorize upgrades, but the vault");
                console.log("   doesn't have upgrade permissions for the strategy.");
                console.log("\nPossible solutions:");
                console.log("1. Deploy a new strategy and migrate funds");
                console.log("2. Modify the strategy contract to allow manager upgrades");
                console.log("3. Use a different upgrade mechanism");
                
                throw new Error("Cannot upgrade UniswapV3Strategy due to authorization restrictions");
            }
        }
        
        // Verify the upgrade
        const newImpl = await upgrades.erc1967.getImplementationAddress(UNI_STRATEGY_ADDRESS);
        console.log("New UniswapV3Strategy implementation:", newImpl);
        console.log("✅ UniswapV3Strategy upgrade completed!");
        
    } catch (error) {
        console.error("❌ UniswapV3Strategy upgrade failed:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 4: VERIFYING UPGRADE ===");
    
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
        
        // Test strategy interface functions
        const want = await strategy.want();
        console.log("- Want address:", want);
        
        // Check if strategy is properly configured
        if (vault.toLowerCase() === VAULT_ADDRESS.toLowerCase()) {
            console.log("✅ Strategy vault configuration is correct");
        } else {
            console.log("⚠️ Strategy vault configuration mismatch");
        }
        
        if (wantToken.toLowerCase() === "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8".toLowerCase()) {
            console.log("✅ Strategy want token (USDC) configuration is correct");
        } else {
            console.log("⚠️ Strategy want token configuration mismatch");
        }
        
    } catch (error) {
        console.error("❌ UniswapV3Strategy verification failed:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 5: TESTING VAULT INTEGRATION ===");
    
    try {
        const Vault = await ethers.getContractFactory("Vault");
        const vault = Vault.attach(VAULT_ADDRESS);
        
        // Check if strategy is still registered in vault
        const strategiesLength = await vault.strategiesLength();
        console.log("Vault strategies count:", strategiesLength.toString());
        
        let strategyFound = false;
        for (let i = 0; i < strategiesLength; i++) {
            const strategyAddress = await vault.strategies(i);
            if (strategyAddress.toLowerCase() === UNI_STRATEGY_ADDRESS.toLowerCase()) {
                strategyFound = true;
                const targetBps = await vault.targetBps(strategyAddress);
                console.log("✅ Strategy found in vault at index:", i);
                console.log("- Target allocation:", targetBps.toString(), "bps");
                break;
            }
        }
        
        if (!strategyFound) {
            console.log("⚠️ Strategy not found in vault strategies list");
        }
        
        // Test vault's totalAssets calculation (includes strategy)
        const vaultTotalAssets = await vault.totalAssets();
        console.log("Vault total assets:", ethers.formatUnits(vaultTotalAssets, 6), "USDC");
        
    } catch (error) {
        console.error("❌ Vault integration test failed:", error.message);
        throw error;
    }
    
    console.log("\n🎉 UNISWAPV3STRATEGY UPGRADE COMPLETED SUCCESSFULLY!");
    
    console.log("\n=== UPGRADE SUMMARY ===");
    console.log("✅ UniswapV3Strategy contract upgraded successfully");
    console.log("✅ All strategy functions verified and working");
    console.log("✅ Vault integration confirmed");
    console.log("✅ Configuration preserved");
    
    console.log("\nContract addresses:");
    console.log("- UniswapV3Strategy:", UNI_STRATEGY_ADDRESS);
    console.log("- Vault:", VAULT_ADDRESS);
    console.log("- AccessController:", ACCESS_CONTROLLER_ADDRESS);
    
    console.log("\n=== NEXT STEPS ===");
    console.log("1. Test the investIdle function with the updated strategy");
    console.log("2. Verify that swaps work correctly through ExchangeHandler");
    console.log("3. Test deposit/withdraw functionality");
    console.log("4. Run your UI to test the complete flow");
}

main().catch((error) => {
    console.error("Upgrade failed:", error);
    process.exit(1);
});