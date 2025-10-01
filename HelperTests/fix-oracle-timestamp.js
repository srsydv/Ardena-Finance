import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("🔧 Fixing Oracle Timestamp Issue...");
    
    // Oracle addresses
    const ORACLE_MODULE = "0xe08fa13611a439b4c462e732a5bf4c40131c275d";
    const WETH_AGGREGATOR = "0x497369979efad100f83c509a30f38dff90d11585";
    
    console.log("📋 Oracle Addresses:");
    console.log(`Oracle Module: ${ORACLE_MODULE}`);
    console.log(`WETH Aggregator: ${WETH_AGGREGATOR}`);

    // Connect to contracts
    const oracleModule = await ethers.getContractAt("OracleModule", ORACLE_MODULE);
    const wethAggregator = await ethers.getContractAt("MockAggregatorV3", WETH_AGGREGATOR);

    // Get current block info
    const currentBlock = await ethers.provider.getBlock('latest');
    console.log(`\n🕐 Current Block Info:`);
    console.log(`Block Number: ${currentBlock.number}`);
    console.log(`Block Timestamp: ${currentBlock.timestamp}`);
    console.log(`Current Time: ${Math.floor(Date.now() / 1000)}`);

    // Check current oracle data
    const currentData = await wethAggregator.latestRoundData();
    console.log(`\n📊 Current Oracle Data:`);
    console.log(`Answer: ${ethers.formatUnits(currentData[1], 8)} USD`);
    console.log(`Updated At: ${currentData[3]}`);
    console.log(`Time Diff: ${currentBlock.timestamp - Number(currentData[3])} seconds`);

    // Mine a new block to advance timestamp
    console.log(`\n⛏️ Mining new block to advance timestamp...`);
    await ethers.provider.send("evm_mine", []);
    
    const newBlock = await ethers.provider.getBlock('latest');
    console.log(`New Block Number: ${newBlock.number}`);
    console.log(`New Block Timestamp: ${newBlock.timestamp}`);

    // Update WETH price with fresh timestamp
    console.log(`\n💰 Updating WETH/USD price with fresh timestamp...`);
    const wethPrice = ethers.parseUnits("3000", 8); // $3000 with 8 decimals
    const wethTx = await wethAggregator.setAnswer(wethPrice);
    await wethTx.wait();
    console.log(`✅ WETH price updated: $${ethers.formatUnits(wethPrice, 8)}`);
    console.log(`Transaction: ${wethTx.hash}`);

    // Verify the update
    const updatedData = await wethAggregator.latestRoundData();
    console.log(`\n🔍 Updated Oracle Data:`);
    console.log(`Answer: ${ethers.formatUnits(updatedData[1], 8)} USD`);
    console.log(`Updated At: ${updatedData[3]}`);
    console.log(`Current Block Timestamp: ${newBlock.timestamp}`);
    console.log(`Time Diff: ${newBlock.timestamp - Number(updatedData[3])} seconds`);

    // Test oracle price call
    console.log(`\n🧪 Testing Oracle Price Call...`);
    try {
        const wethAddress = "0x4530fABea7444674a775aBb920924632c669466e";
        const price = await oracleModule.price(wethAddress);
        console.log(`✅ WETH price from oracle: $${ethers.formatUnits(price, 8)} USD`);
    } catch (error) {
        console.log(`❌ Oracle price call failed: ${error.message}`);
        
        // If still failing, let's check the heartbeat configuration
        console.log(`\n🔍 Checking OracleModule Configuration...`);
        try {
            const ethUsdConfig = await oracleModule.ethUsd();
            console.log(`ETH/USD Config: {`);
            console.log(`  aggregator: '${ethUsdConfig.aggregator}'`);
            console.log(`  heartbeat: '${ethUsdConfig.heartbeat}'`);
            console.log(`  exists: ${ethUsdConfig.exists}`);
            console.log(`}`);
            
            // Check if the heartbeat is too strict
            const heartbeat = Number(ethUsdConfig.heartbeat);
            const timeDiff = newBlock.timestamp - Number(updatedData[3]);
            console.log(`\n⏰ Timing Analysis:`);
            console.log(`Heartbeat: ${heartbeat} seconds`);
            console.log(`Time Diff: ${timeDiff} seconds`);
            console.log(`Is Stale: ${timeDiff > heartbeat ? 'YES' : 'NO'}`);
            
        } catch (configError) {
            console.log(`❌ Could not read oracle configuration: ${configError.message}`);
        }
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 Oracle Timestamp Fix Complete!");
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
