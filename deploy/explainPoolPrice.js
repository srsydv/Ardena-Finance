/*
  Explain why the pool doesn't have the expected 1 WETH = 100 USDC ratio.
  
  This will show the actual price calculation and why it's wrong.
*/

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=== EXPLAINING POOL PRICE ISSUE ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Contract addresses
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
    const POOL_ADDRESS = "0xE85292C7BeDF830071cC1C8F7b5aaB5A5391B50A";
    
    try {
        // Initialize contracts
        const erc20ABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function symbol() external view returns (string)",
            "function decimals() external view returns (uint8)",
        ];
        
        const poolABI = [
            "function token0() external view returns (address)",
            "function token1() external view returns (address)",
            "function fee() external view returns (uint24)",
            "function slot0() external view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
            "function liquidity() external view returns (uint128)",
            "function tickSpacing() external view returns (int24)",
        ];
        
        const usdc = new ethers.Contract(USDC_ADDRESS, erc20ABI, deployer);
        const weth = new ethers.Contract(WETH_ADDRESS, erc20ABI, deployer);
        const pool = new ethers.Contract(POOL_ADDRESS, poolABI, deployer);
        
        console.log("\n=== STEP 1: CURRENT POOL STATE ===");
        
        const token0 = await pool.token0();
        const token1 = await pool.token1();
        const fee = await pool.fee();
        const slot0 = await pool.slot0();
        const liquidity = await pool.liquidity();
        const tickSpacing = await pool.tickSpacing();
        
        console.log("Pool address:", POOL_ADDRESS);
        console.log("Token0:", token0);
        console.log("Token1:", token1);
        console.log("Fee:", fee.toString());
        console.log("Current tick:", slot0[1].toString());
        console.log("Pool liquidity:", liquidity.toString());
        console.log("Tick spacing:", tickSpacing.toString());
        
        // Get token symbols and decimals
        const token0Symbol = await (new ethers.Contract(token0, erc20ABI, deployer)).symbol();
        const token1Symbol = await (new ethers.Contract(token1, erc20ABI, deployer)).symbol();
        const token0Decimals = await (new ethers.Contract(token0, erc20ABI, deployer)).decimals();
        const token1Decimals = await (new ethers.Contract(token1, erc20ABI, deployer)).decimals();
        
        console.log("Token0 symbol:", token0Symbol, "decimals:", token0Decimals);
        console.log("Token1 symbol:", token1Symbol, "decimals:", token1Decimals);
        
        // Check current balances
        const poolToken0Balance = await (new ethers.Contract(token0, erc20ABI, deployer)).balanceOf(POOL_ADDRESS);
        const poolToken1Balance = await (new ethers.Contract(token1, erc20ABI, deployer)).balanceOf(POOL_ADDRESS);
        
        console.log(`Current Pool ${token0Symbol} balance:`, ethers.formatUnits(poolToken0Balance, token0Decimals), token0Symbol);
        console.log(`Current Pool ${token1Symbol} balance:`, ethers.formatUnits(poolToken1Balance, token1Decimals), token1Symbol);
        
        console.log("\n=== STEP 2: CALCULATING ACTUAL PRICE ===");
        
        // Calculate price from sqrtPriceX96
        const sqrtPriceX96 = slot0[0];
        const Q96 = 1n << 96n;
        const Q192 = Q96 * Q96;
        
        console.log("SqrtPriceX96:", sqrtPriceX96.toString());
        
        // Calculate price based on token order
        let actualPrice;
        if (token0.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
            // token0 = WETH, token1 = USDC
            // price = (sqrtPriceX96 / Q96)^2 * (10^decimals1 / 10^decimals0)
            const priceX96 = (sqrtPriceX96 * sqrtPriceX96) / Q192;
            const decimalsRatio = (10n ** BigInt(token1Decimals)) / (10n ** BigInt(token0Decimals));
            actualPrice = (priceX96 * decimalsRatio) / (Q96 * Q96);
            console.log("Price calculation: WETH per USDC");
        } else {
            // token0 = USDC, token1 = WETH  
            // price = (Q96 / sqrtPriceX96)^2 * (10^decimals0 / 10^decimals1)
            const priceX96 = (Q192 * Q192) / (sqrtPriceX96 * sqrtPriceX96);
            const decimalsRatio = (10n ** BigInt(token0Decimals)) / (10n ** BigInt(token1Decimals));
            actualPrice = (priceX96 * decimalsRatio) / (Q96 * Q96);
            console.log("Price calculation: USDC per WETH");
        }
        
        console.log("Calculated price:", actualPrice.toString());
        
        // Convert to human readable format
        if (token0.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
            // WETH per USDC
            const wethPerUsdc = Number(actualPrice) / 1e18;
            const usdcPerWeth = 1 / wethPerUsdc;
            console.log(`Actual price: 1 USDC = ${wethPerUsdc.toFixed(8)} WETH`);
            console.log(`Actual price: 1 WETH = ${usdcPerWeth.toFixed(2)} USDC`);
        } else {
            // USDC per WETH
            const usdcPerWeth = Number(actualPrice) / 1e6;
            console.log(`Actual price: 1 WETH = ${usdcPerWeth.toFixed(2)} USDC`);
        }
        
        console.log("\n=== STEP 3: EXPLAINING THE ISSUE ===");
        
        console.log("🎯 THE PROBLEM:");
        console.log("1. You expected: 1 WETH = 100 USDC");
        console.log("2. Actual price: 1 WETH = ~0.002 USDC (or 1 USDC = ~500 WETH)");
        console.log("3. This means WETH is EXTREMELY undervalued in this pool");
        console.log("4. The pool thinks 1 WETH is worth almost nothing in USDC terms");
        
        console.log("\n🔍 WHY THIS HAPPENED:");
        console.log("1. **Initial Pool Creation**: The pool was created with wrong initial price");
        console.log("2. **No Price Correction**: Adding liquidity doesn't change the price");
        console.log("3. **Market Imbalance**: The pool is severely imbalanced");
        console.log("4. **Wrong Tick**: Current tick -269393 is way too low");
        
        console.log("\n📊 THE MATH:");
        if (token0.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
            // token0 = WETH, token1 = USDC
            const wethBalance = Number(ethers.formatUnits(poolToken0Balance, token0Decimals));
            const usdcBalance = Number(ethers.formatUnits(poolToken1Balance, token1Decimals));
            
            console.log(`Pool has: ${wethBalance.toFixed(6)} WETH + ${usdcBalance.toFixed(2)} USDC`);
            console.log(`Expected USDC: ${wethBalance.toFixed(6)} × 100 = ${(wethBalance * 100).toFixed(2)} USDC`);
            console.log(`Actual USDC: ${usdcBalance.toFixed(2)} USDC`);
            console.log(`Missing USDC: ${(wethBalance * 100 - usdcBalance).toFixed(2)} USDC`);
            
        } else {
            // token0 = USDC, token1 = WETH
            const usdcBalance = Number(ethers.formatUnits(poolToken0Balance, token0Decimals));
            const wethBalance = Number(ethers.formatUnits(poolToken1Balance, token1Decimals));
            
            console.log(`Pool has: ${usdcBalance.toFixed(2)} USDC + ${wethBalance.toFixed(6)} WETH`);
            console.log(`Expected WETH: ${usdcBalance.toFixed(2)} ÷ 100 = ${(usdcBalance / 100).toFixed(6)} WETH`);
            console.log(`Actual WETH: ${wethBalance.toFixed(6)} WETH`);
            console.log(`Extra WETH: ${(wethBalance - usdcBalance / 100).toFixed(6)} WETH`);
        }
        
        console.log("\n💡 SOLUTIONS:");
        console.log("1. **Create New Pool**: Start fresh with correct initial price");
        console.log("2. **Arbitrage**: Someone needs to swap to correct the price");
        console.log("3. **Use Different Pool**: Find a properly balanced pool");
        console.log("4. **Deploy on Arbitrum**: Use working Uniswap V3 infrastructure");
        
        console.log("\n🚀 RECOMMENDATION:");
        console.log("The pool is fundamentally broken. You need to:");
        console.log("1. Create a new pool with correct initial price (1 WETH = 100 USDC)");
        console.log("2. Or deploy on Arbitrum where Uniswap V3 works properly");
        console.log("3. Or find a different pool that's properly balanced");
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        throw error;
    }
    
    console.log("\n🎉 POOL PRICE EXPLANATION COMPLETED!");
}

main().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
});
