import pkg from "hardhat";
const { ethers, upgrades } = pkg;

async function main() {
    console.log("🚀 Starting IndexSwap deployment...");
    
    // Deployment parameters
    const VAULT_ADDRESS = "0x92EA77BA5Cd9b47EBe84e09A7b90b253F845eD11";
    const ACCESS_ADDRESS = "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";
    const COOLDOWN = 0; // 0 seconds cooldown
    
    console.log("📋 Deployment Parameters:");
    console.log(`Vault Address: ${VAULT_ADDRESS}`);
    console.log(`Access Controller Address: ${ACCESS_ADDRESS}`);
    console.log(`Cooldown: ${COOLDOWN} seconds`);
    
    // Get the contract factory
    const IndexSwap = await ethers.getContractFactory("IndexSwap");
    
    console.log("\n🔧 Deploying IndexSwap contract...");
    
    // Deploy the contract
    const indexSwap = await IndexSwap.deploy();
    await indexSwap.waitForDeployment();
    
    const indexSwapAddress = await indexSwap.getAddress();
    console.log(`✅ IndexSwap deployed to: ${indexSwapAddress}`);
    
    // Initialize the contract
    console.log("\n🔧 Initializing IndexSwap...");
    const initTx = await indexSwap.initialize(VAULT_ADDRESS, ACCESS_ADDRESS, COOLDOWN);
    await initTx.wait();
    console.log(`✅ IndexSwap initialized: ${initTx.hash}`);
    
    // Verify the initialization
    console.log("\n🔍 Verifying deployment...");
    const vault = await indexSwap.vault();
    const access = await indexSwap.access();
    const cooldown = await indexSwap.cooldown();
    
    console.log(`Vault: ${vault}`);
    console.log(`Access: ${access}`);
    console.log(`Cooldown: ${cooldown} seconds`);
    
    // Verify addresses match
    if (vault.toLowerCase() === VAULT_ADDRESS.toLowerCase()) {
        console.log("✅ Vault address verified");
    } else {
        console.log("❌ Vault address mismatch");
    }
    
    if (access.toLowerCase() === ACCESS_ADDRESS.toLowerCase()) {
        console.log("✅ Access controller address verified");
    } else {
        console.log("❌ Access controller address mismatch");
    }
    
    if (cooldown.toString() === COOLDOWN.toString()) {
        console.log("✅ Cooldown verified");
    } else {
        console.log("❌ Cooldown mismatch");
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 IndexSwap Deployment Completed Successfully!");
    console.log("=".repeat(60));
    console.log(`Contract Address: ${indexSwapAddress}`);
    console.log(`Vault: ${VAULT_ADDRESS}`);
    console.log(`Access Controller: ${ACCESS_ADDRESS}`);
    console.log(`Cooldown: ${COOLDOWN} seconds`);
    console.log("=".repeat(60));
    
    // Save deployment info
    const deploymentInfo = {
        contractName: "IndexSwap",
        address: indexSwapAddress,
        vault: VAULT_ADDRESS,
        access: ACCESS_ADDRESS,
        cooldown: COOLDOWN,
        deploymentTx: initTx.hash,
        timestamp: new Date().toISOString()
    };
    
    console.log("\n📝 Deployment Information:");
    console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
