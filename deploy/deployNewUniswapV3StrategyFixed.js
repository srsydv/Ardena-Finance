/*
  Deploy new UniswapV3Strategy with fixed tick calculation.
  
  This script deploys a new UniswapV3Strategy with the corrected tick calculation
  and updates the vault to use the new strategy.
  
  Usage:
    npx hardhat run deploy/deployNewUniswapV3StrategyFixed.js --network sepolia
*/

import dotenv from "dotenv";
dotenv.config();
import hre from "hardhat";
const { ethers, upgrades } = hre;

async function main() {
    console.log("=== DEPLOYING NEW UNISWAPV3STRATEGY WITH FIXED TICK CALCULATION ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Contract addresses for NEW AAVE VAULT and AAVE/WETH pool
    const VAULT_ADDRESS = "0x3cd0145707C03316B48f8A254c494600c30ebf8d"; // NEW AAVE VAULT
    const OLD_STRATEGY_ADDRESS = "0x6B018844b6Edd87f7F6355643fEB5090Da02b209"; // OLD USDC STRATEGY
    const AAVE_ADDRESS = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a"; // AAVE TOKEN
    const WETH_ADDRESS = "0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762"; // WETH
    const UNISWAP_POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
    const POOL_ADDRESS = "0x6eFCe0a593782545fe1bE3fF0abce18dC8181a3c"; // AAVE/WETH POOL
    const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
    const ORACLE_ADDRESS = "0x6EE0A849079A5b63562a723367eAae77F3f5EB21";
    const MATH_ADAPTER_ADDRESS = "0x263b2a35787b3D9f8c2aca02ce2372E9f7CD438E";
    const ACCESS_CONTROLLER_ADDRESS = "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";
    
    console.log("\n=== STEP 1: CHECKING CURRENT VAULT STATE ===");
    console.log("Using NEW AAVE VAULT and AAVE/WETH pool:");
    console.log("- Vault:", VAULT_ADDRESS);
    console.log("- AAVE:", AAVE_ADDRESS);
    console.log("- WETH:", WETH_ADDRESS);
    console.log("- Pool:", POOL_ADDRESS);
    
    try {
        const Vault = await ethers.getContractFactory("Vault");
        const vault = Vault.attach(VAULT_ADDRESS);
        
        const strategiesLength = await vault.strategiesLength();
        console.log("Number of strategies:", strategiesLength.toString());
        
        for (let i = 0; i < strategiesLength; i++) {
            const strategyAddress = await vault.strategies(i);
            const bps = await vault.targetBps(strategyAddress);
            console.log(`Strategy ${i}: ${strategyAddress} allocation: ${bps.toString()} bps`);
        }
        
    } catch (error) {
        console.error("❌ Failed to check vault state:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 2: DEPLOYING NEW UNISWAPV3STRATEGY ===");
    
    let newStrategyAddress;
    
    try {
        // Deploy new UniswapV3Strategy
        console.log("Deploying new UniswapV3Strategy...");
        const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
        
        const newStrategy = await upgrades.deployProxy(
            UniswapV3Strategy,
            [
                VAULT_ADDRESS,
                AAVE_ADDRESS,
                UNISWAP_POSITION_MANAGER,
                POOL_ADDRESS,
                EXCHANGER_ADDRESS,
                ORACLE_ADDRESS,
                MATH_ADAPTER_ADDRESS,
                ACCESS_CONTROLLER_ADDRESS,
            ],
            { kind: "uups", initializer: "initialize" }
        );
        
        await newStrategy.waitForDeployment();
        newStrategyAddress = newStrategy.target;
        
        console.log("✅ New UniswapV3Strategy deployed at:", newStrategyAddress);
        
        // Verify the deployment
        const vault = await newStrategy.vault();
        const wantToken = await newStrategy.wantToken();
        const tokenId = await newStrategy.tokenId();
        
        console.log("New strategy configuration:");
        console.log("- Vault:", vault);
        console.log("- Want token:", wantToken);
        console.log("- Token ID:", tokenId.toString());
        
    } catch (error) {
        console.error("❌ Failed to deploy new strategy:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 3: UPDATING VAULT ===");
    
    try {
        const Vault = await ethers.getContractFactory("Vault");
        const vault = Vault.attach(VAULT_ADDRESS);
        
        // Check if old strategy exists in vault
        let oldStrategyExists = false;
        const strategiesLength = await vault.strategiesLength();
        for (let i = 0; i < strategiesLength; i++) {
            const strategyAddress = await vault.strategies(i);
            if (strategyAddress.toLowerCase() === OLD_STRATEGY_ADDRESS.toLowerCase()) {
                oldStrategyExists = true;
                break;
            }
        }
        
        // Remove old strategy if it exists
        if (oldStrategyExists) {
            console.log("Removing old strategy from vault...");
            const deleteTx = await vault.deleteStrategy(OLD_STRATEGY_ADDRESS);
            await deleteTx.wait();
            console.log("✅ Old strategy removed");
        } else {
            console.log("ℹ️  Old strategy not found in vault, skipping removal");
        }
        
        // Add new strategy with allocation
        console.log("Adding new strategy to vault...");
        const setTx = await vault.setStrategy(newStrategyAddress, 4000); // 40% allocation
        await setTx.wait();
        console.log("✅ New strategy added with 40% allocation");
        
        // Verify the update
        const updatedStrategiesLength = await vault.strategiesLength();
        console.log("Updated number of strategies:", updatedStrategiesLength.toString());
        
        for (let i = 0; i < updatedStrategiesLength; i++) {
            const strategyAddress = await vault.strategies(i);
            const bps = await vault.targetBps(strategyAddress);
            console.log(`Strategy ${i}: ${strategyAddress} allocation: ${bps.toString()} bps`);
        }
        
    } catch (error) {
        console.error("❌ Failed to update vault:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 4: TESTING NEW STRATEGY ===");
    
    try {
        const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
        const newStrategy = UniswapV3Strategy.attach(newStrategyAddress);
        
        // Test basic functions
        const vault = await newStrategy.vault();
        const wantToken = await newStrategy.wantToken();
        const totalAssets = await newStrategy.totalAssets();
        
        console.log("✅ New strategy functions working:");
        console.log("- Vault:", vault);
        console.log("- Want token:", wantToken);
        console.log("- Total assets:", ethers.formatUnits(totalAssets, 18), "AAVE");
        
    } catch (error) {
        console.error("❌ Strategy test failed:", error.message);
        throw error;
    }
    
    console.log("\n🎉 NEW STRATEGY DEPLOYMENT COMPLETED!");
    console.log("\n📝 SUMMARY:");
    console.log("- Old strategy removed:", OLD_STRATEGY_ADDRESS);
    console.log("- New strategy deployed:", newStrategyAddress);
    console.log("- Vault updated with new strategy");
    console.log("- New strategy has fixed tick calculation");
    
    console.log("\n🚀 NEXT STEPS:");
    console.log("1. Test investIdle functionality with the new AAVE strategy");
    console.log("2. Verify that the tick calculation bug is fixed");
    console.log("3. Update your frontend to use the new strategy address if needed");
    console.log("4. Test AAVE deposits and swaps in the UniswapV3Strategy");
    
    console.log("\n📋 UPDATE DEPLOYEDCONTRACT.me:");
    console.log(`NewAAVEUniswapV3Strategy: ${newStrategyAddress}`);
    console.log(`Pool: ${POOL_ADDRESS}`);
    console.log(`Vault: ${VAULT_ADDRESS}`);
}

main().catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
});
