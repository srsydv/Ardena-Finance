const { ethers } = require("hardhat");
require("dotenv").config();

async function checkManagerRole() {
    console.log("=== CHECKING MANAGER ROLE ===");
    
    // Contract addresses
    const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
    const ACCESS_CONTROLLER_ADDRESS = "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";
    
    // Setup
    const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log("Wallet address:", wallet.address);
    
    // Get AccessController contract
    const accessController = new ethers.Contract(ACCESS_CONTROLLER_ADDRESS, [
        "function managers(address) external view returns (bool)",
        "function owner() external view returns (address)",
        "function setManager(address, bool) external"
    ], wallet);
    
    // Check if wallet is manager
    const isManager = await accessController.managers(wallet.address);
    console.log("Is manager:", isManager);
    
    // Check owner
    const owner = await accessController.owner();
    console.log("AccessController owner:", owner);
    console.log("Is wallet the owner:", owner.toLowerCase() === wallet.address.toLowerCase());
    
    // Check vault's access controller
    const vault = new ethers.Contract(VAULT_ADDRESS, [
        "function access() external view returns (address)"
    ], wallet);
    
    const vaultAccessController = await vault.access();
    console.log("Vault's AccessController:", vaultAccessController);
    console.log("Addresses match:", vaultAccessController.toLowerCase() === ACCESS_CONTROLLER_ADDRESS.toLowerCase());
    
    // If wallet is owner, we can set manager role
    if (owner.toLowerCase() === wallet.address.toLowerCase()) {
        console.log("\n=== SETTING MANAGER ROLE ===");
        try {
            const tx = await accessController.setManager(wallet.address, true);
            await tx.wait();
            console.log("✅ Manager role set successfully!");
            
            // Verify the role was set
            const isManagerNow = await accessController.managers(wallet.address);
            console.log("Is manager now:", isManagerNow);
        } catch (error) {
            console.error("❌ Failed to set manager role:", error.message);
        }
    } else {
        console.log("❌ Wallet is not the owner, cannot set manager role");
        console.log("Need to use the owner wallet to set manager role");
    }
}

checkManagerRole()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });
