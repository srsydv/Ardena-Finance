const { ethers } = require("hardhat");
require("dotenv").config();

async function checkStrategyAllocation() {
    try {
        console.log("=== CHECKING STRATEGY ALLOCATION ===");
        
        // Setup provider and wallet
        const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
        const wallet = new ethers.Wallet(process.env.PK, provider);
        
        // Contract addresses
        const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
        const AAVE_STRATEGY_ADDRESS = "0xCc02bC41a7AF1A35af4935346cABC7335167EdC9";
        const UNI_STRATEGY_ADDRESS = "0xA87bFB6973b92685C66D2BDc37A670Ee995a4C3B";
        
        // Contract ABIs
        const vaultABI = [
            "function strategiesLength() external view returns (uint256)",
            "function strategies(uint256) external view returns (address)",
            "function targetBps(address) external view returns (uint16)"
        ];
        
        // Initialize contracts
        const vault = new ethers.Contract(VAULT_ADDRESS, vaultABI, wallet);
        
        console.log("\n=== STRATEGY CONFIGURATION ===");
        
        // Get strategies
        const strategiesLength = await vault.strategiesLength();
        console.log("Number of strategies:", strategiesLength.toString());
        
        const strategies = [];
        for (let i = 0; i < strategiesLength; i++) {
            const strategyAddress = await vault.strategies(i);
            strategies.push(strategyAddress);
        }
        console.log("Strategies:", strategies);
        
        // Get allocations
        console.log("\n=== STRATEGY ALLOCATIONS ===");
        for (let i = 0; i < strategies.length; i++) {
            const strategyAddress = strategies[i];
            const targetBps = await vault.targetBps(strategyAddress);
            const percentage = (Number(targetBps) / 100).toFixed(1);
            
            let strategyName = "Unknown";
            if (strategyAddress.toLowerCase() === AAVE_STRATEGY_ADDRESS.toLowerCase()) {
                strategyName = "AaveV3Strategy";
            } else if (strategyAddress.toLowerCase() === UNI_STRATEGY_ADDRESS.toLowerCase()) {
                strategyName = "UniswapV3Strategy";
            }
            
            console.log(`Strategy ${i} (${strategyName}): ${targetBps.toString()} bps (${percentage}%)`);
        }
        
        // Calculate total allocation
        let totalBps = 0;
        for (let i = 0; i < strategies.length; i++) {
            const targetBps = await vault.targetBps(strategies[i]);
            totalBps += Number(targetBps);
        }
        console.log(`\nTotal allocation: ${totalBps} bps (${(totalBps/100).toFixed(1)}%)`);
        
        console.log("\n=== PAYLOAD STRUCTURE ANALYSIS ===");
        
        if (strategies.length === 1) {
            console.log("✅ Single strategy - should use [[payload]]");
            console.log("Payload structure: [[swapData]]");
        } else if (strategies.length === 2) {
            console.log("✅ Two strategies - should use [[], [payload]]");
            console.log("Payload structure: [[], [swapData]]");
            console.log("- Index 0: AaveV3Strategy (empty array)");
            console.log("- Index 1: UniswapV3Strategy (swap data)");
        } else {
            console.log("❓ Multiple strategies - need to match order");
        }
        
        console.log("\n=== COMPARISON WITH WORKING TEST ===");
        console.log("Working test (uniswapV2Router.test.js):");
        console.log("- Single strategy: UniswapV3Strategy (100%)");
        console.log("- Payload: [[payload]]");
        console.log("- Result: ✅ SUCCESS");
        
        console.log("\nOur test (test-invest-idle-direct.test.js):");
        console.log("- Multiple strategies: AaveV3Strategy + UniswapV3Strategy");
        console.log("- Payload: [[], [payload]]");
        console.log("- Result: ❌ FAILURE");
        
        console.log("\n=== CONCLUSION ===");
        if (strategies.length === 2) {
            console.log("✅ Our payload structure [[], [payload]] is CORRECT");
            console.log("❌ The issue is NOT the payload structure");
            console.log("🔍 The issue must be elsewhere (ExchangeHandler, router setup, etc.)");
        } else {
            console.log("❌ Our payload structure is WRONG");
            console.log("🔧 Need to adjust payload structure");
        }
        
    } catch (error) {
        console.error("Check failed:", error);
    }
}

checkStrategyAllocation();
