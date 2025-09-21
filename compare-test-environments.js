const { ethers } = require("hardhat");
require("dotenv").config();

async function compareTestEnvironments() {
    try {
        console.log("=== COMPARING TEST ENVIRONMENTS ===");
        
        // Setup provider and wallet
        const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
        const wallet = new ethers.Wallet(process.env.PK, provider);
        
        // Contract addresses
        const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
        const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
        const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
        const UNI_STRATEGY_ADDRESS = "0xA87bFB6973b92685C66D2BDc37A670Ee995a4C3B";
        const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
        const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
        
        // Contract ABIs
        const exchangerABI = [
            "function routers(address) external view returns (bool)",
            "function setRouter(address router, bool allowed) external"
        ];
        
        const usdcABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function allowance(address owner, address spender) external view returns (uint256)",
            "function decimals() external view returns (uint8)"
        ];
        
        const exchanger = new ethers.Contract(EXCHANGER_ADDRESS, exchangerABI, wallet);
        const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);
        
        console.log("\n=== STEP 1: CHECKING EXCHANGER ROUTER SETUP ===");
        
        // Check if Uniswap V3 Router is allowed
        const routerAllowed = await exchanger.routers(UNISWAP_V3_ROUTER);
        console.log("Uniswap V3 Router allowed:", routerAllowed);
        
        if (!routerAllowed) {
            console.log("❌ Router not allowed - this could be the issue!");
            console.log("Setting router...");
            try {
                const setRouterTx = await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
                await setRouterTx.wait();
                console.log("✅ Router set successfully!");
                
                // Verify
                const routerAllowedAfter = await exchanger.routers(UNISWAP_V3_ROUTER);
                console.log("Router allowed after setting:", routerAllowedAfter);
            } catch (error) {
                console.log("❌ Failed to set router:", error.message);
            }
        } else {
            console.log("✅ Router is already allowed");
        }
        
        console.log("\n=== STEP 2: CHECKING TOKEN ALLOWANCES ===");
        
        // Check vault's allowance to strategy
        const vaultToStrategyAllowance = await usdc.allowance(VAULT_ADDRESS, UNI_STRATEGY_ADDRESS);
        console.log("Vault -> Strategy allowance:", ethers.formatUnits(vaultToStrategyAllowance, 6), "USDC");
        
        // Check strategy's allowance to exchanger
        const strategyToExchangerAllowance = await usdc.allowance(UNI_STRATEGY_ADDRESS, EXCHANGER_ADDRESS);
        console.log("Strategy -> Exchanger allowance:", ethers.formatUnits(strategyToExchangerAllowance, 6), "USDC");
        
        console.log("\n=== STEP 3: CHECKING TOKEN BALANCES ===");
        
        const vaultBalance = await usdc.balanceOf(VAULT_ADDRESS);
        const strategyBalance = await usdc.balanceOf(UNI_STRATEGY_ADDRESS);
        
        console.log("Vault USDC balance:", ethers.formatUnits(vaultBalance, 6), "USDC");
        console.log("Strategy USDC balance:", ethers.formatUnits(strategyBalance, 6), "USDC");
        
        console.log("\n=== STEP 4: SIMULATING THE EXACT WORKING TEST FLOW ===");
        
        // Simulate what the working test does
        console.log("Working test flow:");
        console.log("1. ✅ Sets router: await exchanger.setRouter(UNISWAP_V3_ROUTER, true)");
        console.log("2. ✅ Calls investIdle: await vault.connect(deployer).investIdle([[payload]])");
        console.log("3. ✅ Uses mock tokens (no real token issues)");
        
        console.log("\nOur test flow:");
        console.log("1. ✅ Sets router: await exchanger.setRouter(UNISWAP_V3_ROUTER, true)");
        console.log("2. ❌ Calls investIdle: await vault.investIdle([[], [payload]])");
        console.log("3. ❌ Uses real Sepolia tokens (potential issues)");
        
        console.log("\n=== STEP 5: KEY DIFFERENCES ANALYSIS ===");
        
        console.log("🔍 CRITICAL DIFFERENCES:");
        console.log("1. **Token Type**: Mock vs Real");
        console.log("   - Mock tokens: Simple ERC20, no special behavior");
        console.log("   - Real USDC: May have transfer restrictions, blacklists, etc.");
        
        console.log("\n2. **Network**: Local fork vs Real Sepolia");
        console.log("   - Local fork: Controlled environment, no network issues");
        console.log("   - Real Sepolia: Network latency, RPC issues, etc.");
        
        console.log("\n3. **Strategy Allocation**:");
        console.log("   - Working: 100% to UniswapV3Strategy");
        console.log("   - Ours: 40% to UniswapV3Strategy, 60% to AaveV3Strategy (0%)");
        
        console.log("\n=== STEP 6: TESTING REAL USDC BEHAVIOR ===");
        
        // Test if we can interact with real USDC
        try {
            const usdcDecimals = await usdc.decimals();
            console.log("✅ USDC decimals:", usdcDecimals);
            
            // Test a simple balance check
            const testBalance = await usdc.balanceOf(wallet.address);
            console.log("✅ Wallet USDC balance:", ethers.formatUnits(testBalance, usdcDecimals), "USDC");
            
        } catch (error) {
            console.log("❌ USDC interaction failed:", error.message);
        }
        
        console.log("\n=== STEP 7: RECOMMENDATIONS ===");
        
        console.log("🔧 TO FIX THE ISSUE:");
        console.log("1. **Verify router is set** (we checked this above)");
        console.log("2. **Check if real USDC has restrictions**");
        console.log("3. **Test with smaller amounts**");
        console.log("4. **Check if the issue is in the ExchangeHandler.swap call**");
        
        console.log("\n🎯 MOST LIKELY ISSUE:");
        console.log("The real USDC token on Sepolia may have different behavior");
        console.log("than mock tokens, causing the ExchangeHandler.swap to fail");
        console.log("with 'transfer amount exceeds allowance'");
        
    } catch (error) {
        console.error("Comparison failed:", error);
    }
}

compareTestEnvironments();
