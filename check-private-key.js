const { ethers } = require("hardhat");
require("dotenv").config();

async function checkPrivateKey() {
    console.log("=== CHECKING PRIVATE KEY ===");
    
    // Check what private key variables exist
    console.log("PRIVATE_KEY exists:", !!process.env.PRIVATE_KEY);
    console.log("PK exists:", !!process.env.PK);
    
    // Check addresses
    if (process.env.PRIVATE_KEY) {
        const wallet1 = new ethers.Wallet(process.env.PRIVATE_KEY);
        console.log("PRIVATE_KEY address:", wallet1.address);
    }
    
    if (process.env.PK) {
        const wallet2 = new ethers.Wallet(process.env.PK);
        console.log("PK address:", wallet2.address);
    }
    
    // Expected owner address
    const expectedOwner = "0xf69F75EB0c72171AfF58D79973819B6A3038f39f";
    console.log("Expected owner:", expectedOwner);
}

checkPrivateKey()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });
