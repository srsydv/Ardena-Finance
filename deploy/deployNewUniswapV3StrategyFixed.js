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
    
    // Contract addresses for NEW AAVE VAULT and NEW AAVE/WETH pool
    const VAULT_ADDRESS = "0x3cd0145707C03316B48f8A254c494600c30ebf8d"; // requested vault
    const AAVE_ADDRESS = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a"; // want
    const UNISWAP_POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
    const POOL_ADDRESS = "0x0E98753e483679703c902a0f574646d3653ad9eA"; // AAVE/WETH pool
    const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
    const ORACLE_ADDRESS = "0x32D6d6024CE08930b1f3eDd30F5eDd0d1986c9c4"; // new OracleModule
    const MATH_ADAPTER_ADDRESS = "0x263b2a35787b3D9f8c2aca02ce2372E9f7CD438E";
    
    console.log("\n=== STEP 1: CHECKING CURRENT VAULT STATE ===");
    console.log("Using NEW AAVE VAULT and NEW AAVE/WETH pool:");
    console.log("- Vault:", VAULT_ADDRESS);
    console.log("- AAVE:", AAVE_ADDRESS);
    console.log("- NEW Pool:", POOL_ADDRESS);
    console.log("- Target: 1 WETH = 10 AAVE price");
    
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
    
    console.log("\n=== STEP 2: DEPLOYING NEW UNISWAPV3STRATEGY (deploy-only) ===");
    
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
    
    console.log("\n=== STEP 3: BASIC STRATEGY CHECKS (no vault wiring) ===");
    
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
    
    console.log("\n🎉 NEW STRATEGY DEPLOYMENT COMPLETED (DEPLOY-ONLY)!");
    console.log("\n📝 SUMMARY:");
    console.log("- New strategy deployed:", newStrategyAddress);
    console.log("- Vault (not wired):", VAULT_ADDRESS);
    console.log("- Pool:", POOL_ADDRESS);
    console.log("- Oracle:", ORACLE_ADDRESS);
}

main().catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
});
