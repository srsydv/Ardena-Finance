/*
  Check the ownership of the new UniswapV3Strategy contract.
  
  Usage:
    npx hardhat run deploy/checkNewStrategyOwnership.js --network sepolia
*/

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=== CHECKING NEW UNISWAPV3STRATEGY OWNERSHIP ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // New strategy address
    const NEW_STRATEGY_ADDRESS = "0x350e30c578cbcFA4eeba04855DC909F3252EEFe6";
    const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
    
    try {
        // Check if the strategy has Ownable functions
        const strategy = await ethers.getContractAt([
            "function owner() external view returns (address)",
            "function vault() external view returns (address)",
            "function wantToken() external view returns (address)",
            "function tokenId() external view returns (uint256)",
            "function totalAssets() external view returns (uint256)"
        ], NEW_STRATEGY_ADDRESS);
        
        console.log("\n=== CHECKING OWNERSHIP ===");
        
        const owner = await strategy.owner();
        console.log("Strategy owner:", owner);
        console.log("Is deployer the owner:", owner.toLowerCase() === deployer.address.toLowerCase());
        console.log("Is vault the owner:", owner.toLowerCase() === VAULT_ADDRESS.toLowerCase());
        
        // Check strategy configuration
        const vault = await strategy.vault();
        const wantToken = await strategy.wantToken();
        const tokenId = await strategy.tokenId();
        const totalAssets = await strategy.totalAssets();
        
        console.log("\nStrategy configuration:");
        console.log("- Vault:", vault);
        console.log("- Want token:", wantToken);
        console.log("- Token ID:", tokenId.toString());
        console.log("- Total assets:", ethers.formatUnits(totalAssets, 6), "USDC");
        
        // Check if we can call upgradeToAndCall directly
        console.log("\n=== TESTING UPGRADE PERMISSIONS ===");
        
        try {
            // Try to estimate gas for upgradeToAndCall (this will fail if not authorized)
            const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
            const newImpl = await UniswapV3Strategy.deploy();
            await newImpl.waitForDeployment();
            
            const upgradeTx = await strategy.upgradeToAndCall.estimateGas(newImpl.target, "0x");
            console.log("✅ upgradeToAndCall gas estimate succeeded:", upgradeTx.toString());
            console.log("This means the deployer can authorize upgrades");
        } catch (error) {
            console.log("❌ upgradeToAndCall failed:", error.message);
            
            if (error.message.includes("Ownable")) {
                console.log("The strategy uses Ownable but deployer is not the owner");
                console.log("Owner is:", owner);
                console.log("Deployer is:", deployer.address);
            }
        }
        
        // Check if we can transfer ownership
        console.log("\n=== TESTING OWNERSHIP TRANSFER ===");
        
        try {
            // Try to estimate gas for transferOwnership
            const transferTx = await strategy.transferOwnership.estimateGas(deployer.address);
            console.log("✅ transferOwnership gas estimate succeeded:", transferTx.toString());
            console.log("This means the current owner can transfer ownership");
        } catch (error) {
            console.log("❌ transferOwnership failed:", error.message);
        }
        
    } catch (error) {
        console.error("❌ Failed to check strategy:", error.message);
    }
}

main().catch((error) => {
    console.error("Check failed:", error);
    process.exit(1);
});
