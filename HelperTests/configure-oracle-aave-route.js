import hre from "hardhat";
const { ethers } = hre;

// Contract addresses
const CONTRACTS = {
    oracle: "0x6EE0A849079A5b63562a723367eAae77F3f5EB21", // OracleModule
    weth: "0x4530fABea7444674a775aBb920924632c669466e", // NEW WETH
    aave: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a", // AAVE TOKEN
    aaveWethPool: "0x0E98753e483679703c902a0f574646d3653ad9eA" // AAVE/WETH POOL
};

async function main() {
    console.log("=== CONFIGURING ORACLE MODULE AAVE/ETH ROUTE ===");
    
    const [wallet] = await ethers.getSigners();
    console.log("Wallet:", wallet.address);
    console.log("Oracle Module:", CONTRACTS.oracle);
    console.log("");

    // Initialize Oracle Module contract
    const oracle = await ethers.getContractAt("OracleModule", CONTRACTS.oracle);
    
    // Check current owner
    const owner = await oracle.owner();
    console.log("Oracle Owner:", owner);
    console.log("Current wallet:", wallet.address);
    console.log("Is owner:", owner.toLowerCase() === wallet.address.toLowerCase());
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log("❌ ERROR: You are not the owner of the Oracle Module!");
        console.log("Only the owner can configure routes.");
        return;
    }
    console.log("");

    // Step 1: Check current configuration
    console.log("📋 STEP 1: CURRENT CONFIGURATION");
    console.log("--------------------------------");
    
    const [ethUsdConfig, aaveEthRoute, oracleWeth] = await Promise.all([
        oracle.ethUsd(),
        oracle.tokenEthRoute(CONTRACTS.aave),
        oracle.WETH()
    ]);
    
    console.log("Oracle WETH:", oracleWeth);
    console.log("Expected WETH:", CONTRACTS.weth);
    console.log("WETH matches:", oracleWeth.toLowerCase() === CONTRACTS.weth.toLowerCase());
    
    console.log("ETH/USD Config:");
    console.log("  - Aggregator:", ethUsdConfig.aggregator);
    console.log("  - Heartbeat:", ethUsdConfig.heartbeat.toString());
    console.log("  - Exists:", ethUsdConfig.exists);
    
    console.log("AAVE/ETH Route Config:");
    console.log("  - Aggregator:", aaveEthRoute.tokenEthAgg);
    console.log("  - Invert:", aaveEthRoute.invert);
    console.log("  - Heartbeat:", aaveEthRoute.heartbeat.toString());
    console.log("  - Exists:", aaveEthRoute.exists);
    console.log("");

    // Step 2: We need to create/find an AAVE/ETH aggregator
    // Since we don't have a real Chainlink feed, we'll need to create a MockAggregatorV3
    console.log("📋 STEP 2: CREATING AAVE/ETH AGGREGATOR");
    console.log("--------------------------------------");
    
    // First, let's check if we can use the pool price to create a mock aggregator
    const poolContract = await ethers.getContractAt("IUniswapV3Pool", CONTRACTS.aaveWethPool);
    const slot0 = await poolContract.slot0();
    const token0 = await poolContract.token0();
    
    // Calculate current AAVE per ETH from pool
    const sp = slot0.sqrtPriceX96;
    const Q96 = 2n ** 96n;
    const priceX96 = Number(sp) / Number(Q96);
    const price = priceX96 * priceX96;
    
    let aavePerEth;
    if (token0.toLowerCase() === CONTRACTS.weth.toLowerCase()) {
        // token0=WETH, token1=AAVE
        aavePerEth = price;
        console.log("Pool case: token0=WETH, token1=AAVE");
    } else {
        // token0=AAVE, token1=WETH
        aavePerEth = 1 / price;
        console.log("Pool case: token0=AAVE, token1=WETH");
    }
    
    console.log("Current pool price: 1 ETH =", aavePerEth.toFixed(6), "AAVE");
    
    // Convert to 8 decimals for Chainlink format
    const aavePerEth8Decimals = Math.floor(aavePerEth * 1e8);
    console.log("AAVE per ETH (8 decimals):", aavePerEth8Decimals);
    console.log("");

    // Step 3: Deploy MockAggregatorV3 for AAVE/ETH
    console.log("📋 STEP 3: DEPLOYING MOCK AGGREGATOR FOR AAVE/ETH");
    console.log("------------------------------------------------");
    
    const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
    const aaveEthAggregator = await MockAggregatorV3.deploy(aavePerEth8Decimals, 8); // 8 decimals
    await aaveEthAggregator.waitForDeployment();
    
    const aaveEthAggAddress = await aaveEthAggregator.getAddress();
    console.log("✅ MockAggregatorV3 deployed at:", aaveEthAggAddress);
    
    // Verify the aggregator
    const latestRoundData = await aaveEthAggregator.latestRoundData();
    console.log("Aggregator latestRoundData:");
    console.log("  - Round ID:", latestRoundData[0].toString());
    console.log("  - Answer:", latestRoundData[1].toString());
    console.log("  - Started At:", latestRoundData[2].toString());
    console.log("  - Updated At:", latestRoundData[3].toString());
    console.log("  - Answered In Round:", latestRoundData[4].toString());
    console.log("  - Decimals:", await aaveEthAggregator.decimals());
    console.log("");

    // Step 4: Configure the Oracle Module
    console.log("📋 STEP 4: CONFIGURING ORACLE MODULE");
    console.log("------------------------------------");
    
    const heartbeat = 864000; // 24 hours in seconds
    const invert = false; // AAVE per ETH (not ETH per AAVE)
    
    console.log("Setting AAVE/ETH route with:");
    console.log("  - Aggregator:", aaveEthAggAddress);
    console.log("  - Invert:", invert);
    console.log("  - Heartbeat:", heartbeat);
    
    try {
        const tx = await oracle.setTokenEthRoute(
            CONTRACTS.aave,
            aaveEthAggAddress,
            invert,
            heartbeat
        );
        console.log("Transaction sent:", tx.hash);
        await tx.wait();
        console.log("✅ AAVE/ETH route configured successfully!");
    } catch (error) {
        console.log("❌ Failed to configure AAVE/ETH route:", error.message);
        return;
    }
    console.log("");

    // Step 5: Test the configuration
    console.log("📋 STEP 5: TESTING CONFIGURATION");
    console.log("---------------------------------");
    
    // Check if AAVE/ETH route is now configured
    const newAaveEthRoute = await oracle.tokenEthRoute(CONTRACTS.aave);
    console.log("New AAVE/ETH Route Config:");
    console.log("  - Aggregator:", newAaveEthRoute.tokenEthAgg);
    console.log("  - Invert:", newAaveEthRoute.invert);
    console.log("  - Heartbeat:", newAaveEthRoute.heartbeat.toString());
    console.log("  - Exists:", newAaveEthRoute.exists);
    
    // Test AAVE price calculation
    try {
        const aavePrice = await oracle.price(CONTRACTS.aave);
        const isAaveStale = await oracle.isPriceStale(CONTRACTS.aave);
        console.log("✅ AAVE price:", ethers.formatUnits(aavePrice, 18), "USD");
        console.log("AAVE price stale:", isAaveStale);
    } catch (error) {
        console.log("❌ AAVE price calculation failed:", error.message);
    }
    
    // Test WETH price (should still work)
    try {
        const wethPrice = await oracle.price(CONTRACTS.weth);
        const isWethStale = await oracle.isPriceStale(CONTRACTS.weth);
        console.log("✅ WETH price:", ethers.formatUnits(wethPrice, 18), "USD");
        console.log("WETH price stale:", isWethStale);
    } catch (error) {
        console.log("❌ WETH price calculation failed:", error.message);
    }
    console.log("");

    // Step 6: Calculate WETH/AAVE ratio
    console.log("📋 STEP 6: CALCULATING WETH/AAVE RATIO");
    console.log("--------------------------------------");
    
    try {
        const [wethPrice, aavePrice] = await Promise.all([
            oracle.price(CONTRACTS.weth),
            oracle.price(CONTRACTS.aave)
        ]);
        
        const wethUsd = Number(ethers.formatUnits(wethPrice, 18));
        const aaveUsd = Number(ethers.formatUnits(aavePrice, 18));
        
        if (wethUsd > 0 && aaveUsd > 0) {
            const wethPerAave = wethUsd / aaveUsd;
            console.log("Oracle calculation: 1 WETH =", wethPerAave.toFixed(6), "AAVE");
            console.log("Pool calculation:   1 WETH =", aavePerEth.toFixed(6), "AAVE");
            
            const difference = Math.abs(wethPerAave - aavePerEth);
            console.log("Difference:", difference.toFixed(6));
            
            if (difference < 0.1) {
                console.log("✅ Oracle and pool prices are very close!");
            } else {
                console.log("⚠️  Oracle and pool prices differ significantly");
            }
        } else {
            console.log("❌ Cannot calculate ratio - one or both prices are zero");
        }
    } catch (error) {
        console.log("❌ Failed to calculate WETH/AAVE ratio:", error.message);
    }
    
    console.log("");
    console.log("=== CONFIGURATION COMPLETED ===");
    console.log("AAVE/ETH Aggregator deployed at:", aaveEthAggAddress);
    console.log("You can now use the Oracle Module to get AAVE prices!");
}

main().catch((error) => {
    console.error("Configuration failed:", error);
    process.exit(1);
});
