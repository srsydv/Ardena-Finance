/*
  Test direct USDC to WETH swap using the same pool and router.
  
  This will help determine if the issue is in the Uniswap V3 infrastructure
  or in the contract logic.
*/

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=== TESTING DIRECT USDC TO WETH SWAP ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Contract addresses
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
    const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
    const POOL_ADDRESS = "0xE85292C7BeDF830071cC1C8F7b5aaB5A5391B50A";
    const POOL_FEE = 500;
    
    try {
        // Initialize contracts
        const erc20ABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function symbol() external view returns (string)",
            "function decimals() external view returns (uint8)",
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function allowance(address owner, address spender) external view returns (uint256)",
        ];
        
        const poolABI = [
            "function token0() external view returns (address)",
            "function token1() external view returns (address)",
            "function fee() external view returns (uint24)",
            "function slot0() external view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
            "function liquidity() external view returns (uint128)",
        ];
        
        const routerABI = [
            "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
        ];
        
        const usdc = new ethers.Contract(USDC_ADDRESS, erc20ABI, deployer);
        const weth = new ethers.Contract(WETH_ADDRESS, erc20ABI, deployer);
        const pool = new ethers.Contract(POOL_ADDRESS, poolABI, deployer);
        const router = new ethers.Contract(UNISWAP_V3_ROUTER, routerABI, deployer);
        
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
        
        // Get token symbols
        const token0Symbol = await (new ethers.Contract(token0, erc20ABI, deployer)).symbol();
        const token1Symbol = await (new ethers.Contract(token1, erc20ABI, deployer)).symbol();
        
        console.log("Token0 symbol:", token0Symbol);
        console.log("Token1 symbol:", token1Symbol);
        
        console.log("\n=== STEP 2: CHECKING DEPLOYER BALANCES ===");
        
        const deployerUSDCBalance = await usdc.balanceOf(deployer.address);
        const deployerWETHBalance = await weth.balanceOf(deployer.address);
        
        console.log("Deployer USDC balance:", ethers.formatUnits(deployerUSDCBalance, 6), "USDC");
        console.log("Deployer WETH balance:", ethers.formatUnits(deployerWETHBalance, 18), "WETH");
        
        if (deployerUSDCBalance === 0n) {
            console.log("❌ No USDC balance - cannot test swap");
            return;
        }
        
        console.log("\n=== STEP 3: CHECKING ROUTER ALLOWANCE ===");
        
        const currentAllowance = await usdc.allowance(deployer.address, UNISWAP_V3_ROUTER);
        console.log("Current USDC allowance for router:", ethers.formatUnits(currentAllowance, 6), "USDC");
        
        if (currentAllowance === 0n) {
            console.log("Setting USDC allowance for router...");
            const approveTx = await usdc.approve(UNISWAP_V3_ROUTER, ethers.parseUnits("1000000", 6));
            await approveTx.wait();
            console.log("✅ USDC allowance set");
        }
        
        console.log("\n=== STEP 4: PREPARING SWAP PARAMETERS ===");
        
        // Use a small amount for testing
        const swapAmount = ethers.parseUnits("1", 6); // 1 USDC
        const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
        
        console.log("Swap amount:", ethers.formatUnits(swapAmount, 6), "USDC");
        console.log("Deadline:", deadline);
        
        // Determine swap direction based on pool tokens
        let tokenIn, tokenOut, amountIn, expectedTokenOut;
        
        if (token0.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
            // token0 = USDC, token1 = WETH
            tokenIn = USDC_ADDRESS;
            tokenOut = WETH_ADDRESS;
            amountIn = swapAmount;
            expectedTokenOut = "WETH";
        } else if (token1.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
            // token0 = WETH, token1 = USDC
            tokenIn = USDC_ADDRESS;
            tokenOut = WETH_ADDRESS;
            amountIn = swapAmount;
            expectedTokenOut = "WETH";
        } else {
            console.log("❌ USDC not found in pool tokens");
            return;
        }
        
        console.log("Swap direction: USDC -> WETH");
        console.log("TokenIn:", tokenIn);
        console.log("TokenOut:", tokenOut);
        console.log("AmountIn:", ethers.formatUnits(amountIn, 6), "USDC");
        
        console.log("\n=== STEP 5: TESTING SWAP ===");
        
        try {
            console.log("Attempting direct swap...");
            
            const swapParams = {
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: POOL_FEE,
                recipient: deployer.address,
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: 0n, // For testing only
                sqrtPriceLimitX96: 0n,
            };
            
            console.log("Swap parameters:", swapParams);
            
            // Try static call first
            console.log("Testing with static call...");
            const estimatedOut = await router.exactInputSingle.staticCall(swapParams);
            console.log("✅ Static call successful!");
            console.log("Estimated WETH output:", ethers.formatUnits(estimatedOut, 18), "WETH");
            
            // If static call succeeds, try the actual transaction
            console.log("Executing actual swap...");
            const swapTx = await router.exactInputSingle(swapParams);
            console.log("Swap transaction sent:", swapTx.hash);
            
            const receipt = await swapTx.wait();
            console.log("Swap transaction confirmed:", receipt.hash);
            console.log("Gas used:", receipt.gasUsed.toString());
            console.log("Status:", receipt.status);
            
            if (receipt.status === 1) {
                console.log("🎉 SWAP SUCCESSFUL!");
                
                // Check balances after swap
                const newUSDCBalance = await usdc.balanceOf(deployer.address);
                const newWETHBalance = await weth.balanceOf(deployer.address);
                
                console.log("\n=== STEP 6: CHECKING RESULTS ===");
                console.log("New USDC balance:", ethers.formatUnits(newUSDCBalance, 6), "USDC");
                console.log("New WETH balance:", ethers.formatUnits(newWETHBalance, 18), "WETH");
                
                const usdcUsed = deployerUSDCBalance - newUSDCBalance;
                const wethGained = newWETHBalance - deployerWETHBalance;
                
                console.log("USDC used:", ethers.formatUnits(usdcUsed, 6), "USDC");
                console.log("WETH gained:", ethers.formatUnits(wethGained, 18), "WETH");
                
                if (wethGained > 0n) {
                    console.log("✅ Swap completed successfully!");
                    console.log("💡 This means the Uniswap V3 infrastructure is working correctly");
                    console.log("💡 The issue is likely in your contract logic, not the pool/router");
                } else {
                    console.log("❌ No WETH gained - swap may have failed");
                }
                
            } else {
                console.log("❌ Swap transaction failed");
            }
            
        } catch (error) {
            console.log("❌ Swap failed:", error.message);
            
            if (error.message.includes("execution reverted")) {
                console.log("This suggests an issue with the Uniswap V3 infrastructure");
                
                // Try to decode the revert reason
                try {
                    if (error.data && error.data.startsWith("0x08c379a0")) {
                        const reason = ethers.AbiCoder.defaultAbiCoder().decode(
                            ["string"],
                            "0x" + error.data.slice(10)
                        )[0];
                        console.log("Revert reason:", reason);
                    }
                } catch (decodeError) {
                    console.log("Could not decode revert reason");
                }
            }
            
            if (error.message.includes("insufficient")) {
                console.log("💡 This suggests insufficient liquidity or balance");
            }
            
            if (error.message.includes("deadline")) {
                console.log("💡 This suggests a deadline issue");
            }
            
            if (error.message.includes("slippage")) {
                console.log("💡 This suggests a slippage issue");
            }
        }
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        throw error;
    }
    
    console.log("\n🎉 DIRECT SWAP TEST COMPLETED!");
    console.log("\n📋 SUMMARY:");
    console.log("If swap succeeds → Issue is in your contract logic");
    console.log("If swap fails → Issue is in Uniswap V3 infrastructure");
}

main().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
});
