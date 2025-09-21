const { ethers } = require("hardhat");
require("dotenv").config();

async function analyzeTokenDifferences() {
    try {
        console.log("=== ANALYZING TOKEN DIFFERENCES ===");
        
        // Setup provider and wallet
        const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
        const wallet = new ethers.Wallet(process.env.PK, provider);
        
        // Contract addresses
        const REAL_USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"; // Real Sepolia USDC
        const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
        const UNI_STRATEGY_ADDRESS = "0xA87bFB6973b92685C66D2BDc37A670Ee995a4C3B";
        const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
        
        // Contract ABIs
        const realUSDCABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function allowance(address owner, address spender) external view returns (uint256)",
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function transfer(address to, uint256 amount) external returns (bool)",
            "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
            "function decimals() external view returns (uint8)",
            "function symbol() external view returns (string)",
            "function name() external view returns (string)",
            "function totalSupply() external view returns (uint256)"
        ];
        
        // Initialize contracts
        const realUSDC = new ethers.Contract(REAL_USDC_ADDRESS, realUSDCABI, wallet);
        
        console.log("\n=== STEP 1: REAL SEPOLIA USDC ANALYSIS ===");
        
        // Basic token info
        const name = await realUSDC.name();
        const symbol = await realUSDC.symbol();
        const decimals = await realUSDC.decimals();
        const totalSupply = await realUSDC.totalSupply();
        
        console.log("Real USDC Info:");
        console.log("- Name:", name);
        console.log("- Symbol:", symbol);
        console.log("- Decimals:", decimals.toString());
        console.log("- Total Supply:", ethers.formatUnits(totalSupply, decimals), symbol);
        
        // Check balances and allowances
        const vaultBalance = await realUSDC.balanceOf(VAULT_ADDRESS);
        const strategyBalance = await realUSDC.balanceOf(UNI_STRATEGY_ADDRESS);
        const walletBalance = await realUSDC.balanceOf(wallet.address);
        
        console.log("\nBalances:");
        console.log("- Vault:", ethers.formatUnits(vaultBalance, decimals), symbol);
        console.log("- Strategy:", ethers.formatUnits(strategyBalance, decimals), symbol);
        console.log("- Wallet:", ethers.formatUnits(walletBalance, decimals), symbol);
        
        // Check allowances
        const vaultToStrategyAllowance = await realUSDC.allowance(VAULT_ADDRESS, UNI_STRATEGY_ADDRESS);
        const strategyToExchangerAllowance = await realUSDC.allowance(UNI_STRATEGY_ADDRESS, EXCHANGER_ADDRESS);
        const vaultToExchangerAllowance = await realUSDC.allowance(VAULT_ADDRESS, EXCHANGER_ADDRESS);
        
        console.log("\nAllowances:");
        console.log("- Vault -> Strategy:", ethers.formatUnits(vaultToStrategyAllowance, decimals), symbol);
        console.log("- Strategy -> Exchanger:", ethers.formatUnits(strategyToExchangerAllowance, decimals), symbol);
        console.log("- Vault -> Exchanger:", ethers.formatUnits(vaultToExchangerAllowance, decimals), symbol);
        
        console.log("\n=== STEP 2: TESTING REAL USDC TRANSFER BEHAVIOR ===");
        
        // Test if we can interact with real USDC
        try {
            console.log("Testing real USDC transfer behavior...");
            
            // Test 1: Check if wallet can approve
            const testAmount = ethers.parseUnits("1", decimals);
            console.log("Testing approval of 1 USDC...");
            
            // We won't actually send the transaction, just test the call
            const approveCall = await realUSDC.approve.staticCall(EXCHANGER_ADDRESS, testAmount);
            console.log("✅ Approval call succeeded:", approveCall);
            
        } catch (error) {
            console.log("❌ Real USDC interaction failed:", error.message);
        }
        
        console.log("\n=== STEP 3: MOCK USDC CHARACTERISTICS ===");
        
        console.log("Mock USDC (from working test):");
        console.log("- Simple ERC20 implementation");
        console.log("- No transfer restrictions");
        console.log("- No blacklists or whitelists");
        console.log("- No pause functionality");
        console.log("- No fee mechanisms");
        console.log("- Standard approve/transferFrom behavior");
        console.log("- No external dependencies");
        
        console.log("\n=== STEP 4: REAL USDC POTENTIAL DIFFERENCES ===");
        
        console.log("Real Sepolia USDC potential differences:");
        console.log("1. **Transfer Restrictions**:");
        console.log("   - May have blacklisted addresses");
        console.log("   - May have transfer limits");
        console.log("   - May require specific conditions for transfers");
        
        console.log("\n2. **Fee Mechanisms**:");
        console.log("   - May charge fees on transfers");
        console.log("   - May have different behavior for different amounts");
        
        console.log("\n3. **Pause Functionality**:");
        console.log("   - May be paused for transfers");
        console.log("   - May have selective pause (approve vs transfer)");
        
        console.log("\n4. **External Dependencies**:");
        console.log("   - May depend on external contracts");
        console.log("   - May have complex approval logic");
        
        console.log("\n5. **Gas Requirements**:");
        console.log("   - May require more gas than standard ERC20");
        console.log("   - May have different gas patterns");
        
        console.log("\n=== STEP 5: TESTING SPECIFIC SCENARIOS ===");
        
        // Test the exact scenario that fails
        console.log("Testing the exact failing scenario:");
        console.log("1. Vault calls asset.safeApprove(strategy, amount)");
        console.log("2. Vault calls strategy.deposit(amount, swaps)");
        console.log("3. Strategy calls asset.transferFrom(vault, strategy, amount)");
        console.log("4. Strategy calls exchanger.swap(payload)");
        console.log("5. ExchangeHandler calls asset.transferFrom(strategy, exchanger, amount)");
        
        // Check if the issue is in step 3 (vault to strategy)
        console.log("\n--- Testing Step 3: Vault to Strategy Transfer ---");
        const testTransferAmount = ethers.parseUnits("1", decimals);
        
        try {
            // Simulate the transferFrom call that the strategy would make
            const transferFromCall = await realUSDC.transferFrom.staticCall(
                VAULT_ADDRESS,
                UNI_STRATEGY_ADDRESS,
                testTransferAmount
            );
            console.log("✅ Vault -> Strategy transferFrom call succeeded:", transferFromCall);
        } catch (error) {
            console.log("❌ Vault -> Strategy transferFrom failed:", error.message);
            console.log("This could be the issue!");
        }
        
        // Check if the issue is in step 5 (strategy to exchanger)
        console.log("\n--- Testing Step 5: Strategy to Exchanger Transfer ---");
        try {
            // Simulate the transferFrom call that the exchanger would make
            const transferFromCall2 = await realUSDC.transferFrom.staticCall(
                UNI_STRATEGY_ADDRESS,
                EXCHANGER_ADDRESS,
                testTransferAmount
            );
            console.log("✅ Strategy -> Exchanger transferFrom call succeeded:", transferFromCall2);
        } catch (error) {
            console.log("❌ Strategy -> Exchanger transferFrom failed:", error.message);
            console.log("This is likely the issue!");
        }
        
        console.log("\n=== STEP 6: CONCLUSION ===");
        
        console.log("🔍 KEY DIFFERENCES:");
        console.log("1. **Mock USDC**: Simple, no restrictions, always works");
        console.log("2. **Real USDC**: May have restrictions, fees, or special behavior");
        
        console.log("\n🎯 MOST LIKELY ISSUE:");
        console.log("The real USDC token on Sepolia may have:");
        console.log("- Transfer restrictions that mock USDC doesn't have");
        console.log("- Different gas requirements");
        console.log("- External dependencies that aren't met");
        console.log("- Fee mechanisms that affect transfers");
        
        console.log("\n🔧 TO DEBUG FURTHER:");
        console.log("1. Check if real USDC has any special functions");
        console.log("2. Test with smaller amounts");
        console.log("3. Check if there are any events or logs from failed transfers");
        console.log("4. Compare gas usage between mock and real tokens");
        
    } catch (error) {
        console.error("Analysis failed:", error);
    }
}

analyzeTokenDifferences();
