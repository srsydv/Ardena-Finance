const { ethers } = require("hardhat");
require("dotenv").config();

async function testVaultApproval() {
    console.log("=== TESTING VAULT APPROVAL DIRECTLY ===");
    
    // Contract addresses
    const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const ACTIVE_STRATEGY_ADDRESS = "0xe7bA69Ffbc10Be7c5dA5776d768d5eF6a34Aa191";
    
    // Setup
    const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
    const wallet = new ethers.Wallet(process.env.PK, provider);
    
    console.log("Wallet:", wallet.address);
    
    // Contract ABIs
    const vaultABI = [
        "function asset() external view returns (address)",
        "function safeApprove(address spender, uint256 amount) external",
        "function totalAssets() external view returns (uint256)"
    ];
    
    const usdcABI = [
        "function balanceOf(address) external view returns (uint256)",
        "function allowance(address, address) external view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)"
    ];
    
    // Initialize contracts
    const vault = new ethers.Contract(VAULT_ADDRESS, vaultABI, wallet);
    const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);
    
    // === STEP 1: CHECK VAULT STATE ===
    console.log("\n=== STEP 1: VAULT STATE ===");
    
    const vaultAsset = await vault.asset();
    const vaultBalance = await usdc.balanceOf(VAULT_ADDRESS);
    const vaultTotalAssets = await vault.totalAssets();
    
    console.log("Vault asset:", vaultAsset);
    console.log("Vault USDC balance:", ethers.formatUnits(vaultBalance, 6), "USDC");
    console.log("Vault total assets:", ethers.formatUnits(vaultTotalAssets, 6), "USDC");
    console.log("Asset matches USDC:", vaultAsset.toLowerCase() === USDC_ADDRESS.toLowerCase());
    
    // Check current allowance
    const currentAllowance = await usdc.allowance(VAULT_ADDRESS, ACTIVE_STRATEGY_ADDRESS);
    console.log("Current allowance:", ethers.formatUnits(currentAllowance, 6), "USDC");
    
    // === STEP 2: TEST DIRECT USDC APPROVAL ===
    console.log("\n=== STEP 2: TEST DIRECT USDC APPROVAL ===");
    
    const amountToApprove = ethers.parseUnits("40", 6); // 40 USDC
    
    try {
        console.log("Testing direct USDC approval from vault...");
        const approveTx = await usdc.connect(wallet).approve(ACTIVE_STRATEGY_ADDRESS, amountToApprove);
        await approveTx.wait();
        console.log("✅ Direct USDC approval successful!");
        
        // Check new allowance
        const newAllowance = await usdc.allowance(VAULT_ADDRESS, ACTIVE_STRATEGY_ADDRESS);
        console.log("New allowance:", ethers.formatUnits(newAllowance, 6), "USDC");
    } catch (error) {
        console.error("❌ Direct USDC approval failed:", error.message);
    }
    
    // === STEP 3: TEST VAULT'S SAFEAPPROVE ===
    console.log("\n=== STEP 3: TEST VAULT'S SAFEAPPROVE ===");
    
    try {
        console.log("Testing vault.safeApprove...");
        
        // First, reset allowance to 0
        const resetTx = await usdc.connect(wallet).approve(ACTIVE_STRATEGY_ADDRESS, 0);
        await resetTx.wait();
        console.log("Reset allowance to 0");
        
        // Now test vault.safeApprove
        const safeApproveTx = await vault.safeApprove(ACTIVE_STRATEGY_ADDRESS, amountToApprove);
        await safeApproveTx.wait();
        console.log("✅ Vault safeApprove successful!");
        
        // Check final allowance
        const finalAllowance = await usdc.allowance(VAULT_ADDRESS, ACTIVE_STRATEGY_ADDRESS);
        console.log("Final allowance:", ethers.formatUnits(finalAllowance, 6), "USDC");
        
    } catch (error) {
        console.error("❌ Vault safeApprove failed:", error.message);
        
        // Try to decode the error
        if (error.data) {
            console.log("Error data:", error.data);
            try {
                if (typeof error.data === "string" && error.data.startsWith("0x08c379a0")) {
                    const reason = ethers.AbiCoder.defaultAbiCoder().decode(
                        ["string"],
                        "0x" + error.data.slice(10)
                    )[0];
                    console.log("Decoded revert reason:", reason);
                }
            } catch (decodeError) {
                console.log("Could not decode revert reason:", decodeError.message);
            }
        }
        
        if (error.reason) {
            console.log("Error reason:", error.reason);
        }
    }
    
    // === STEP 4: TEST STRATEGY DEPOSIT WITH APPROVAL ===
    console.log("\n=== STEP 4: TEST STRATEGY DEPOSIT WITH APPROVAL ===");
    
    try {
        const strategyABI = [
            "function deposit(uint256 amountWant, bytes[] calldata swaps) external"
        ];
        
        const strategy = new ethers.Contract(ACTIVE_STRATEGY_ADDRESS, strategyABI, wallet);
        
        console.log("Testing strategy deposit with proper approval...");
        const depositTx = await strategy.deposit(amountToApprove, []);
        await depositTx.wait();
        console.log("✅ Strategy deposit successful!");
        
        // Check strategy balance
        const strategyBalance = await usdc.balanceOf(ACTIVE_STRATEGY_ADDRESS);
        console.log("Strategy USDC balance after deposit:", ethers.formatUnits(strategyBalance, 6), "USDC");
        
    } catch (error) {
        console.error("❌ Strategy deposit failed:", error.message);
        
        if (error.reason) {
            console.log("Error reason:", error.reason);
        }
    }
    
    console.log("\n=== VAULT APPROVAL TEST COMPLETE ===");
}

testVaultApproval()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });
