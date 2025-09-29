/**
 * AAVE InvestIdle Test - AaveV3Strategy Only
 * 
 * This test:
 * 1. Removes UniswapV3Strategy from vault
 * 2. Sets AaveV3Strategy target to 60%
 * 3. Tests investIdle() with only AaveV3Strategy
 * 4. Verifies if the issue is with UniswapV3Strategy or investIdle function
 */

import hre from "hardhat";
const { ethers } = hre;
import dotenv from "dotenv";
dotenv.config();

// NEW AAVE VAULT SYSTEM ADDRESSES
const CONTRACTS = {
    // NEW AAVE VAULT SYSTEM
    vault: "0x3cd0145707C03316B48f8A254c494600c30ebf8d", // NEW AAVE VAULT
    asset: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a", // AAVE TOKEN
    
    // NEW STRATEGIES
    aaveStrategy: "0x9362c59c71321c77CaeE86f9Cf02cbBF3b64277D", // NEW AAVEV3STRATEGY
    uniStrategy: "0x65cDA0b70d3D09139c0a78059082F885714a0Fe7", // NEW AAVE UNISWAPV3STRATEGY (TO REMOVE)
    
    // INFRASTRUCTURE
    accessController: "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2",
    
    // POOLS
    aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951", // AAVE V3 POOL
};

// Contract ABIs
const VAULT_ABI = [
    "function investIdle(bytes[][] calldata allSwapData) external",
    "function setStrategy(address strategy, uint16 bps) external",
    "function totalAssets() external view returns (uint256)",
    "function strategiesLength() external view returns (uint256)",
    "function strategies(uint256) external view returns (address)",
    "function targetBps(address) external view returns (uint16)",
    "function access() external view returns (address)"
];

const ACCESS_CONTROLLER_ABI = [
    "function managers(address account) external view returns (bool)"
];

const STRATEGY_ABI = [
    "function totalAssets() external view returns (uint256)",
    "function want() external view returns (address)"
];

const ERC20_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)"
];

async function testInvestIdleAaveOnly() {
    console.log("🧪 AAVE INVEST IDLE TEST - AAVE STRATEGY ONLY");
    console.log("=============================================");
    console.log("🎯 Goal: Test investIdle() with only AaveV3Strategy");
    console.log("🌐 Network: Sepolia Testnet");
    console.log("💰 Token: AAVE (18 decimals)");
    console.log("📋 Strategy: Remove UniswapV3Strategy, set AaveV3Strategy to 60%");
    console.log("");
    
    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
    const wallet = new ethers.Wallet(process.env.PK, provider);
    const userAddress = await wallet.getAddress();
    
    console.log("👤 User address:", userAddress);
    console.log("💰 ETH balance:", ethers.formatEther(await provider.getBalance(userAddress)), "ETH");
    console.log("");

    // Create contract instances
    const vault = new ethers.Contract(CONTRACTS.vault, VAULT_ABI, wallet);
    const aave = new ethers.Contract(CONTRACTS.asset, ERC20_ABI, wallet);
    const accessController = new ethers.Contract(CONTRACTS.accessController, ACCESS_CONTROLLER_ABI, wallet);
    const aaveStrategy = new ethers.Contract(CONTRACTS.aaveStrategy, STRATEGY_ABI, wallet);

    try {
        // Step 1: Check Manager Role
        console.log("📋 STEP 1: MANAGER ROLE CHECK");
        console.log("-----------------------------");
        
        const isManager = await accessController.managers(userAddress);
        console.log("🔍 Is manager:", isManager);
        
        if (!isManager) {
            throw new Error("User is not a manager - cannot modify strategies or call investIdle()");
        }
        console.log("✅ Manager role confirmed");
        console.log("");

        // Step 2: Check Current Vault State
        console.log("📋 STEP 2: CURRENT VAULT STATE");
        console.log("------------------------------");
        
        const totalAssetsBefore = await vault.totalAssets();
        console.log("💰 Vault total assets:", ethers.formatUnits(totalAssetsBefore, 18), "AAVE");
        
        // Check idle funds
        const idleFundsBefore = await aave.balanceOf(CONTRACTS.vault);
        console.log("💰 Idle funds in vault:", ethers.formatUnits(idleFundsBefore, 18), "AAVE");
        
        // Check current strategies
        const strategiesLengthBefore = await vault.strategiesLength();
        console.log("📋 Number of strategies (before):", strategiesLengthBefore.toString());
        
        const strategies = [];
        for (let i = 0; i < strategiesLengthBefore; i++) {
            const strategyAddress = await vault.strategies(i);
            const targetBps = await vault.targetBps(strategyAddress);
            const strategyContract = new ethers.Contract(strategyAddress, STRATEGY_ABI, wallet);
            const strategyAssets = await strategyContract.totalAssets();
            
            strategies.push({
                address: strategyAddress,
                allocation: targetBps,
                assets: strategyAssets
            });
            
            const isAaveStrategy = strategyAddress.toLowerCase() === CONTRACTS.aaveStrategy.toLowerCase();
            const isUniStrategy = strategyAddress.toLowerCase() === CONTRACTS.uniStrategy.toLowerCase();
            
            console.log(`📋 Strategy ${i}:`, strategyAddress);
            console.log(`   Type: ${isAaveStrategy ? 'AaveV3Strategy' : isUniStrategy ? 'UniswapV3Strategy' : 'Unknown'}`);
            console.log(`   Allocation: ${targetBps.toString()} bps (${Number(targetBps)/100}%)`);
            console.log(`   Assets: ${ethers.formatUnits(strategyAssets, 18)} AAVE`);
        }
        console.log("");

        // Step 3: Remove UniswapV3Strategy
        console.log("📋 STEP 3: REMOVING UNISWAPV3STRATEGY");
        console.log("-------------------------------------");
        
        // Check if UniswapV3Strategy exists
        let uniStrategyIndex = -1;
        for (let i = 0; i < strategiesLengthBefore; i++) {
            if (strategies[i].address.toLowerCase() === CONTRACTS.uniStrategy.toLowerCase()) {
                uniStrategyIndex = i;
                break;
            }
        }
        
        if (uniStrategyIndex >= 0) {
            console.log("🔍 Found UniswapV3Strategy at index:", uniStrategyIndex);
            console.log("🎯 Removing UniswapV3Strategy (setting allocation to 0)...");
            
            try {
                const removeTx = await vault.setStrategy(CONTRACTS.uniStrategy, 0); // 0% allocation = remove
                console.log("📤 Remove transaction sent:", removeTx.hash);
                
                const removeReceipt = await removeTx.wait();
                console.log("✅ UniswapV3Strategy removed successfully!");
                console.log("⛽ Gas used:", removeReceipt.gasUsed.toString());
                
            } catch (error) {
                console.log("❌ Failed to remove UniswapV3Strategy:", error.message);
                throw error;
            }
        } else {
            console.log("ℹ️  UniswapV3Strategy not found in current strategies");
        }
        console.log("");

        // Step 4: Add and Set AaveV3Strategy to 60%
        console.log("📋 STEP 4: ADDING AND SETTING AAVEV3STRATEGY TO 60%");
        console.log("--------------------------------------------------");
        
        // Check if AaveV3Strategy exists
        let aaveStrategyIndex = -1;
        for (let i = 0; i < strategiesLengthBefore; i++) {
            if (strategies[i].address.toLowerCase() === CONTRACTS.aaveStrategy.toLowerCase()) {
                aaveStrategyIndex = i;
                break;
            }
        }
        
        if (aaveStrategyIndex >= 0) {
            console.log("🔍 Found existing AaveV3Strategy at index:", aaveStrategyIndex);
            console.log("🎯 Setting AaveV3Strategy allocation to 60% (6000 bps)...");
        } else {
            console.log("🔍 AaveV3Strategy not found, adding it...");
            console.log("🎯 Adding AaveV3Strategy with 60% allocation (6000 bps)...");
        }
        
        try {
            const setTx = await vault.setStrategy(CONTRACTS.aaveStrategy, 6000); // 60% allocation
            console.log("📤 Set strategy transaction sent:", setTx.hash);
            
            const setReceipt = await setTx.wait();
            console.log("✅ AaveV3Strategy set to 60% successfully!");
            console.log("⛽ Gas used:", setReceipt.gasUsed.toString());
            
        } catch (error) {
            console.log("❌ Failed to set AaveV3Strategy:", error.message);
            throw error;
        }
        console.log("");

        // Step 5: Verify Strategy Configuration
        console.log("📋 STEP 5: VERIFYING STRATEGY CONFIGURATION");
        console.log("-------------------------------------------");
        
        const strategiesLengthAfter = await vault.strategiesLength();
        console.log("📋 Number of strategies (after):", strategiesLengthAfter.toString());
        
        console.log("\n📋 Updated Strategy Configuration:");
        for (let i = 0; i < strategiesLengthAfter; i++) {
            const strategyAddress = await vault.strategies(i);
            const targetBps = await vault.targetBps(strategyAddress);
            const strategyContract = new ethers.Contract(strategyAddress, STRATEGY_ABI, wallet);
            const strategyAssets = await strategyContract.totalAssets();
            
            const isAaveStrategy = strategyAddress.toLowerCase() === CONTRACTS.aaveStrategy.toLowerCase();
            const isUniStrategy = strategyAddress.toLowerCase() === CONTRACTS.uniStrategy.toLowerCase();
            
            console.log(`📋 Strategy ${i}:`, strategyAddress);
            console.log(`   Type: ${isAaveStrategy ? 'AaveV3Strategy' : isUniStrategy ? 'UniswapV3Strategy' : 'Unknown'}`);
            console.log(`   Allocation: ${targetBps.toString()} bps (${Number(targetBps)/100}%)`);
            console.log(`   Assets: ${ethers.formatUnits(strategyAssets, 18)} AAVE`);
            
            if (isAaveStrategy && targetBps !== 6000n) {
                console.log("⚠️  WARNING: AaveV3Strategy allocation is not 60%!");
            }
            if (isUniStrategy && targetBps !== 0n) {
                console.log("⚠️  WARNING: UniswapV3Strategy should have 0% allocation!");
            }
        }
        console.log("");

        // Step 6: Check Vault State Before InvestIdle
        console.log("📋 STEP 6: VAULT STATE (BEFORE INVEST IDLE)");
        console.log("--------------------------------------------");
        
        const idleFundsBeforeInvest = await aave.balanceOf(CONTRACTS.vault);
        console.log("💰 Idle funds in vault:", ethers.formatUnits(idleFundsBeforeInvest, 18), "AAVE");
        
        if (idleFundsBeforeInvest === 0n) {
            console.log("⚠️  No idle funds to invest!");
            return;
        }
        console.log("");

        // Step 7: Execute InvestIdle with AaveV3Strategy Only
        console.log("📋 STEP 7: EXECUTING INVEST IDLE (AAVE STRATEGY ONLY)");
        console.log("-----------------------------------------------------");
        
        // Create swap data for ALL strategies (empty arrays - no swapping needed)
        const allSwapData = [[], []]; // Empty arrays for both strategies
        
        console.log("🎯 Calling vault.investIdle() with AaveV3Strategy only...");
        console.log("   Idle funds:", ethers.formatUnits(idleFundsBeforeInvest, 18), "AAVE");
        console.log("   Strategies:", strategiesLengthAfter.toString());
        console.log("   AaveV3Strategy allocation: 60%");
        console.log("   Swap data: empty (no swapping needed for Aave)");
        
        try {
            const investTx = await vault.investIdle(allSwapData);
            console.log("📤 InvestIdle transaction sent:", investTx.hash);
            
            const investReceipt = await investTx.wait();
            console.log("✅ InvestIdle transaction confirmed!");
            console.log("⛽ Gas used:", investReceipt.gasUsed.toString());
            console.log("📊 Transaction status:", investReceipt.status);
            
            // Check for events
            if (investReceipt.logs && investReceipt.logs.length > 0) {
                console.log("📋 Transaction events:", investReceipt.logs.length);
            }
            
        } catch (error) {
            console.log("❌ InvestIdle failed:", error.message);
            
            // Try to decode the error
            if (error.message.includes("execution reverted")) {
                console.log("💡 This suggests the investIdle function reverted");
                console.log("💡 Possible causes:");
                console.log("   - AaveV3Strategy deposit failed");
                console.log("   - Aave pool interaction failed");
                console.log("   - Insufficient allowances or permissions");
            }
            
            if (error.message.includes("missing revert data")) {
                console.log("💡 Missing revert data suggests the error occurred in an external contract");
                console.log("💡 This could be the AaveV3Strategy or Aave pool contract");
            }
            
            throw error;
        }
        console.log("");

        // Step 8: Check Vault State After InvestIdle
        console.log("📋 STEP 8: VAULT STATE (AFTER INVEST IDLE)");
        console.log("-------------------------------------------");
        
        const idleFundsAfter = await aave.balanceOf(CONTRACTS.vault);
        console.log("💰 Idle funds in vault:", ethers.formatUnits(idleFundsAfter, 18), "AAVE");
        
        // Check AaveV3Strategy assets after
        const aaveStrategyAssetsAfter = await aaveStrategy.totalAssets();
        console.log("💰 AaveV3Strategy assets:", ethers.formatUnits(aaveStrategyAssetsAfter, 18), "AAVE");
        
        // Calculate changes
        const idleFundsDecrease = idleFundsBeforeInvest - idleFundsAfter;
        const aaveStrategyIncrease = aaveStrategyAssetsAfter - strategies.find(s => s.address.toLowerCase() === CONTRACTS.aaveStrategy.toLowerCase())?.assets || 0n;
        
        console.log("\n📊 Changes:");
        console.log("📉 Idle funds decrease:", ethers.formatUnits(idleFundsDecrease, 18), "AAVE");
        console.log("📈 AaveV3Strategy assets increase:", ethers.formatUnits(aaveStrategyIncrease, 18), "AAVE");
        console.log("");

        // Step 9: Verify Results
        console.log("📋 STEP 9: VERIFICATION");
        console.log("-----------------------");
        
        // Verify the investIdle worked
        if (idleFundsDecrease > 0 && aaveStrategyIncrease > 0) {
            console.log("");
            console.log("🎉 SUCCESS: InvestIdle with AaveV3Strategy only worked!");
            console.log("✅ Idle funds were successfully moved to AaveV3Strategy");
            console.log("✅ AaveV3Strategy assets increased correctly");
            console.log("✅ The issue was with UniswapV3Strategy, not investIdle function");
            
            // Calculate efficiency
            const efficiency = Number(aaveStrategyIncrease) / Number(idleFundsDecrease);
            console.log("📊 Investment efficiency:", (efficiency * 100).toFixed(2) + "%");
            
        } else {
            console.log("");
            console.log("⚠️  UNEXPECTED: InvestIdle with AaveV3Strategy didn't work as expected");
            console.log("💡 Idle funds decrease:", idleFundsDecrease.toString());
            console.log("💡 AaveV3Strategy increase:", aaveStrategyIncrease.toString());
            console.log("💡 This suggests the issue is with the investIdle function itself");
        }
        
        console.log("");
        console.log("🎉 AAVE INVEST IDLE TEST (AAVE STRATEGY ONLY) COMPLETED!");
        
        if (idleFundsDecrease > 0 && aaveStrategyIncrease > 0) {
            console.log("✅ RESULT: InvestIdle works with AaveV3Strategy");
            console.log("✅ RESULT: The issue was with UniswapV3Strategy");
            console.log("💡 Recommendation: Fix or replace UniswapV3Strategy");
        } else {
            console.log("❌ RESULT: InvestIdle fails even with AaveV3Strategy only");
            console.log("💡 This suggests a deeper issue with the investIdle function");
        }
        
    } catch (error) {
        console.error("❌ TEST FAILED:", error.message);
        console.error("Stack trace:", error.stack);
        process.exit(1);
    }
}

// Run the test
testInvestIdleAaveOnly().catch(console.error);
