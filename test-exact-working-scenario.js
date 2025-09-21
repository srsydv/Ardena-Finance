const { ethers } = require("hardhat");
require("dotenv").config();

async function testExactWorkingScenario() {
    try {
        console.log("=== TESTING EXACT WORKING SCENARIO ===");
        
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
        const POOL_FEE = 500;
        
        // Contract ABIs
        const vaultABI = [
            "function investIdle(bytes[][] calldata allSwapData) external",
            "function strategiesLength() external view returns (uint256)",
            "function strategies(uint256) external view returns (address)",
            "function targetBps(address) external view returns (uint16)"
        ];
        
        const exchangerABI = [
            "function setRouter(address router, bool allowed) external"
        ];
        
        const usdcABI = [
            "function balanceOf(address account) external view returns (uint256)"
        ];
        
        // Initialize contracts
        const vault = new ethers.Contract(VAULT_ADDRESS, vaultABI, wallet);
        const exchanger = new ethers.Contract(EXCHANGER_ADDRESS, exchangerABI, wallet);
        const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);
        
        console.log("\n=== STEP 1: CHECKING CURRENT STATE ===");
        
        const idleAmount = await usdc.balanceOf(VAULT_ADDRESS);
        console.log("Idle amount:", ethers.formatUnits(idleAmount, 6), "USDC");
        
        const strategiesLength = await vault.strategiesLength();
        console.log("Strategies length:", strategiesLength.toString());
        
        // Get UniswapV3 strategy allocation
        const targetBps = await vault.targetBps(UNI_STRATEGY_ADDRESS);
        console.log("UniswapV3 strategy targetBps:", targetBps.toString());
        
        const toSend = (idleAmount * BigInt(targetBps)) / 10000n;
        console.log("Amount to send to UniswapV3 strategy:", ethers.formatUnits(toSend, 6), "USDC");
        
        console.log("\n=== STEP 2: CREATING PAYLOAD (EXACT WORKING TEST PATTERN) ===");
        
        // Create payload exactly like the working test
        const amountIn = toSend / 2n; // swap half to WETH (same as working test)
        
        console.log("Amount to swap (USDC -> WETH):", ethers.formatUnits(amountIn, 6), "USDC");
        
        // Encode exactInputSingle(params) for SwapRouter02 (exact same as working test)
        const artifact = require("@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json");
        const iface = new ethers.Interface(artifact.abi);
        const deadline = (await ethers.provider.getBlock("latest")).timestamp + 1200;
        
        const params = {
            tokenIn: USDC_ADDRESS,
            tokenOut: WETH_ADDRESS,
            fee: POOL_FEE,
            recipient: UNI_STRATEGY_ADDRESS, // deliver WETH to the strategy (same as working test)
            deadline,
            amountIn,
            amountOutMinimum: 0n, // for tests; in prod use a quoted minOut (same as working test)
            sqrtPriceLimitX96: 0n,
        };
        
        const routerCalldata = iface.encodeFunctionData("exactInputSingle", [params]);
        
        // Pack payload for ExchangeHandler.swap(bytes) (exact same as working test)
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
                amountIn,
                0,
                UNI_STRATEGY_ADDRESS,
                routerCalldata,
            ]
        );
        
        console.log("\n=== STEP 3: SETTING ROUTER (EXACT WORKING TEST PATTERN) ===");
        
        // Set router exactly like working test
        try {
            const setRouterTx = await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
            await setRouterTx.wait();
            console.log("✅ Router set successfully!");
        } catch (error) {
            console.log("Router might already be set:", error.message);
        }
        
        console.log("\n=== STEP 4: TESTING DIFFERENT PAYLOAD STRUCTURES ===");
        
        // Test 1: Single strategy payload (like working test)
        console.log("\n--- TEST 1: Single Strategy Payload [[payload]] ---");
        const singleStrategyPayload = [[payload]];
        console.log("Payload structure:", singleStrategyPayload);
        
        try {
            console.log("Estimating gas for single strategy...");
            const gasEstimate1 = await vault.investIdle.estimateGas(singleStrategyPayload);
            console.log("✅ Single strategy gas estimate:", gasEstimate1.toString());
        } catch (error) {
            console.log("❌ Single strategy failed:", error.message);
        }
        
        // Test 2: Two strategy payload (our current approach)
        console.log("\n--- TEST 2: Two Strategy Payload [[], [payload]] ---");
        const twoStrategyPayload = [[], [payload]];
        console.log("Payload structure:", twoStrategyPayload);
        
        try {
            console.log("Estimating gas for two strategies...");
            const gasEstimate2 = await vault.investIdle.estimateGas(twoStrategyPayload);
            console.log("✅ Two strategy gas estimate:", gasEstimate2.toString());
        } catch (error) {
            console.log("❌ Two strategy failed:", error.message);
        }
        
        console.log("\n=== STEP 5: ANALYSIS ===");
        
        console.log("🔍 KEY INSIGHT:");
        console.log("The working test uses [[payload]] because it has ONLY UniswapV3Strategy");
        console.log("Our deployed vault has TWO strategies, so we need [[], [payload]]");
        console.log("");
        console.log("But the vault logic should handle this correctly:");
        console.log("- AaveV3Strategy (0%): toSend = 0, skipped");
        console.log("- UniswapV3Strategy (40%): toSend = 40 USDC, processed");
        
        console.log("\n🎯 CONCLUSION:");
        console.log("The payload structure is correct. The issue must be in:");
        console.log("1. ExchangeHandler.swap failing");
        console.log("2. UniswapV3Strategy.deposit failing");
        console.log("3. Real token behavior vs mock tokens");
        
    } catch (error) {
        console.error("Test failed:", error);
    }
}

testExactWorkingScenario();
