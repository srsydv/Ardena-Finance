/**
 * Set WETH Oracle Price for MockAggregatorV3
 * 
 * This script follows the exact setEthUsdFromPool() logic to:
 * 1. Get the current WETH/AAVE price from Uniswap V3 pool
 * 2. Convert it to 8 decimal format (Chainlink-like)
 * 3. Set the MockAggregatorV3 oracle with the correct answer
 * 
 * Based on: test/uniswapV2Router.test.js setEthUsdFromPool() function
 */

import hre from "hardhat";
const { ethers } = hre;
import dotenv from "dotenv";
dotenv.config();

// NEW AAVE VAULT SYSTEM ADDRESSES
const CONTRACTS = {
    vault: "0x3cd0145707C03316B48f8A254c494600c30ebf8d",
    asset: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a", // AAVE
    weth: "0x4530fABea7444674a775aBb920924632c669466e", // NEW WETH
    aaveWethPool: "0x0E98753e483679703c902a0f574646d3653ad9eA",
    oracle: "0x6EE0A849079A5b63562a723367eAae77F3f5EB21"
};

// Contract ABIs
const POOL_ABI = [
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function fee() external view returns (uint24)"
];

const DEC_META = [
    "function decimals() external view returns (uint8)"
];

const MOCK_AGGREGATOR_ABI = [
    "function setAnswer(int256 a) external",
    "function latestRoundData() external view returns (uint80,uint256,int256,uint256,uint80)",
    "function decimals() external view returns (uint8)",
    "function answer() external view returns (int256)"
];

const ORACLE_ABI = [
    "function setEthUsd(address aggregator, string memory maxAge) external",
    "function ethUsd() external view returns (address)"
];

async function setWethOraclePrice() {
    console.log("🔮 SETTING WETH ORACLE PRICE FOR MOCKAGGREGATORV3");
    console.log("================================================");
    console.log("🎯 Goal: Set correct WETH price in MockAggregatorV3 oracle");
    console.log("📊 Following exact setEthUsdFromPool() logic");
    console.log("");

    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
    const wallet = new ethers.Wallet(process.env.PK, provider);
    
    console.log("👤 Wallet address:", wallet.address);
    console.log("");

    // Create contract instances
    const pool = new ethers.Contract(CONTRACTS.aaveWethPool, POOL_ABI, wallet);
    const oracle = new ethers.Contract(CONTRACTS.oracle, ORACLE_ABI, wallet);

    try {
        // Step 1: Get Current Pool State (Following setEthUsdFromPool logic)
        console.log("📋 STEP 1: GET CURRENT POOL STATE");
        console.log("---------------------------------");
        
        const [slot0, token0, token1] = await Promise.all([
            pool.slot0(),
            pool.token0(),
            pool.token1()
        ]);
        
        const sp = BigInt(slot0.sqrtPriceX96); // sqrtPriceX96
        console.log("🏊 Pool token0:", token0);
        console.log("🏊 Pool token1:", token1);
        console.log("🏊 sqrtPriceX96:", sp.toString());
        console.log("");

        // Step 2: Get Token Decimals (Following setEthUsdFromPool logic)
        console.log("📋 STEP 2: GET TOKEN DECIMALS");
        console.log("----------------------------");
        
        const [dec0, dec1] = await Promise.all([
            (await ethers.getContractAt(DEC_META, token0)).decimals(),
            (await ethers.getContractAt(DEC_META, token1)).decimals()
        ]);
        
        console.log("🔢 Token0 decimals:", dec0.toString());
        console.log("🔢 Token1 decimals:", dec1.toString());
        console.log("");

        // Step 3: Calculate Price (Following setEthUsdFromPool logic exactly)
        console.log("📋 STEP 3: CALCULATE PRICE");
        console.log("-------------------------");
        
        // Constants from setEthUsdFromPool
        const Q96 = 1n << 96n;
        const Q192 = Q96 * Q96;
        const sp2 = sp * sp; // price in Q64.96^2
        const ONE18 = 10n ** 18n;
        
        console.log("🔢 Q96:", Q96.toString());
        console.log("🔢 Q192:", Q192.toString());
        console.log("🔢 sp2 (sqrtPriceX96^2):", sp2.toString());
        console.log("🔢 ONE18:", ONE18.toString());
        console.log("");

        // Calculate AAVE per 1 WETH at 1e18 scale (following setEthUsdFromPool logic)
        console.log("📊 CALCULATING AAVE PER 1 WETH AT 1E18 SCALE");
        console.log("---------------------------------------------");
        
        let aavePerWeth1e18;
        
        if (token0.toLowerCase() === CONTRACTS.asset.toLowerCase()) {
            // token0=AAVE(18), token1=WETH(18) → price(token0/token1)
            console.log("🎯 Case: token0=AAVE, token1=WETH");
            console.log("📊 Calculating: price(token0/token1)");
            
            const scale = 10n ** BigInt(dec1 - dec0); // 10^(18-18)=1e0
            console.log("🔢 Scale factor:", scale.toString());
            
            aavePerWeth1e18 = (Q192 * scale * ONE18) / sp2;
            console.log("📊 Formula: (Q192 * scale * ONE18) / sp2");
            console.log("📊 Calculation:", `(${Q192.toString()} * ${scale.toString()} * ${ONE18.toString()}) / ${sp2.toString()}`);
            
        } else {
            // token0=WETH(18), token1=AAVE(18) → price(token1/token0)
            console.log("🎯 Case: token0=WETH, token1=AAVE");
            console.log("📊 Calculating: price(token1/token0)");
            
            const scale = 10n ** BigInt(dec0 - dec1); // 10^(18-18)=1e0
            console.log("🔢 Scale factor:", scale.toString());
            
            aavePerWeth1e18 = (sp2 * scale * ONE18) / Q192;
            console.log("📊 Formula: (sp2 * scale * ONE18) / Q192");
            console.log("📊 Calculation:", `(${sp2.toString()} * ${scale.toString()} * ${ONE18.toString()}) / ${Q192.toString()}`);
        }
        
        console.log("📊 AAVE per 1 WETH (1e18 scale):", aavePerWeth1e18.toString());
        console.log("📊 AAVE per 1 WETH (formatted):", ethers.formatUnits(aavePerWeth1e18, 18));
        console.log("");

        // Step 4: Convert to 8 Decimals (Following setEthUsdFromPool logic)
        console.log("📋 STEP 4: CONVERT TO 8 DECIMALS");
        console.log("--------------------------------");
        
        // Publish to 1e8 decimals (Chainlink-like) - EXACT from setEthUsdFromPool
        const answer1e8 = aavePerWeth1e18 / 10n ** 10n; // 1e18 → 1e8
        console.log("🔢 Conversion: aavePerWeth1e18 / 10^10");
        console.log("🔢 Formula: 1e18 → 1e8 (divide by 10^10)");
        console.log("📊 answer1e8:", answer1e8.toString());
        console.log("📊 answer1e8 (formatted):", ethers.formatUnits(answer1e8, 8));
        console.log("");

        // Step 5: Get Current Oracle State
        console.log("📋 STEP 5: GET CURRENT ORACLE STATE");
        console.log("----------------------------------");
        
        const currentEthUsd = await oracle.ethUsd();
        console.log("🔮 Current ETH/USD oracle:", currentEthUsd);
        
        if (currentEthUsd !== ethers.ZeroAddress) {
            const currentAggregator = new ethers.Contract(currentEthUsd, MOCK_AGGREGATOR_ABI, wallet);
            const [currentAnswer, currentDecimals] = await Promise.all([
                currentAggregator.answer(),
                currentAggregator.decimals()
            ]);
            
            console.log("📊 Current oracle answer:", currentAnswer.toString());
            console.log("📊 Current oracle decimals:", currentDecimals.toString());
            console.log("📊 Current oracle answer (formatted):", ethers.formatUnits(currentAnswer, currentDecimals));
        } else {
            console.log("⚠️  No current ETH/USD oracle set");
        }
        console.log("");

        // Step 6: Set New Oracle Price
        console.log("📋 STEP 6: SET NEW ORACLE PRICE");
        console.log("-------------------------------");
        
        console.log("🎯 Setting MockAggregatorV3 answer to:", answer1e8.toString());
        console.log("📊 This represents:", ethers.formatUnits(answer1e8, 8), "AAVE per 1 WETH");
        console.log("📊 Current market price: 1 WETH =", ethers.formatUnits(aavePerWeth1e18, 18), "AAVE");
        console.log("");
        
        // Update the MockAggregatorV3 contract directly
        const aggregatorContract = new ethers.Contract(currentEthUsd, MOCK_AGGREGATOR_ABI, wallet);
        const setAnswerTx = await aggregatorContract.setAnswer(answer1e8);
        console.log("📤 MockAggregatorV3 setAnswer transaction sent:", setAnswerTx.hash);
        
        const setAnswerReceipt = await setAnswerTx.wait();
        console.log("✅ MockAggregatorV3 answer updated successfully!");
        console.log("⛽ Gas used:", setAnswerReceipt.gasUsed.toString());
        console.log("");

        // Step 7: Verify New Oracle Price
        console.log("📋 STEP 7: VERIFY NEW ORACLE PRICE");
        console.log("----------------------------------");
        
        const [newAnswer, newDecimals] = await Promise.all([
            aggregatorContract.answer(),
            aggregatorContract.decimals()
        ]);
        
        console.log("📊 New oracle answer:", newAnswer.toString());
        console.log("📊 New oracle decimals:", newDecimals.toString());
        console.log("📊 New oracle answer (formatted):", ethers.formatUnits(newAnswer, newDecimals));
        
        // Verify the price matches
        if (newAnswer.toString() === answer1e8.toString()) {
            console.log("✅ SUCCESS: Oracle price updated correctly!");
            console.log("🎯 Oracle now reflects current WETH/AAVE price");
        } else {
            console.log("❌ ERROR: Oracle price doesn't match expected value");
            console.log("Expected:", answer1e8.toString());
            console.log("Actual:", newAnswer.toString());
        }
        console.log("");

        // Step 8: Summary
        console.log("📋 STEP 8: SUMMARY");
        console.log("------------------");
        
        console.log("🎉 WETH ORACLE PRICE SET SUCCESSFULLY!");
        console.log("=====================================");
        console.log("✅ Current WETH/AAVE price:", ethers.formatUnits(aavePerWeth1e18, 18));
        console.log("✅ Oracle answer (8 decimals):", ethers.formatUnits(answer1e8, 8));
        console.log("✅ Oracle address:", currentEthUsd);
        console.log("");
        console.log("💡 This should fix the 'oracle reverting 0 value for WETH' issue");
        console.log("💡 UniswapV3Strategy will now get correct price from oracle");
        console.log("💡 The oracle follows Chainlink format (8 decimals)");
        
    } catch (error) {
        console.error("❌ Error setting WETH oracle price:", error.message);
        console.error("Stack trace:", error.stack);
        process.exit(1);
    }
}

// Run the script
setWethOraclePrice().catch(console.error);
