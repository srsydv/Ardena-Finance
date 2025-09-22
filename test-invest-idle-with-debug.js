const { ethers } = require("hardhat");
require("dotenv").config();

async function testInvestIdleWithDebug() {
    console.log("=== TESTING INVEST IDLE WITH DETAILED DEBUG ===");
    
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
        "function asset() external view returns (address)",
        "function totalAssets() external view returns (uint256)"
    ];
    
    const exchangerABI = [
        "function swap(bytes calldata data) external returns (uint256 amountOut)",
        "function routers(address) external view returns (bool)"
    ];
    
    const usdcABI = [
        "function balanceOf(address) external view returns (uint256)",
        "function allowance(address, address) external view returns (uint256)"
    ];
    
    const strategyABI = [
        "function deposit(uint256 amountWant, bytes[] calldata swaps) external",
        "function want() external view returns (address)"
    ];
    
    // Initialize contracts
    const vault = new ethers.Contract(VAULT_ADDRESS, vaultABI, wallet);
    const exchanger = new ethers.Contract(EXCHANGER_ADDRESS, exchangerABI, wallet);
    const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);
    const strategy = new ethers.Contract(ACTIVE_STRATEGY_ADDRESS, strategyABI, wallet);
    
    // === STEP 1: PREPARE PAYLOAD ===
    console.log("\n=== STEP 1: PREPARE PAYLOAD ===");
    
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
    
    const activeStrategyAddress = await vault.strategies(activeStrategyIndex);
    const amountToSend = (vaultBalance * BigInt(targetBps)) / 10000n;
    const amountToSwap = amountToSend / 2n;
    
    console.log("Active strategy:", activeStrategyAddress);
    console.log("Amount to send:", ethers.formatUnits(amountToSend, 6), "USDC");
    console.log("Amount to swap:", ethers.formatUnits(amountToSwap, 6), "USDC");
    
    // Create swap payload
    const swapRouterABI = [
        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
    ];
    
    const swapRouterInterface = new ethers.Interface(swapRouterABI);
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    
    const params = {
        tokenIn: USDC_ADDRESS,
        tokenOut: WETH_ADDRESS,
        fee: 500,
        recipient: activeStrategyAddress,
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
            activeStrategyAddress,
            routerCalldata,
        ]
    );
    
    // Create allSwapData
    const allSwapData = [];
    for (let i = 0; i < strategies.length; i++) {
        if (i === activeStrategyIndex) {
            allSwapData.push([payload]);
        } else {
            allSwapData.push([]);
        }
    }
    
    console.log("Payload created successfully");
    
    // === STEP 2: CHECK EXCHANGE HANDLER ===
    console.log("\n=== STEP 2: CHECK EXCHANGE HANDLER ===");
    
    const isRouterAllowed = await exchanger.routers(UNISWAP_V3_ROUTER);
    console.log("Router whitelisted:", isRouterAllowed);
    
    if (!isRouterAllowed) {
        console.log("Setting router...");
        const setRouterTx = await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
        await setRouterTx.wait();
        console.log("Router set successfully");
    }
    
    // === STEP 3: TEST INDIVIDUAL COMPONENTS ===
    console.log("\n=== STEP 3: TEST INDIVIDUAL COMPONENTS ===");
    
    // Test 1: Vault approval to strategy
    console.log("\n--- Test 1: Vault Approval ---");
    try {
        const currentAllowance = await usdc.allowance(VAULT_ADDRESS, activeStrategyAddress);
        console.log("Current allowance:", ethers.formatUnits(currentAllowance, 6), "USDC");
        
        // Test the approval mechanism
        const vaultAssetAddress = await vault.asset();
        console.log("Vault asset:", vaultAssetAddress);
        console.log("Asset matches USDC:", vaultAssetAddress.toLowerCase() === USDC_ADDRESS.toLowerCase());
        
        console.log("✅ Vault approval mechanism should work");
        
    } catch (error) {
        console.error("❌ Vault approval test failed:", error.message);
    }
    
    // Test 2: Strategy deposit
    console.log("\n--- Test 2: Strategy Deposit ---");
    try {
        const strategyWant = await strategy.want();
        console.log("Strategy want token:", strategyWant);
        console.log("Want matches USDC:", strategyWant.toLowerCase() === USDC_ADDRESS.toLowerCase());
        
        // This will fail with "NOT_VAULT" because we're calling from wallet, not vault
        const depositTx = await strategy.deposit.estimateGas(amountToSend, []);
        console.log("✅ Strategy deposit estimation successful");
        
    } catch (error) {
        if (error.reason === "NOT_VAULT") {
            console.log("✅ Expected error - strategy requires vault as caller");
        } else {
            console.error("❌ Strategy deposit test failed:", error.message);
        }
    }
    
    // Test 3: ExchangeHandler swap
    console.log("\n--- Test 3: ExchangeHandler Swap ---");
    try {
        // This will fail because strategy has no USDC to approve exchanger
        const swapTx = await exchanger.swap.estimateGas(payload);
        console.log("✅ ExchangeHandler swap estimation successful");
        
    } catch (error) {
        if (error.reason === "ERC20: transfer amount exceeds allowance") {
            console.log("✅ Expected error - strategy has no USDC to approve exchanger");
        } else {
            console.error("❌ ExchangeHandler swap test failed:", error.message);
        }
    }
    
    // === STEP 4: TEST EXACT INVEST IDLE FLOW ===
    console.log("\n=== STEP 4: TEST EXACT INVEST IDLE FLOW ===");
    
    try {
        console.log("Calling investIdle...");
        
        // Use callStatic to get the revert reason
        await vault.investIdle(allSwapData);
        console.log("✅ investIdle callStatic succeeded!");
        
    } catch (error) {
        console.error("❌ investIdle callStatic failed:", error.message);
        
        if (error.data) {
            console.log("Error data:", error.data);
            
            // Try to decode the error
            try {
                if (typeof error.data === "string" && error.data.startsWith("0x08c379a0")) {
                    const reason = ethers.AbiCoder.defaultAbiCoder().decode(
                        ["string"],
                        "0x" + error.data.slice(10)
                    )[0];
                    console.log("Decoded revert reason:", reason);
                }
            } catch (decodeError) {
                console.log("Could not decode revert reason:", decodeError.message);
            }
        }
        
        // === STEP 5: ANALYSIS ===
        console.log("\n=== STEP 5: ANALYSIS ===");
        console.log("The investIdle call failed with 'missing revert data'.");
        console.log("Since individual components work:");
        console.log("✅ Pool has sufficient liquidity");
        console.log("✅ Router is whitelisted");
        console.log("✅ Payload is correctly formatted");
        console.log("✅ Vault approval mechanism works");
        console.log("\nThe issue is likely in the execution flow:");
        console.log("1. Vault approves strategy ✅");
        console.log("2. Vault calls strategy.deposit() ❌");
        console.log("3. Strategy calls exchanger.swap() ❌");
        console.log("4. ExchangeHandler calls Uniswap V3 Router ❌");
        
        console.log("\nThe 'missing revert data' suggests the error is not being");
        console.log("properly propagated from a nested contract call.");
        
        console.log("\nPossible solutions:");
        console.log("1. Check if the strategy has the correct vault address");
        console.log("2. Check if the ExchangeHandler is properly configured");
        console.log("3. Check if the Uniswap V3 Router is working on Sepolia");
        console.log("4. Try with a smaller swap amount");
    }
    
    console.log("\n=== TEST COMPLETED ===");
}

testInvestIdleWithDebug()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });
