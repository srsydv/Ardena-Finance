/*
  Test pool liquidity and try different swap approaches.
  
  This will help determine if the pool has sufficient liquidity for swaps.
*/

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=== TESTING POOL LIQUIDITY ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Contract addresses
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
    const POOL_ADDRESS = "0xE85292C7BeDF830071cC1C8F7b5aaB5A5391B50A";
    const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"; // Sepolia QuoterV2
    
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
        ];
        
        const quoterABI = [
            "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
        ];
        
        const usdc = new ethers.Contract(USDC_ADDRESS, erc20ABI, deployer);
        const weth = new ethers.Contract(WETH_ADDRESS, erc20ABI, deployer);
        const pool = new ethers.Contract(POOL_ADDRESS, poolABI, deployer);
        const quoter = new ethers.Contract(QUOTER_V2, quoterABI, deployer);
        
        console.log("\n=== STEP 1: CHECKING POOL STATE ===");
        
        const token0 = await pool.token0();
        const token1 = await pool.token1();
        const fee = await pool.fee();
        const slot0 = await pool.slot0();
        const liquidity = await pool.liquidity();
        
        console.log("Pool address:", POOL_ADDRESS);
        console.log("Token0:", token0);
        console.log("Token1:", token1);
        console.log("Fee:", fee.toString());
        console.log("Current tick:", slot0[1].toString());
        console.log("Pool liquidity:", liquidity.toString());
        
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
        
        if (poolToken0Balance === 0n || poolToken1Balance === 0n) {
            console.log("❌ Pool has zero balance for one or both tokens");
            console.log("💡 This explains why swaps are failing");
            return;
        }
        
        console.log("\n=== STEP 3: TESTING QUOTER ===");
        
        try {
            const swapAmount = ethers.parseUnits("1", 6); // 1 USDC
            const POOL_FEE = 500;
            
            console.log("Testing quoter with 1 USDC...");
            
            const quoteParams = {
                tokenIn: USDC_ADDRESS,
                tokenOut: WETH_ADDRESS,
                amountIn: swapAmount,
                fee: POOL_FEE,
                sqrtPriceLimitX96: 0n,
            };
            
            console.log("Quote parameters:", quoteParams);
            
            const quoteResult = await quoter.quoteExactInputSingle.staticCall(quoteParams);
            console.log("✅ Quoter successful!");
            console.log("Amount out:", ethers.formatUnits(quoteResult[0], 18), "WETH");
            console.log("Sqrt price after:", quoteResult[1].toString());
            console.log("Initialized ticks crossed:", quoteResult[2].toString());
            console.log("Gas estimate:", quoteResult[3].toString());
            
        } catch (error) {
            console.log("❌ Quoter failed:", error.message);
            
            if (error.message.includes("execution reverted")) {
                console.log("💡 This suggests the pool doesn't have enough liquidity for the swap");
            }
        }
        
        console.log("\n=== STEP 4: TESTING SMALLER AMOUNTS ===");
        
        try {
            const smallAmount = ethers.parseUnits("0.01", 6); // 0.01 USDC
            const POOL_FEE = 500;
            
            console.log("Testing quoter with 0.01 USDC...");
            
            const quoteParams = {
                tokenIn: USDC_ADDRESS,
                tokenOut: WETH_ADDRESS,
                amountIn: smallAmount,
                fee: POOL_FEE,
                sqrtPriceLimitX96: 0n,
            };
            
            const quoteResult = await quoter.quoteExactInputSingle.staticCall(quoteParams);
            console.log("✅ Small amount quoter successful!");
            console.log("Amount out:", ethers.formatUnits(quoteResult[0], 18), "WETH");
            
        } catch (error) {
            console.log("❌ Small amount quoter failed:", error.message);
        }
        
        console.log("\n=== STEP 5: CHECKING PRICE RANGE ===");
        
        // Check if the current tick is within reasonable bounds
        const currentTick = Number(slot0[1]);
        const minTick = -887272;
        const maxTick = 887272;
        
        console.log("Current tick:", currentTick);
        console.log("Min tick:", minTick);
        console.log("Max tick:", maxTick);
        
        if (currentTick < minTick || currentTick > maxTick) {
            console.log("❌ Current tick is outside valid range");
        } else {
            console.log("✅ Current tick is within valid range");
        }
        
        console.log("\n=== STEP 6: DIAGNOSIS ===");
        
        if (poolToken0Balance === 0n || poolToken1Balance === 0n) {
            console.log("🎯 ISSUE IDENTIFIED:");
            console.log("The pool has insufficient liquidity");
            console.log("This explains why your investIdle is failing");
            console.log("The strategy tries to create a position but there's no liquidity to swap");
            
            console.log("\n💡 SOLUTIONS:");
            console.log("1. Add liquidity to the pool first");
            console.log("2. Use a different pool with more liquidity");
            console.log("3. Modify the strategy to handle low liquidity scenarios");
            
        } else if (liquidity === 0n) {
            console.log("🎯 ISSUE IDENTIFIED:");
            console.log("The pool has zero active liquidity");
            console.log("This means no swaps can be executed");
            
        } else {
            console.log("✅ Pool appears to have liquidity");
            console.log("The issue might be elsewhere in the contract logic");
        }
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        throw error;
    }
    
    console.log("\n🎉 POOL LIQUIDITY TEST COMPLETED!");
}

main().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
});
