const { ethers } = require("hardhat");
require("dotenv").config();

async function testInvestIdleDirect() {
    try {
        console.log("=== TESTING INVEST IDLE DIRECTLY ===");
        
        // Setup provider and wallet
        const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
        const wallet = new ethers.Wallet(process.env.PK, provider);
        
        console.log("Wallet address:", wallet.address);
        console.log("Wallet balance:", ethers.formatEther(await provider.getBalance(wallet.address)));
        
        // Contract addresses
        const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
        const ACCESS_CONTROLLER_ADDRESS = "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";
        const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
        const UNISWAP_V3_ROUTER = "0x68b3465833fb72a70ecDF485E0e4C7bD8665Fc45";
        const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
        const UNI_STRATEGY_ADDRESS = "0xA87bFB6973b92685C66D2BDc37A670Ee995a4C3B";
        
        // Contract ABIs
        const vaultABI = [
            "function investIdle(bytes[][] calldata allSwapData) external",
            "function access() external view returns (address)",
            "function strategiesLength() external view returns (uint256)",
            "function strategies(uint256) external view returns (address)",
            "function targetBps(address) external view returns (uint16)",
            "function totalAssets() external view returns (uint256)"
        ];
        
        const accessControllerABI = [
            "function managers(address account) external view returns (bool)",
            "function setManager(address account, bool status) external"
        ];
        
        const exchangerABI = [
            "function setRouter(address router, bool allowed) external"
        ];
        
        const usdcABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function decimals() external view returns (uint8)"
        ];
        
        // Initialize contracts
        const vault = new ethers.Contract(VAULT_ADDRESS, vaultABI, wallet);
        const accessController = new ethers.Contract(ACCESS_CONTROLLER_ADDRESS, accessControllerABI, wallet);
        const exchanger = new ethers.Contract(EXCHANGER_ADDRESS, exchangerABI, wallet);
        const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);
        
        console.log("\n=== CHECKING VAULT STATE ===");
        
        // Check what AccessController the vault is using
        const vaultAccessController = await vault.access();
        console.log("Vault is using AccessController at:", vaultAccessController);
        console.log("Expected AccessController:", ACCESS_CONTROLLER_ADDRESS);
        console.log("Addresses match:", vaultAccessController.toLowerCase() === ACCESS_CONTROLLER_ADDRESS.toLowerCase());
        
        // Check manager role
        const isManager = await accessController.managers(wallet.address);
        console.log("Is manager:", isManager);
        
        if (!isManager) {
            console.log("Setting manager role...");
            const setManagerTx = await accessController.setManager(wallet.address, true);
            await setManagerTx.wait();
            console.log("Manager role set!");
            
            // Verify again
            const isManagerAfter = await accessController.managers(wallet.address);
            console.log("Is manager after setting:", isManagerAfter);
        }
        
        // Check vault idle amount
        const idleAmount = await usdc.balanceOf(VAULT_ADDRESS);
        console.log("Idle amount in vault:", ethers.formatUnits(idleAmount, 6), "USDC");
        
        if (idleAmount === 0n) {
            console.log("No idle funds to invest!");
            return;
        }
        
        // Get strategies
        const strategiesLength = await vault.strategiesLength();
        console.log("Number of strategies:", strategiesLength.toString());
        
        const strategies = [];
        for (let i = 0; i < strategiesLength; i++) {
            const strategyAddress = await vault.strategies(i);
            strategies.push(strategyAddress);
        }
        console.log("Strategies:", strategies);
        
        // Get UniswapV3 strategy allocation
        const uniStrategyIndex = strategies.findIndex(addr => addr.toLowerCase() === UNI_STRATEGY_ADDRESS.toLowerCase());
        if (uniStrategyIndex === -1) {
            console.log("UniswapV3 strategy not found!");
            return;
        }
        
        const targetBps = await vault.targetBps(UNI_STRATEGY_ADDRESS);
        console.log("UniswapV3 strategy targetBps:", targetBps.toString());
        
        // Calculate swap amount (half of UniswapV3 allocation)
        const toUniStrategy = (idleAmount * BigInt(targetBps)) / 10000n;
        const amountIn = toUniStrategy / 2n;
        console.log("Amount going to UniswapV3 strategy:", ethers.formatUnits(toUniStrategy, 6), "USDC");
        console.log("Amount to swap (USDC -> WETH):", ethers.formatUnits(amountIn, 6), "USDC");
        
        // Create swap data (simplified - just empty for now to test the basic call)
        console.log("\n=== CREATING SWAP DATA ===");
        
        // For now, let's try with empty swap data to see if the basic call works
        const allSwapData = [[], []]; // Empty arrays for both strategies
        
        console.log("AllSwapData:", allSwapData);
        console.log("AllSwapData length:", allSwapData.length);
        console.log("AllSwapData[0] length:", allSwapData[0].length);
        console.log("AllSwapData[1] length:", allSwapData[1].length);
        
        // Set router in exchanger
        console.log("\n=== SETTING ROUTER ===");
        try {
            const setRouterTx = await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
            await setRouterTx.wait();
            console.log("Router set successfully!");
        } catch (error) {
            console.log("Router might already be set:", error.message);
        }
        
        // Call investIdle
        console.log("\n=== CALLING INVEST IDLE ===");
        console.log("Calling investIdle with data:", allSwapData);
        console.log("Transaction will be sent from:", wallet.address);
        
        try {
            const tx = await vault.investIdle(allSwapData);
            console.log("Transaction sent:", tx.hash);
            
            const receipt = await tx.wait();
            console.log("Transaction confirmed:", receipt.hash);
            console.log("Gas used:", receipt.gasUsed.toString());
            
            console.log("\n=== SUCCESS! ===");
            console.log("InvestIdle completed successfully!");
            
        } catch (error) {
            console.error("InvestIdle failed:", error.message);
            
            if (error.message.includes("execution reverted")) {
                console.log("This is a smart contract revert. The issue is in the contract logic.");
            }
        }
        
    } catch (error) {
        console.error("Test failed:", error);
    }
}

testInvestIdleDirect();
