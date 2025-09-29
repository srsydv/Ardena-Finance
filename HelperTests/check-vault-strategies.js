/**
 * Check Vault Strategies and Positions
 * 
 * This script checks:
 * 1. Current vault strategy configuration
 * 2. Strategy positions and allocations
 * 3. Which strategy is at which index
 */

import hre from "hardhat";
const { ethers } = hre;
import dotenv from "dotenv";
dotenv.config();

// NEW AAVE VAULT SYSTEM ADDRESSES
const CONTRACTS = {
    vault: "0x3cd0145707C03316B48f8A254c494600c30ebf8d", // NEW AAVE VAULT
    aaveStrategy: "0x9362c59c71321c77CaeE86f9Cf02cbBF3b64277D", // NEW AAVEV3STRATEGY
    uniStrategy: "0x65cDA0b70d3D09139c0a78059082F885714a0Fe7", // NEW AAVE UNISWAPV3STRATEGY
};

// Contract ABIs
const VAULT_ABI = [
    "function strategiesLength() external view returns (uint256)",
    "function strategies(uint256) external view returns (address)",
    "function targetBps(address) external view returns (uint16)",
    "function totalAssets() external view returns (uint256)"
];

const STRATEGY_ABI = [
    "function totalAssets() external view returns (uint256)",
    "function want() external view returns (address)"
];

async function checkVaultStrategies() {
    console.log("🔍 CHECKING VAULT STRATEGIES AND POSITIONS");
    console.log("==========================================");
    
    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
    const wallet = new ethers.Wallet(process.env.PK, provider);
    
    // Create contract instances
    const vault = new ethers.Contract(CONTRACTS.vault, VAULT_ABI, wallet);
    
    try {
        // Get vault info
        const totalAssets = await vault.totalAssets();
        const strategiesLength = await vault.strategiesLength();
        
        console.log("💰 Vault total assets:", ethers.formatUnits(totalAssets, 18), "AAVE");
        console.log("📋 Number of strategies:", strategiesLength.toString());
        console.log("");
        
        // Check each strategy
        const strategies = [];
        for (let i = 0; i < strategiesLength; i++) {
            const strategyAddress = await vault.strategies(i);
            const targetBps = await vault.targetBps(strategyAddress);
            
            // Create strategy contract to get assets
            const strategyContract = new ethers.Contract(strategyAddress, STRATEGY_ABI, wallet);
            const strategyAssets = await strategyContract.totalAssets();
            
            // Determine strategy type
            let strategyType = "Unknown";
            if (strategyAddress.toLowerCase() === CONTRACTS.aaveStrategy.toLowerCase()) {
                strategyType = "AaveV3Strategy";
            } else if (strategyAddress.toLowerCase() === CONTRACTS.uniStrategy.toLowerCase()) {
                strategyType = "UniswapV3Strategy";
            }
            
            const strategy = {
                index: i,
                address: strategyAddress,
                type: strategyType,
                allocation: targetBps,
                assets: strategyAssets
            };
            
            strategies.push(strategy);
            
            console.log(`📋 Strategy ${i}:`);
            console.log(`   Address: ${strategyAddress}`);
            console.log(`   Type: ${strategyType}`);
            console.log(`   Allocation: ${targetBps.toString()} bps (${Number(targetBps)/100}%)`);
            console.log(`   Assets: ${ethers.formatUnits(strategyAssets, 18)} AAVE`);
            console.log("");
        }
        
        // Find strategy positions
        const aaveStrategyIndex = strategies.findIndex(s => s.type === "AaveV3Strategy");
        const uniStrategyIndex = strategies.findIndex(s => s.type === "UniswapV3Strategy");
        
        console.log("🎯 STRATEGY POSITIONS:");
        console.log("=====================");
        console.log(`AaveV3Strategy is at index: ${aaveStrategyIndex >= 0 ? aaveStrategyIndex : 'Not found'}`);
        console.log(`UniswapV3Strategy is at index: ${uniStrategyIndex >= 0 ? uniStrategyIndex : 'Not found'}`);
        console.log("");
        
        // Create swap data structure
        console.log("📋 SWAP DATA STRUCTURE FOR UI:");
        console.log("==============================");
        console.log("Based on the strategy positions, the swap data should be:");
        console.log(`allSwapData = [`);
        
        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            if (strategy.type === "AaveV3Strategy") {
                console.log(`  [], // Index ${i}: AaveV3Strategy (no swap needed)`);
            } else if (strategy.type === "UniswapV3Strategy") {
                console.log(`  [swapPayload], // Index ${i}: UniswapV3Strategy (AAVE -> WETH swap)`);
            } else {
                console.log(`  [], // Index ${i}: Unknown strategy`);
            }
        }
        console.log(`];`);
        console.log("");
        
        // Summary
        console.log("📊 SUMMARY:");
        console.log("===========");
        console.log(`✅ Total strategies: ${strategies.length}`);
        console.log(`✅ AaveV3Strategy found: ${aaveStrategyIndex >= 0 ? 'Yes' : 'No'} ${aaveStrategyIndex >= 0 ? `(index ${aaveStrategyIndex})` : ''}`);
        console.log(`✅ UniswapV3Strategy found: ${uniStrategyIndex >= 0 ? 'Yes' : 'No'} ${uniStrategyIndex >= 0 ? `(index ${uniStrategyIndex})` : ''}`);
        
        if (aaveStrategyIndex >= 0 && uniStrategyIndex >= 0) {
            console.log("");
            console.log("🎯 UI INTEGRATION INSTRUCTIONS:");
            console.log("===============================");
            console.log("1. AaveV3Strategy is at index", aaveStrategyIndex, "- use empty array []");
            console.log("2. UniswapV3Strategy is at index", uniStrategyIndex, "- use swap payload");
            console.log("3. Create allSwapData array with correct positions");
            console.log("4. Ensure swap data length matches strategies length");
        }
        
    } catch (error) {
        console.error("❌ Error checking vault strategies:", error.message);
        process.exit(1);
    }
}

// Run the check
checkVaultStrategies().catch(console.error);
