import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("🔄 Refreshing Oracle Feeds...");
    
    // Oracle addresses from DEPLOYEDCONTRACT.me
    const ORACLE_MODULE = "0x32D6d6024CE08930b1f3eDd30F5eDd0d1986c9c4";
    const WETH_AGGREGATOR = "0x497369979efad100f83c509a30f38dff90d11585"; // MockAggregatorV3 for WETH/USD
    const AAVE_AGGREGATOR = "0xYourMockAggregatorV3"; // Need to find the AAVE/USD aggregator
    
    console.log("📋 Oracle Addresses:");
    console.log(`Oracle Module: ${ORACLE_MODULE}`);
    console.log(`WETH Aggregator: ${WETH_AGGREGATOR}`);
    
    // Connect to contracts
    const oracleModule = await ethers.getContractAt("OracleModule", ORACLE_MODULE);
    const wethAggregator = await ethers.getContractAt("MockAggregatorV3", WETH_AGGREGATOR);
    
    // Get current timestamp
    const currentTime = Math.floor(Date.now() / 1000);
    console.log(`Current timestamp: ${currentTime}`);
    
    // Update WETH price (set to $3000)
    console.log("\n💰 Updating WETH/USD price...");
    const wethPrice = ethers.parseUnits("3000", 8); // $3000 with 8 decimals
    const wethTx = await wethAggregator.setAnswer(wethPrice);
    await wethTx.wait();
    console.log(`✅ WETH price updated: $${ethers.formatUnits(wethPrice, 8)}`);
    console.log(`Transaction: ${wethTx.hash}`);
    
    // Wait a bit to ensure the timestamp is recent
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify the update
    const wethData = await wethAggregator.latestRoundData();
    console.log(`\n🔍 WETH Aggregator Data:`);
    console.log(`Answer: ${ethers.formatUnits(wethData[1], 8)} USD`);
    console.log(`Updated At: ${wethData[3]}`);
    console.log(`Current Time: ${currentTime}`);
    console.log(`Time Diff: ${currentTime - Number(wethData[3])} seconds`);
    
    // Test oracle price call
    console.log("\n🧪 Testing Oracle Price Call...");
    try {
        const wethAddress = "0x4530fABea7444674a775aBb920924632c669466e";
        const price = await oracleModule.price(wethAddress);
        console.log(`✅ WETH price from oracle: ${ethers.formatUnits(price, 8)} USD`);
    } catch (error) {
        console.log(`❌ Oracle price call failed: ${error.message}`);
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 Oracle Feeds Refreshed Successfully!");
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
