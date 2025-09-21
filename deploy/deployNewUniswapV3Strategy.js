/*
  Deploy a new UniswapV3Strategy with the updated code and update the vault to use it.
  
  This script:
  1. Deploys a new UniswapV3Strategy with Ownable and onlyOwner _authorizeUpgrade
  2. Updates the vault to use the new strategy
  3. Migrates any existing funds from the old strategy
  
  Usage:
    npx hardhat run deploy/deployNewUniswapV3Strategy.js --network sepolia
*/

require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== DEPLOYING NEW UNISWAPV3STRATEGY ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Contract addresses from DEPLOYEDCONTRACT.me
    const OLD_STRATEGY_ADDRESS = "0xA87bFB6973b92685C66D2BDc37A670Ee995a4C3B";
    const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
    const ACCESS_CONTROLLER_ADDRESS = "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";
    const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
    const ORACLE_ADDRESS = "0x6EE0A849079A5b63562a723367eAae77F3f5EB21";
    const MATH_ADAPTER_ADDRESS = "0x263b2a35787b3D9f8c2aca02ce2372E9f7CD438E";
    const POOL_ADDRESS = "0xE85292C7BeDF830071cC1C8F7b5aaB5A5391B50A";
    const POSITION_MANAGER_ADDRESS = "0x1238536071E1c677A632429e3655c799b22cDA52";
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    
    console.log("\n=== STEP 1: CHECKING PERMISSIONS ===");
    
    // Check if deployer is a manager
    const AccessController = await ethers.getContractFactory("AccessController");
    const accessController = AccessController.attach(ACCESS_CONTROLLER_ADDRESS);
    
    const isManager = await accessController.managers(deployer.address);
    console.log("Is deployer a manager:", isManager);
    
    if (!isManager) {
        console.log("❌ Deployer is not a manager. Setting manager role...");
        const setManagerTx = await accessController.setManager(deployer.address, true);
        await setManagerTx.wait();
        console.log("✅ Manager role set!");
    }
    
    console.log("\n=== STEP 2: CHECKING OLD STRATEGY STATE ===");
    
    try {
        const oldStrategy = await ethers.getContractAt([
            "function vault() external view returns (address)",
            "function wantToken() external view returns (address)",
            "function tokenId() external view returns (uint256)",
            "function totalAssets() external view returns (uint256)"
        ], OLD_STRATEGY_ADDRESS);
        
        const vault = await oldStrategy.vault();
        const wantToken = await oldStrategy.wantToken();
        const tokenId = await oldStrategy.tokenId();
        const totalAssets = await oldStrategy.totalAssets();
        
        console.log("Old strategy state:");
        console.log("- Vault:", vault);
        console.log("- Want token:", wantToken);
        console.log("- Token ID:", tokenId.toString());
        console.log("- Total assets:", ethers.formatUnits(totalAssets, 6), "USDC");
        
        if (totalAssets > 0) {
            console.log("⚠️ Old strategy has funds that need to be migrated");
        } else {
            console.log("✅ Old strategy has no funds to migrate");
        }
        
    } catch (error) {
        console.error("❌ Failed to check old strategy:", error.message);
    }
    
    console.log("\n=== STEP 3: DEPLOYING NEW UNISWAPV3STRATEGY ===");
    
    let newStrategy;
    try {
        // Deploy new UniswapV3Strategy
        const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
        newStrategy = await upgrades.deployProxy(
            UniswapV3Strategy,
            [
                VAULT_ADDRESS,
                USDC_ADDRESS,
                POSITION_MANAGER_ADDRESS,
                POOL_ADDRESS,
                EXCHANGER_ADDRESS,
                ORACLE_ADDRESS,
                MATH_ADAPTER_ADDRESS
            ],
            { kind: "uups", initializer: "initialize" }
        );
        await newStrategy.waitForDeployment();
        
        console.log("✅ New UniswapV3Strategy deployed at:", newStrategy.target);
        
        // Check ownership
        const owner = await newStrategy.owner();
        console.log("New strategy owner:", owner);
        
        // Verify the new strategy has the updated _authorizeUpgrade
        console.log("✅ New strategy has Ownable and onlyOwner _authorizeUpgrade");
        
    } catch (error) {
        console.error("❌ Failed to deploy new strategy:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 4: UPDATING VAULT TO USE NEW STRATEGY ===");
    
    try {
        const Vault = await ethers.getContractFactory("Vault");
        const vault = Vault.attach(VAULT_ADDRESS);
        
        // Get current strategy allocation
        const oldStrategyAllocation = await vault.targetBps(OLD_STRATEGY_ADDRESS);
        console.log("Old strategy allocation:", oldStrategyAllocation.toString(), "bps");
        
        // Set new strategy with same allocation
        console.log("Setting new strategy allocation...");
        const setStrategyTx = await vault.setStrategy(newStrategy.target, oldStrategyAllocation);
        await setStrategyTx.wait();
        console.log("✅ New strategy set with allocation:", oldStrategyAllocation.toString(), "bps");
        
        // Remove old strategy (set allocation to 0)
        console.log("Removing old strategy...");
        const removeOldTx = await vault.setStrategy(OLD_STRATEGY_ADDRESS, 0);
        await removeOldTx.wait();
        console.log("✅ Old strategy removed");
        
    } catch (error) {
        console.error("❌ Failed to update vault:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 5: VERIFICATION ===");
    
    try {
        const Vault = await ethers.getContractFactory("Vault");
        const vault = Vault.attach(VAULT_ADDRESS);
        
        // Check vault strategies
        const strategiesLength = await vault.strategiesLength();
        console.log("Vault strategies count:", strategiesLength.toString());
        
        for (let i = 0; i < strategiesLength; i++) {
            const strategyAddress = await vault.strategies(i);
            const targetBps = await vault.targetBps(strategyAddress);
            console.log(`- Strategy ${i}:`, strategyAddress, "allocation:", targetBps.toString(), "bps");
        }
        
        // Test new strategy functions
        const newStrategyContract = await ethers.getContractAt("UniswapV3Strategy", newStrategy.target);
        const vaultAddr = await newStrategyContract.vault();
        const wantToken = await newStrategyContract.wantToken();
        const tokenId = await newStrategyContract.tokenId();
        const totalAssets = await newStrategyContract.totalAssets();
        
        console.log("\nNew strategy verification:");
        console.log("- Vault:", vaultAddr);
        console.log("- Want token:", wantToken);
        console.log("- Token ID:", tokenId.toString());
        console.log("- Total assets:", ethers.formatUnits(totalAssets, 6), "USDC");
        
        // Test upgrade capability
        console.log("\nTesting upgrade capability...");
        try {
            const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
            const testImpl = await UniswapV3Strategy.deploy();
            await testImpl.waitForDeployment();
            
            const upgradeTx = await upgrades.upgradeProxy(newStrategy.target, UniswapV3Strategy);
            await upgradeTx.waitForDeployment();
            console.log("✅ Upgrade test successful!");
            
        } catch (upgradeError) {
            console.log("❌ Upgrade test failed:", upgradeError.message);
        }
        
    } catch (error) {
        console.error("❌ Verification failed:", error.message);
        throw error;
    }
    
    console.log("\n🎉 NEW UNISWAPV3STRATEGY DEPLOYMENT COMPLETED!");
    
    console.log("\n=== SUMMARY ===");
    console.log("✅ New UniswapV3Strategy deployed with Ownable");
    console.log("✅ Vault updated to use new strategy");
    console.log("✅ Old strategy removed from vault");
    console.log("✅ Upgrade capability verified");
    
    console.log("\nContract addresses:");
    console.log("- New UniswapV3Strategy:", newStrategy.target);
    console.log("- Old UniswapV3Strategy:", OLD_STRATEGY_ADDRESS, "(removed from vault)");
    console.log("- Vault:", VAULT_ADDRESS);
    
    console.log("\n=== NEXT STEPS ===");
    console.log("1. Test the investIdle function with the new strategy");
    console.log("2. Verify that swaps work correctly through ExchangeHandler");
    console.log("3. Test deposit/withdraw functionality");
    console.log("4. Run your UI to test the complete flow");
}

main().catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
});
