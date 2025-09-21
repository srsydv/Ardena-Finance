/*
  Upgrade script for ExchangeHandler contract only on Sepolia.
  
  This script upgrades only the ExchangeHandler UUPS proxy contract.
  
  Usage:
    npx hardhat run deploy/upgradeExchangeHandler.js --network sepolia
*/

require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== UPGRADING EXCHANGEHANDLER ON SEPOLIA ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Contract addresses from DEPLOYEDCONTRACT.me
    const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
    
    console.log("\n=== UPGRADING EXCHANGEHANDLER CONTRACT ===");
    
    try {
        // Get the current ExchangeHandler implementation
        const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
        const currentExchanger = ExchangeHandler.attach(EXCHANGER_ADDRESS);
        
        // Get current implementation address
        const currentImpl = await upgrades.erc1967.getImplementationAddress(EXCHANGER_ADDRESS);
        console.log("Current ExchangeHandler implementation:", currentImpl);
        
        // Upgrade the proxy directly (this will deploy new implementation automatically)
        console.log("Upgrading ExchangeHandler proxy...");
        const upgradeExchangerTx = await upgrades.upgradeProxy(EXCHANGER_ADDRESS, ExchangeHandler);
        await upgradeExchangerTx.waitForDeployment();
        
        // Verify the upgrade
        const newImpl = await upgrades.erc1967.getImplementationAddress(EXCHANGER_ADDRESS);
        console.log("New ExchangeHandler implementation:", newImpl);
        console.log("✅ ExchangeHandler upgrade completed!");
        
        // Test that the exchanger still works
        const owner = await currentExchanger.owner();
        console.log("ExchangeHandler owner:", owner);
        
        // Check if Uniswap V3 router is still allowed
        const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
        const isRouterAllowed = await currentExchanger.routers(UNISWAP_V3_ROUTER);
        console.log("Uniswap V3 router allowed:", isRouterAllowed);
        
        // If router is not allowed, re-allow it
        if (!isRouterAllowed) {
            console.log("Re-allowing Uniswap V3 router...");
            const setRouterTx = await currentExchanger.setRouter(UNISWAP_V3_ROUTER, true);
            await setRouterTx.wait();
            console.log("✅ Uniswap V3 router re-allowed!");
        }
        
        console.log("\n🎉 EXCHANGEHANDLER UPGRADE COMPLETED SUCCESSFULLY!");
        
    } catch (error) {
        console.error("❌ ExchangeHandler upgrade failed:", error.message);
        throw error;
    }
}

main().catch((error) => {
    console.error("Upgrade failed:", error);
    process.exit(1);
});
