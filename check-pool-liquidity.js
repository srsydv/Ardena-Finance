const { ethers } = require("hardhat");
require("dotenv").config();

async function checkPoolLiquidity() {
    console.log("=== CHECKING SEPOLIA USDC/WETH POOL LIQUIDITY ===");
    
    // Contract addresses
    const POOL_ADDRESS = "0xE85292C7BeDF830071cC1C8F7b5aaB5A5391B50A";
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
    const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
    
    // Setup
    const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
    const wallet = new ethers.Wallet(process.env.PK, provider);
    
    console.log("Wallet:", wallet.address);
    console.log("Pool:", POOL_ADDRESS);
    
    // Contract ABIs
    const poolABI = [
        "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
        "function liquidity() view returns (uint128)",
        "function token0() view returns (address)",
        "function token1() view returns (address)",
        "function fee() view returns (uint24)"
    ];
    
    const usdcABI = [
        "function balanceOf(address) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
        "function symbol() external view returns (string)"
    ];
    
    const wethABI = [
        "function balanceOf(address) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
        "function symbol() external view returns (string)"
    ];
    
    const routerABI = [
        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
    ];
    
    // Initialize contracts
    const pool = new ethers.Contract(POOL_ADDRESS, poolABI, wallet);
    const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);
    const weth = new ethers.Contract(WETH_ADDRESS, wethABI, wallet);
    const router = new ethers.Contract(UNISWAP_V3_ROUTER, routerABI, wallet);
    
    // === STEP 1: CHECK POOL STATE ===
    console.log("\n=== STEP 1: POOL STATE ===");
    
    try {
        const slot0 = await pool.slot0();
        const liquidity = await pool.liquidity();
        const token0 = await pool.token0();
        const token1 = await pool.token1();
        const fee = await pool.fee();
        
        console.log("Pool token0:", token0);
        console.log("Pool token1:", token1);
        console.log("Pool fee:", fee.toString());
        console.log("Current tick:", slot0.tick.toString());
        console.log("Current liquidity:", liquidity.toString());
        console.log("SqrtPriceX96:", slot0.sqrtPriceX96.toString());
        
        // Check which token is which
        const isUSDC0 = token0.toLowerCase() === USDC_ADDRESS.toLowerCase();
        const isWETH0 = token0.toLowerCase() === WETH_ADDRESS.toLowerCase();
        
        console.log("Token0 is USDC:", isUSDC0);
        console.log("Token0 is WETH:", isWETH0);
        
    } catch (error) {
        console.error("❌ Failed to get pool state:", error.message);
        return;
    }
    
    // === STEP 2: CHECK POOL BALANCES ===
    console.log("\n=== STEP 2: POOL BALANCES ===");
    
    try {
        const usdcBalance = await usdc.balanceOf(POOL_ADDRESS);
        const wethBalance = await weth.balanceOf(POOL_ADDRESS);
        
        console.log("Pool USDC balance:", ethers.formatUnits(usdcBalance, 6), "USDC");
        console.log("Pool WETH balance:", ethers.formatEther(wethBalance), "WETH");
        
        // Calculate total value in USDC
        const totalValueUSDC = usdcBalance + (wethBalance * ethers.parseUnits("100", 6)) / ethers.parseEther("1"); // Assuming 1 WETH = 100 USDC
        console.log("Estimated total pool value:", ethers.formatUnits(totalValueUSDC, 6), "USDC");
        
    } catch (error) {
        console.error("❌ Failed to get pool balances:", error.message);
    }
    
    // === STEP 3: TEST SWAP CAPACITY ===
    console.log("\n=== STEP 3: TEST SWAP CAPACITY ===");
    
    try {
        // Test different swap amounts to see what the pool can handle
        const testAmounts = [
            ethers.parseUnits("1", 6),    // 1 USDC
            ethers.parseUnits("10", 6),   // 10 USDC
            ethers.parseUnits("50", 6),   // 50 USDC
            ethers.parseUnits("100", 6),  // 100 USDC
            ethers.parseUnits("500", 6),  // 500 USDC
        ];
        
        console.log("Testing swap capacity...");
        
        for (const amountIn of testAmounts) {
            try {
                const deadline = Math.floor(Date.now() / 1000) + 1200;
                
                const params = {
                    tokenIn: USDC_ADDRESS,
                    tokenOut: WETH_ADDRESS,
                    fee: 500,
                    recipient: wallet.address,
                    deadline,
                    amountIn,
                    amountOutMinimum: 0n,
                    sqrtPriceLimitX96: 0n,
                };
                
                // Try to estimate the swap
                const gasEstimate = await router.exactInputSingle.estimateGas(params);
                console.log(`✅ Can swap ${ethers.formatUnits(amountIn, 6)} USDC (gas: ${gasEstimate.toString()})`);
                
            } catch (error) {
                console.log(`❌ Cannot swap ${ethers.formatUnits(amountIn, 6)} USDC: ${error.message}`);
                break; // Stop testing larger amounts if smaller ones fail
            }
        }
        
    } catch (error) {
        console.error("❌ Failed to test swap capacity:", error.message);
    }
    
    // === STEP 4: CHECK OUR INVEST IDLE REQUIREMENTS ===
    console.log("\n=== STEP 4: INVEST IDLE REQUIREMENTS ===");
    
    try {
        // Our investIdle sends 40 USDC to strategy, strategy swaps 20 USDC to WETH
        const requiredSwapAmount = ethers.parseUnits("20", 6); // 20 USDC
        console.log("Required swap amount for investIdle:", ethers.formatUnits(requiredSwapAmount, 6), "USDC");
        
        const deadline = Math.floor(Date.now() / 1000) + 1200;
        
        const params = {
            tokenIn: USDC_ADDRESS,
            tokenOut: WETH_ADDRESS,
            fee: 500,
            recipient: wallet.address,
            deadline,
            amountIn: requiredSwapAmount,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
        };
        
        // Test if we can perform the required swap
        const gasEstimate = await router.exactInputSingle.estimateGas(params);
        console.log("✅ Pool can handle required swap amount");
        console.log("Gas estimate:", gasEstimate.toString());
        
        // Try to get a quote for the swap
        try {
            const quote = await router.exactInputSingle.staticCall(params);
            console.log("Expected WETH output:", ethers.formatEther(quote), "WETH");
        } catch (error) {
            console.log("Could not get quote:", error.message);
        }
        
    } catch (error) {
        console.error("❌ Pool cannot handle required swap amount:", error.message);
        console.log("This is likely the cause of the 'missing revert data' error!");
        
        // === STEP 5: RECOMMENDATIONS ===
        console.log("\n=== STEP 5: RECOMMENDATIONS ===");
        console.log("The pool has insufficient liquidity for the required swap.");
        console.log("To fix this, you need to add liquidity to the pool.");
        console.log("\nYou can use your add-liquidity.js script to add liquidity:");
        console.log("1. Run: npx hardhat run add-liquidity.js --network sepolia");
        console.log("2. This will add 20 WETH + 2000 USDC to the pool");
        console.log("3. Then try investIdle() again");
        
        return;
    }
    
    // === STEP 6: CONCLUSION ===
    console.log("\n=== CONCLUSION ===");
    console.log("✅ Pool has sufficient liquidity for the required swap");
    console.log("The 'missing revert data' error is likely caused by something else.");
    console.log("Possible causes:");
    console.log("- ExchangeHandler configuration");
    console.log("- Strategy approval issues");
    console.log("- Other contract interaction problems");
    
    console.log("\n=== TEST COMPLETED ===");
}

checkPoolLiquidity()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });
