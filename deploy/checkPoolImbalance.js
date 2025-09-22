/*
  Check the pool imbalance and understand why there's only 141 USDC instead of ~6000 USDC.
  
  This will help us understand the pool's current state and price.
*/

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=== CHECKING POOL IMBALANCE ===");
    
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
        
        console.log("\n=== STEP 1: CHECKING POOL STATE ===");
        
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
        
        console.log("\n=== STEP 2: CHECKING POOL BALANCES ===");
        
        const poolToken0Balance = await (new ethers.Contract(token0, erc20ABI, deployer)).balanceOf(POOL_ADDRESS);
        const poolToken1Balance = await (new ethers.Contract(token1, erc20ABI, deployer)).balanceOf(POOL_ADDRESS);
        
        console.log(`Pool ${token0Symbol} balance:`, ethers.formatUnits(poolToken0Balance, token0Decimals), token0Symbol);
        console.log(`Pool ${token1Symbol} balance:`, ethers.formatUnits(poolToken1Balance, token1Decimals), token1Symbol);
        
        console.log("\n=== STEP 3: CALCULATING CURRENT PRICE ===");
        
        // Calculate price from sqrtPriceX96
        const sqrtPriceX96 = slot0[0];
        const Q96 = 1n << 96n;
        const Q192 = Q96 * Q96;
        
        console.log("SqrtPriceX96:", sqrtPriceX96.toString());
        
        // Calculate price based on token order
        let price;
        if (token0.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
            // token0 = WETH, token1 = USDC
            // price = (sqrtPriceX96 / Q96)^2 * (10^decimals1 / 10^decimals0)
            const priceX96 = (sqrtPriceX96 * sqrtPriceX96) / Q192;
            const decimalsRatio = (10n ** BigInt(token1Decimals)) / (10n ** BigInt(token0Decimals));
            price = (priceX96 * decimalsRatio) / (Q96 * Q96);
            console.log("Price calculation: WETH per USDC");
        } else {
            // token0 = USDC, token1 = WETH  
            // price = (Q96 / sqrtPriceX96)^2 * (10^decimals0 / 10^decimals1)
            const priceX96 = (Q192 * Q192) / (sqrtPriceX96 * sqrtPriceX96);
            const decimalsRatio = (10n ** BigInt(token0Decimals)) / (10n ** BigInt(token1Decimals));
            price = (priceX96 * decimalsRatio) / (Q96 * Q96);
            console.log("Price calculation: USDC per WETH");
        }
        
        console.log("Calculated price:", price.toString());
        
        // Convert to human readable format
        if (token0.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
            // WETH per USDC
            const wethPerUsdc = Number(price) / 1e18;
            const usdcPerWeth = 1 / wethPerUsdc;
            console.log(`Current price: 1 USDC = ${wethPerUsdc.toFixed(8)} WETH`);
            console.log(`Current price: 1 WETH = ${usdcPerWeth.toFixed(2)} USDC`);
        } else {
            // USDC per WETH
            const usdcPerWeth = Number(price) / 1e6;
            console.log(`Current price: 1 WETH = ${usdcPerWeth.toFixed(2)} USDC`);
        }
        
        console.log("\n=== STEP 4: ANALYZING THE IMBALANCE ===");
        
        // Expected balances based on price
        if (token0.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
            // token0 = WETH, token1 = USDC
            const wethBalance = Number(ethers.formatUnits(poolToken0Balance, token0Decimals));
            const usdcBalance = Number(ethers.formatUnits(poolToken1Balance, token1Decimals));
            
            console.log(`Actual WETH balance: ${wethBalance.toFixed(6)} WETH`);
            console.log(`Actual USDC balance: ${usdcBalance.toFixed(2)} USDC`);
            
            // Calculate expected USDC based on current price
            const expectedUsdc = wethBalance * (Number(price) / 1e6);
            console.log(`Expected USDC balance: ${expectedUsdc.toFixed(2)} USDC`);
            
            const imbalance = usdcBalance - expectedUsdc;
            console.log(`USDC imbalance: ${imbalance.toFixed(2)} USDC`);
            
            if (Math.abs(imbalance) > 100) {
                console.log("❌ SIGNIFICANT IMBALANCE DETECTED!");
                console.log("The pool is severely imbalanced");
                console.log("This explains why swaps are failing");
            }
            
        } else {
            // token0 = USDC, token1 = WETH
            const usdcBalance = Number(ethers.formatUnits(poolToken0Balance, token0Decimals));
            const wethBalance = Number(ethers.formatUnits(poolToken1Balance, token1Decimals));
            
            console.log(`Actual USDC balance: ${usdcBalance.toFixed(2)} USDC`);
            console.log(`Actual WETH balance: ${wethBalance.toFixed(6)} WETH`);
            
            // Calculate expected WETH based on current price
            const expectedWeth = usdcBalance / (Number(price) / 1e6);
            console.log(`Expected WETH balance: ${expectedWeth.toFixed(6)} WETH`);
            
            const imbalance = wethBalance - expectedWeth;
            console.log(`WETH imbalance: ${imbalance.toFixed(6)} WETH`);
            
            if (Math.abs(imbalance) > 1) {
                console.log("❌ SIGNIFICANT IMBALANCE DETECTED!");
                console.log("The pool is severely imbalanced");
                console.log("This explains why swaps are failing");
            }
        }
        
        console.log("\n=== STEP 5: DIAGNOSIS ===");
        
        console.log("🎯 ISSUE IDENTIFIED:");
        console.log("The pool is severely imbalanced!");
        console.log("This means:");
        console.log("1. The current price is very different from the expected 1 WETH = 100 USDC");
        console.log("2. The pool has too much of one token and too little of the other");
        console.log("3. Swaps fail because there's insufficient liquidity in the desired direction");
        console.log("4. The pool needs rebalancing to work properly");
        
        console.log("\n💡 SOLUTIONS:");
        console.log("1. **Rebalance the pool** by adding the missing token");
        console.log("2. **Create a new pool** with proper initial balance");
        console.log("3. **Use a different pool** that's properly balanced");
        console.log("4. **Wait for arbitrageurs** to rebalance the pool");
        
        console.log("\n🚀 RECOMMENDATION:");
        console.log("Create a new pool with proper initial balance:");
        console.log("- Add 1 WETH and 100 USDC initially");
        console.log("- This will set the correct price of 1 WETH = 100 USDC");
        console.log("- Then your swaps will work properly");
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        throw error;
    }
    
    console.log("\n🎉 POOL IMBALANCE ANALYSIS COMPLETED!");
}

main().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
});
