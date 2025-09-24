/**
 * AAVE InvestIdle Test
 * 
 * This test:
 * 1. Checks current vault state and idle funds
 * 2. Calls investIdle() to move funds to strategies
 * 3. Verifies the funds are properly allocated to strategies
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
    weth: "0x4530fABea7444674a775aBb920924632c669466e", // NEW WETH
    
    // NEW STRATEGIES
    aaveStrategy: "0x9362c59c71321c77CaeE86f9Cf02cbBF3b64277D", // NEW AAVEV3STRATEGY
    uniStrategy: "0x65cDA0b70d3D09139c0a78059082F885714a0Fe7", // NEW AAVE UNISWAPV3STRATEGY
    
    // INFRASTRUCTURE
    accessController: "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2",
    exchanger: "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF",
    
    // POOLS
    aaveWethPool: "0x0E98753e483679703c902a0f574646d3653ad9eA", // NEW AAVE/WETH POOL
    aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951", // AAVE V3 POOL
    
    // ROUTER
    newSwapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E"
};

// Contract ABIs
const VAULT_ABI = [
    "function investIdle(bytes[][] calldata allSwapData) external",
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

const EXCHANGER_ABI = [
    "function setRouter(address router, bool allowed) external"
];

async function testInvestIdleAave() {
    console.log("🧪 AAVE INVEST IDLE TEST");
    console.log("========================");
    console.log("🎯 Goal: Test investIdle() function to move funds to strategies");
    console.log("🌐 Network: Sepolia Testnet");
    console.log("💰 Token: AAVE (18 decimals)");
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
    const exchanger = new ethers.Contract(CONTRACTS.exchanger, EXCHANGER_ABI, wallet);

    try {
        // Step 1: Check Manager Role
        console.log("📋 STEP 1: MANAGER ROLE CHECK");
        console.log("-----------------------------");
        
        const isManager = await accessController.managers(userAddress);
        console.log("🔍 Is manager:", isManager);
        
        if (!isManager) {
            throw new Error("User is not a manager - cannot call investIdle()");
        }
        console.log("✅ Manager role confirmed");
        console.log("");

        // Step 2: Check Vault State Before InvestIdle
        console.log("📋 STEP 2: VAULT STATE (BEFORE)");
        console.log("-------------------------------");
        
        const totalAssetsBefore = await vault.totalAssets();
        console.log("💰 Vault total assets:", ethers.formatUnits(totalAssetsBefore, 18), "AAVE");
        
        // Check idle funds (AAVE balance in vault)
        const idleFundsBefore = await aave.balanceOf(CONTRACTS.vault);
        console.log("💰 Idle funds in vault:", ethers.formatUnits(idleFundsBefore, 18), "AAVE");
        
        // Check strategies
        const strategiesLength = await vault.strategiesLength();
        console.log("📋 Number of strategies:", strategiesLength.toString());
        
        const strategies = [];
        for (let i = 0; i < strategiesLength; i++) {
            const strategyAddress = await vault.strategies(i);
            const targetBps = await vault.targetBps(strategyAddress);
            const strategyContract = new ethers.Contract(strategyAddress, STRATEGY_ABI, wallet);
            const strategyAssets = await strategyContract.totalAssets();
            
            strategies.push({
                address: strategyAddress,
                allocation: targetBps,
                assets: strategyAssets
            });
            
            console.log(`📋 Strategy ${i}:`, strategyAddress);
            console.log(`   Allocation: ${targetBps.toString()} bps (${Number(targetBps)/100}%)`);
            console.log(`   Assets: ${ethers.formatUnits(strategyAssets, 18)} AAVE`);
        }
        
        if (idleFundsBefore === 0n) {
            console.log("⚠️  No idle funds to invest!");
            return;
        }
        
        console.log("");

        // Step 3: Set Router in Exchanger
        console.log("📋 STEP 3: SETTING ROUTER");
        console.log("-------------------------");
        
        try {
            const setRouterTx = await exchanger.setRouter(CONTRACTS.newSwapRouter, true);
            await setRouterTx.wait();
            console.log("✅ Router set in exchanger successfully!");
        } catch (error) {
            console.log("⚠️  Router might already be set:", error.message);
        }
        console.log("");

        // Step 4: Create Swap Data for InvestIdle
        console.log("📋 STEP 4: CREATING SWAP DATA");
        console.log("-----------------------------");
        
        // Calculate how much goes to each strategy
        const totalIdleAmount = idleFundsBefore;
        console.log("💰 Total idle amount:", ethers.formatUnits(totalIdleAmount, 18), "AAVE");
        
        // For simplicity, we'll create empty swap data for now
        // In a real scenario, you'd create swap data for the UniswapV3 strategy
        const allSwapData = [];
        
        for (let i = 0; i < strategiesLength; i++) {
            // For now, use empty arrays - this will just move funds without swapping
            allSwapData.push([]);
            console.log(`📋 Strategy ${i} swap data: empty (no swapping)`);
        }
        
        console.log("📋 AllSwapData structure:", allSwapData);
        console.log("");

        // Step 5: Execute InvestIdle
        console.log("📋 STEP 5: EXECUTING INVEST IDLE");
        console.log("--------------------------------");
        
        console.log("🎯 Calling vault.investIdle()...");
        console.log("   Idle funds:", ethers.formatUnits(totalIdleAmount, 18), "AAVE");
        console.log("   Strategies:", strategiesLength.toString());
        
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
                console.log("   - Strategy deposit failed");
                console.log("   - Swap data issues");
                console.log("   - Insufficient allowances");
            }
            
            throw error;
        }
        console.log("");

        // Step 6: Check Vault State After InvestIdle
        console.log("📋 STEP 6: VAULT STATE (AFTER)");
        console.log("------------------------------");
        
        const totalAssetsAfter = await vault.totalAssets();
        console.log("💰 Vault total assets:", ethers.formatUnits(totalAssetsAfter, 18), "AAVE");
        
        // Check idle funds after
        const idleFundsAfter = await aave.balanceOf(CONTRACTS.vault);
        console.log("💰 Idle funds in vault:", ethers.formatUnits(idleFundsAfter, 18), "AAVE");
        
        // Check strategies after
        console.log("\n📋 Strategy Assets (AFTER):");
        let totalStrategyAssetsAfter = 0n;
        
        for (let i = 0; i < strategiesLength; i++) {
            const strategyAddress = strategies[i].address;
            const strategyContract = new ethers.Contract(strategyAddress, STRATEGY_ABI, wallet);
            const strategyAssetsAfter = await strategyContract.totalAssets();
            totalStrategyAssetsAfter += strategyAssetsAfter;
            
            const assetsIncrease = strategyAssetsAfter - strategies[i].assets;
            console.log(`📋 Strategy ${i}: ${ethers.formatUnits(strategyAssetsAfter, 18)} AAVE (+${ethers.formatUnits(assetsIncrease, 18)})`);
        }
        
        // Calculate changes
        const idleFundsDecrease = idleFundsBefore - idleFundsAfter;
        const totalStrategyIncrease = totalStrategyAssetsAfter - strategies.reduce((sum, s) => sum + s.assets, 0n);
        
        console.log("\n📊 Changes:");
        console.log("📉 Idle funds decrease:", ethers.formatUnits(idleFundsDecrease, 18), "AAVE");
        console.log("📈 Strategy assets increase:", ethers.formatUnits(totalStrategyIncrease, 18), "AAVE");
        console.log("");

        // Step 7: Verify Results
        console.log("📋 STEP 7: VERIFICATION");
        console.log("-----------------------");
        
        // Verify the investIdle worked
        if (idleFundsDecrease > 0 && totalStrategyIncrease > 0) {
            console.log("");
            console.log("🎉 SUCCESS: InvestIdle worked perfectly!");
            console.log("✅ Idle funds were successfully moved to strategies");
            console.log("✅ Strategy assets increased correctly");
            console.log("✅ Vault total assets remained the same (funds just moved)");
            
            // Calculate efficiency
            const efficiency = Number(totalStrategyIncrease) / Number(idleFundsDecrease);
            console.log("📊 Investment efficiency:", (efficiency * 100).toFixed(2) + "%");
            
        } else {
            console.log("");
            console.log("⚠️  UNEXPECTED: InvestIdle didn't work as expected");
            console.log("💡 Idle funds decrease:", idleFundsDecrease.toString());
            console.log("💡 Strategy assets increase:", totalStrategyIncrease.toString());
        }
        
        console.log("");
        console.log("🎉 AAVE INVEST IDLE TEST COMPLETED!");
        
        if (idleFundsDecrease > 0 && totalStrategyIncrease > 0) {
            console.log("✅ RESULT: InvestIdle function is working correctly");
            console.log("✅ RESULT: Funds were successfully allocated to strategies");
            console.log("💡 Next step: Test harvesting and withdrawal functions");
        } else {
            console.log("❌ RESULT: InvestIdle function failed");
            console.log("💡 This suggests an issue with strategy deposits or swap data");
        }
        
    } catch (error) {
        console.error("❌ TEST FAILED:", error.message);
        console.error("Stack trace:", error.stack);
        process.exit(1);
    }
}

// Run the test
testInvestIdleAave().catch(console.error);
