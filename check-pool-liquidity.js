import hre from "hardhat";
const { ethers } = hre;
import dotenv from "dotenv";
dotenv.config();

async function checkPoolLiquidity() {
    console.log("=== CHECKING SEPOLIA AAVE/WETH POOL LIQUIDITY ===");
    
    // Contract addresses
    const POOL_ADDRESS = "0x6eFCe0a593782545fe1bE3fF0abce18dC8181a3c";
    const AAVE_ADDRESS = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a";
    const WETH_ADDRESS = "0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762";
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
    
    const aaveABI = [
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
    const aave = new ethers.Contract(AAVE_ADDRESS, aaveABI, wallet);
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
        const isAAVE0 = token0.toLowerCase() === AAVE_ADDRESS.toLowerCase();
        const isWETH0 = token0.toLowerCase() === WETH_ADDRESS.toLowerCase();
        
        console.log("Token0 is AAVE:", isAAVE0);
        console.log("Token0 is WETH:", isWETH0);
        
    } catch (error) {
        console.error("❌ Failed to get pool state:", error.message);
        return;
    }
    
    // === STEP 2: CHECK POOL BALANCES ===
    console.log("\n=== STEP 2: POOL BALANCES ===");
    
    try {
        const aaveBalance = await aave.balanceOf(POOL_ADDRESS);
        const wethBalance = await weth.balanceOf(POOL_ADDRESS);
        
        console.log("Pool AAVE balance:", ethers.formatUnits(aaveBalance, 6), "AAVE");
        console.log("Pool WETH balance:", ethers.formatEther(wethBalance), "WETH");
        
        // Calculate total value in WETH (assuming 1 AAVE = 0.01 WETH based on current price)
        const aaveInWETH = (aaveBalance * ethers.parseUnits("0.01", 18)) / ethers.parseUnits("1", 6);
        const totalValueWETH = wethBalance + aaveInWETH;
        console.log("Estimated total pool value:", ethers.formatEther(totalValueWETH), "WETH");
        
    } catch (error) {
        console.error("❌ Failed to get pool balances:", error.message);
    }
    
    // === STEP 3: TEST SWAP CAPACITY ===
    console.log("\n=== STEP 3: TEST SWAP CAPACITY ===");
    
    try {
        // Test different swap amounts to see what the pool can handle
        const testAmounts = [
            ethers.parseUnits("1", 6),    // 1 AAVE
            ethers.parseUnits("10", 6),   // 10 AAVE
            ethers.parseUnits("50", 6),   // 50 AAVE
            ethers.parseUnits("100", 6),  // 100 AAVE
            ethers.parseUnits("500", 6),  // 500 AAVE
        ];
        
        console.log("Testing swap capacity...");
        
        for (const amountIn of testAmounts) {
            try {
                const deadline = Math.floor(Date.now() / 1000) + 1200;
                
                const params = {
                    tokenIn: AAVE_ADDRESS,
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
                console.log(`✅ Can swap ${ethers.formatUnits(amountIn, 6)} AAVE (gas: ${gasEstimate.toString()})`);
                
            } catch (error) {
                console.log(`❌ Cannot swap ${ethers.formatUnits(amountIn, 6)} AAVE: ${error.message}`);
                break; // Stop testing larger amounts if smaller ones fail
            }
        }
        
    } catch (error) {
        console.error("❌ Failed to test swap capacity:", error.message);
    }
    
    // === STEP 4: CHECK OUR INVEST IDLE REQUIREMENTS ===
    console.log("\n=== STEP 4: INVEST IDLE REQUIREMENTS ===");
    
    try {
        // Our investIdle sends AAVE to strategy, strategy swaps AAVE to WETH
        const requiredSwapAmount = ethers.parseUnits("100", 6); // 100 AAVE
        console.log("Required swap amount for investIdle:", ethers.formatUnits(requiredSwapAmount, 6), "AAVE");
        
        const deadline = Math.floor(Date.now() / 1000) + 1200;
        
        const params = {
            tokenIn: AAVE_ADDRESS,
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
        console.log("2. This will add 10 WETH + 100 AAVE to the pool");
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
