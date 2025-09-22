const { ethers } = require("hardhat");
require("dotenv").config();

async function testFinalInvestIdle() {
    console.log("=== FINAL INVEST IDLE TEST ===");
    
    // Contract addresses
    const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
    const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
    const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
    const ACTIVE_STRATEGY_ADDRESS = "0xe7bA69Ffbc10Be7c5dA5776d768d5eF6a34Aa191";
    
    // Setup
    const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
    const wallet = new ethers.Wallet(process.env.PK, provider);
    
    console.log("Wallet:", wallet.address);
    
    // Contract ABIs
    const vaultABI = [
        "function investIdle(bytes[][] calldata allSwapData) external",
        "function strategiesLength() external view returns (uint256)",
        "function strategies(uint256) external view returns (address)",
        "function targetBps(address) external view returns (uint16)",
        "function asset() external view returns (address)"
    ];
    
    const exchangerABI = [
        "function setRouter(address router, bool allowed) external"
    ];
    
    const usdcABI = [
        "function balanceOf(address) external view returns (uint256)",
        "function allowance(address, address) external view returns (uint256)"
    ];
    
    // Initialize contracts
    const vault = new ethers.Contract(VAULT_ADDRESS, vaultABI, wallet);
    const exchanger = new ethers.Contract(EXCHANGER_ADDRESS, exchangerABI, wallet);
    const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);
    
    // === STEP 1: PREPARE THE EXACT PAYLOAD ===
    console.log("\n=== STEP 1: PREPARE EXACT PAYLOAD ===");
    
    const vaultBalance = await usdc.balanceOf(VAULT_ADDRESS);
    console.log("Vault USDC balance:", ethers.formatUnits(vaultBalance, 6), "USDC");
    
    // Get strategies
    const strategiesLength = await vault.strategiesLength();
    const strategies = [];
    for (let i = 0; i < strategiesLength; i++) {
        const strategyAddress = await vault.strategies(i);
        strategies.push(strategyAddress);
    }
    
    // Find active strategy
    let activeStrategyIndex = -1;
    let targetBps = 0;
    for (let i = 0; i < strategies.length; i++) {
        const bps = await vault.targetBps(strategies[i]);
        if (bps > 0) {
            activeStrategyIndex = i;
            targetBps = bps;
            break;
        }
    }
    
    console.log("Active strategy index:", activeStrategyIndex);
    console.log("Target BPS:", targetBps.toString());
    
    // Create swap payload
    const amountToSend = (vaultBalance * BigInt(targetBps)) / 10000n;
    const amountToSwap = amountToSend / 2n;
    
    console.log("Amount to send to strategy:", ethers.formatUnits(amountToSend, 6), "USDC");
    console.log("Amount to swap (USDC -> WETH):", ethers.formatUnits(amountToSwap, 6), "USDC");
    
    // Create Uniswap V3 swap payload
    const swapRouterABI = [
        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
    ];
    
    const swapRouterInterface = new ethers.Interface(swapRouterABI);
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    
    const params = {
        tokenIn: USDC_ADDRESS,
        tokenOut: WETH_ADDRESS,
        fee: 500,
        recipient: ACTIVE_STRATEGY_ADDRESS,
        deadline,
        amountIn: amountToSwap,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
    };
    
    const routerCalldata = swapRouterInterface.encodeFunctionData("exactInputSingle", [params]);
    
    const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        [
            "address",
            "address", 
            "address",
            "uint256",
            "uint256",
            "address",
            "bytes",
        ],
        [
            UNISWAP_V3_ROUTER,
            USDC_ADDRESS,
            WETH_ADDRESS,
            amountToSwap,
            0,
            ACTIVE_STRATEGY_ADDRESS,
            routerCalldata,
        ]
    );
    
    // Create allSwapData for all strategies
    const allSwapData = [];
    for (let i = 0; i < strategies.length; i++) {
        if (i === activeStrategyIndex) {
            allSwapData.push([payload]);
        } else {
            allSwapData.push([]);
        }
    }
    
    console.log("AllSwapData structure:", allSwapData);
    console.log(`AllSwapData[${activeStrategyIndex}] length:`, allSwapData[activeStrategyIndex].length);
    
    // === STEP 2: SET ROUTER ===
    console.log("\n=== STEP 2: SET ROUTER ===");
    
    try {
        const setRouterTx = await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
        await setRouterTx.wait();
        console.log("✅ Router set successfully!");
    } catch (error) {
        console.log("Router might already be set:", error.message);
    }
    
    // === STEP 3: CHECK PRE-EXECUTION STATE ===
    console.log("\n=== STEP 3: PRE-EXECUTION STATE ===");
    
    const vaultBalanceBefore = await usdc.balanceOf(VAULT_ADDRESS);
    const strategyBalanceBefore = await usdc.balanceOf(ACTIVE_STRATEGY_ADDRESS);
    const vaultToStrategyAllowanceBefore = await usdc.allowance(VAULT_ADDRESS, ACTIVE_STRATEGY_ADDRESS);
    
    console.log("Vault USDC balance before:", ethers.formatUnits(vaultBalanceBefore, 6), "USDC");
    console.log("Strategy USDC balance before:", ethers.formatUnits(strategyBalanceBefore, 6), "USDC");
    console.log("Vault -> Strategy allowance before:", ethers.formatUnits(vaultToStrategyAllowanceBefore, 6), "USDC");
    
    // === STEP 4: CALL INVEST IDLE ===
    console.log("\n=== STEP 4: CALL INVEST IDLE ===");
    
    try {
        console.log("Calling investIdle...");
        const tx = await vault.investIdle(allSwapData);
        console.log("Transaction sent:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed!");
        console.log("Gas used:", receipt.gasUsed.toString());
        console.log("Transaction status:", receipt.status);
        
        if (receipt.status === 1) {
            console.log("\n🎉 SUCCESS! InvestIdle completed successfully!");
            
            // Check post-execution state
            const vaultBalanceAfter = await usdc.balanceOf(VAULT_ADDRESS);
            const strategyBalanceAfter = await usdc.balanceOf(ACTIVE_STRATEGY_ADDRESS);
            const vaultToStrategyAllowanceAfter = await usdc.allowance(VAULT_ADDRESS, ACTIVE_STRATEGY_ADDRESS);
            
            console.log("\n=== POST-EXECUTION STATE ===");
            console.log("Vault USDC balance after:", ethers.formatUnits(vaultBalanceAfter, 6), "USDC");
            console.log("Strategy USDC balance after:", ethers.formatUnits(strategyBalanceAfter, 6), "USDC");
            console.log("Vault -> Strategy allowance after:", ethers.formatUnits(vaultToStrategyAllowanceAfter, 6), "USDC");
            
            console.log("\n=== SUMMARY ===");
            console.log("✅ Vault approval worked");
            console.log("✅ Strategy deposit worked");
            console.log("✅ Swap execution worked");
            console.log("✅ InvestIdle completed successfully!");
            
        } else {
            console.log("\n❌ FAILED: Transaction reverted during execution");
        }
        
    } catch (error) {
        console.error("❌ InvestIdle failed:", error.message);
        
        if (error.reason) {
            console.log("Error reason:", error.reason);
        }
        
        if (error.data) {
            console.log("Error data:", error.data);
        }
    }
    
    console.log("\n=== FINAL INVEST IDLE TEST COMPLETE ===");
}

testFinalInvestIdle()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });
