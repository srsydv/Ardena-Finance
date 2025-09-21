/*
  Upgrade script for Vault and ExchangeHandler contracts on Sepolia.
  
  This script upgrades the existing UUPS proxy contracts to new implementations.
  
  Usage:
    npx hardhat run deploy/upgradeContract.js --network sepolia
  
  Required:
    - PK environment variable for the deployer account
    - The deployer must be a manager in the AccessController to authorize upgrades
*/

require("dotenv").config();
const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== UPGRADING CONTRACTS ON SEPOLIA ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== 11155111n) {
        console.warn(`Warning: expected Sepolia (11155111), current chainId=${chainId}`);
    }
    
    // Contract addresses from DEPLOYEDCONTRACT.me
    const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
    const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
    const ACCESS_CONTROLLER_ADDRESS = "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";
    
    console.log("\n=== STEP 1: CHECKING DEPLOYER PERMISSIONS ===");
    
    // Check if deployer is a manager (required for upgrades)
    const AccessController = await ethers.getContractFactory("AccessController");
    const accessController = AccessController.attach(ACCESS_CONTROLLER_ADDRESS);
    
    const isManager = await accessController.managers(deployer.address);
    console.log("Is deployer a manager:", isManager);
    
    if (!isManager) {
        console.log("❌ Deployer is not a manager. Setting manager role...");
        const setManagerTx = await accessController.setManager(deployer.address, true);
        await setManagerTx.wait();
        console.log("✅ Manager role set!");
        
        // Verify
        const isManagerAfter = await accessController.managers(deployer.address);
        console.log("Is deployer a manager after setting:", isManagerAfter);
    }
    
    console.log("\n=== STEP 2: UPGRADING VAULT CONTRACT ===");
    
    try {
        // Get the current Vault implementation
        const Vault = await ethers.getContractFactory("Vault");
        const currentVault = Vault.attach(VAULT_ADDRESS);
        
        // Get current implementation address
        const currentImpl = await upgrades.erc1967.getImplementationAddress(VAULT_ADDRESS);
        console.log("Current Vault implementation:", currentImpl);
        
        // Deploy new Vault implementation
        console.log("Deploying new Vault implementation...");
        const newVaultImpl = await Vault.deploy();
        await newVaultImpl.waitForDeployment();
        console.log("New Vault implementation deployed at:", newVaultImpl.target);
        
        // Upgrade the proxy
        console.log("Upgrading Vault proxy...");
        const upgradeVaultTx = await upgrades.upgradeProxy(VAULT_ADDRESS, Vault);
        await upgradeVaultTx.waitForDeployment();
        
        // Verify the upgrade
        const newImpl = await upgrades.erc1967.getImplementationAddress(VAULT_ADDRESS);
        console.log("New Vault implementation:", newImpl);
        console.log("✅ Vault upgrade completed!");
        
        // Test that the vault still works
        const vaultName = await currentVault.name();
        const vaultSymbol = await currentVault.symbol();
        const totalAssets = await currentVault.totalAssets();
        console.log("Vault name:", vaultName);
        console.log("Vault symbol:", vaultSymbol);
        console.log("Total assets:", ethers.formatUnits(totalAssets, 6), "USDC");
        
    } catch (error) {
        console.error("❌ Vault upgrade failed:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 3: UPGRADING EXCHANGEHANDLER CONTRACT ===");
    
    try {
        // Get the current ExchangeHandler implementation
        const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
        const currentExchanger = ExchangeHandler.attach(EXCHANGER_ADDRESS);
        
        // Get current implementation address
        const currentImpl = await upgrades.erc1967.getImplementationAddress(EXCHANGER_ADDRESS);
        console.log("Current ExchangeHandler implementation:", currentImpl);
        
        // Deploy new ExchangeHandler implementation
        console.log("Deploying new ExchangeHandler implementation...");
        const newExchangerImpl = await ExchangeHandler.deploy();
        await newExchangerImpl.waitForDeployment();
        console.log("New ExchangeHandler implementation deployed at:", newExchangerImpl.target);
        
        // Upgrade the proxy
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
        
    } catch (error) {
        console.error("❌ ExchangeHandler upgrade failed:", error.message);
        throw error;
    }
    
    console.log("\n=== STEP 4: VERIFICATION ===");
    
    // Verify both contracts are working
    try {
        const Vault = await ethers.getContractFactory("Vault");
        const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
        
        const vault = Vault.attach(VAULT_ADDRESS);
        const exchanger = ExchangeHandler.attach(EXCHANGER_ADDRESS);
        
        // Test vault functions
        const vaultName = await vault.name();
        const vaultSymbol = await vault.symbol();
        const strategiesLength = await vault.strategiesLength();
        
        console.log("Vault verification:");
        console.log("- Name:", vaultName);
        console.log("- Symbol:", vaultSymbol);
        console.log("- Strategies count:", strategiesLength.toString());
        
        // Test exchanger functions
        const exchangerOwner = await exchanger.owner();
        const uniswapRouterAllowed = await exchanger.routers("0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45");
        
        console.log("ExchangeHandler verification:");
        console.log("- Owner:", exchangerOwner);
        console.log("- Uniswap router allowed:", uniswapRouterAllowed);
        
        console.log("\n🎉 ALL UPGRADES COMPLETED SUCCESSFULLY!");
        
    } catch (error) {
        console.error("❌ Verification failed:", error.message);
        throw error;
    }
    
    console.log("\n=== UPGRADE SUMMARY ===");
    console.log("✅ Vault upgraded successfully");
    console.log("✅ ExchangeHandler upgraded successfully");
    console.log("✅ All contracts verified and working");
    console.log("\nContract addresses:");
    console.log("- Vault:", VAULT_ADDRESS);
    console.log("- ExchangeHandler:", EXCHANGER_ADDRESS);
    console.log("- AccessController:", ACCESS_CONTROLLER_ADDRESS);
}

main().catch((error) => {
    console.error("Upgrade failed:", error);
    process.exit(1);
});
