/**
 * Direct Aave V3 USDC Deposit Test
 * 
 * This test:
 * 1. Connects directly to Aave V3 pool on Sepolia
 * 2. Uses manager private key to deposit USDC
 * 3. Verifies the deposit works without using our contracts
 * 4. Checks aUSDC balance after deposit
 */

import { ethers } from "ethers";

// Sepolia Configuration
const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik";
const MANAGER_PK = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// Contract Addresses (Sepolia)
const CONTRACTS = {
    // Official Aave V3 Sepolia USDC (this should work)
    officialUsdc: "0x12bac54348c0e635dcac9d5fb99f06f24136c9a",
    // Our custom USDC (has error 51)
    ourUsdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    // Aave V3 Sepolia addresses
    aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
    poolAddressProvider: "0x049d5c4B6B57ccB1e12D8771904C7c0b0C4e4aC7"
};

// Contract ABIs
const ERC20_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function mint(address to, uint256 amount) external",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function name() external view returns (string)"
];

const AAVE_POOL_ABI = [
    "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
    "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
    "function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))"
];

const POOL_ADDRESS_PROVIDER_ABI = [
    "function getPool() external view returns (address)"
];

async function testDirectAaveDeposit() {
    console.log("🧪 DIRECT AAVE V3 USDC DEPOSIT TEST");
    console.log("====================================");
    console.log("🎯 Goal: Test direct USDC deposit to Aave V3 pool");
    console.log("🌐 Network: Sepolia Testnet");
    console.log("⚠️  Note: This bypasses all our contracts");
    console.log("");
    
    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(MANAGER_PK, provider);
    const userAddress = await signer.getAddress();
    
    console.log("👤 User address:", userAddress);
    console.log("");

    // Create contract instances
    const officialUsdc = new ethers.Contract(CONTRACTS.officialUsdc, ERC20_ABI, signer);
    const ourUsdc = new ethers.Contract(CONTRACTS.ourUsdc, ERC20_ABI, signer);
    const poolAddressProvider = new ethers.Contract(CONTRACTS.poolAddressProvider, POOL_ADDRESS_PROVIDER_ABI, provider);

    try {
        // Step 1: Verify USDC Tokens
        console.log("📋 STEP 1: USDC TOKEN VERIFICATION");
        console.log("-----------------------------------");
        
        console.log("🔍 Official USDC:", CONTRACTS.officialUsdc);
        console.log("🔍 Our USDC:", CONTRACTS.ourUsdc);
        
        // Check official USDC
        let officialUsdcWorking = false;
        try {
            const [officialName, officialSymbol, officialDecimals, officialBalance] = await Promise.all([
                officialUsdc.name(),
                officialUsdc.symbol(),
                officialUsdc.decimals(),
                officialUsdc.balanceOf(userAddress)
            ]);
            
            console.log("✅ Official USDC Name:", officialName);
            console.log("✅ Official USDC Symbol:", officialSymbol);
            console.log("✅ Official USDC Decimals:", officialDecimals.toString());
            console.log("💰 Official USDC Balance:", ethers.formatUnits(officialBalance, officialDecimals), "USDC");
            
            if (officialSymbol === "USDC" && officialDecimals === 6n) {
                officialUsdcWorking = true;
            }
            
        } catch (error) {
            console.log("❌ Official USDC not accessible:", error.message);
        }
        
        // Check our USDC
        try {
            const [ourName, ourSymbol, ourDecimals, ourBalance] = await Promise.all([
                ourUsdc.name(),
                ourUsdc.symbol(),
                ourUsdc.decimals(),
                ourUsdc.balanceOf(userAddress)
            ]);
            
            console.log("✅ Our USDC Name:", ourName);
            console.log("✅ Our USDC Symbol:", ourSymbol);
            console.log("✅ Our USDC Decimals:", ourDecimals.toString());
            console.log("💰 Our USDC Balance:", ethers.formatUnits(ourBalance, ourDecimals), "USDC");
            
        } catch (error) {
            console.log("❌ Our USDC not accessible:", error.message);
        }
        
        if (!officialUsdcWorking) {
            console.log("⚠️  Official USDC not working, will try to mint tokens");
        }
        
        console.log("✅ USDC token verification completed");
        console.log("");

        // Step 1.5: Mint Official USDC if needed
        console.log("📋 STEP 1.5: MINTING OFFICIAL USDC");
        console.log("----------------------------------");
        
        if (!officialUsdcWorking) {
            console.log("🎯 Attempting to mint official USDC...");
            try {
                const mintAmount = ethers.parseUnits("1000", 6); // 1000 USDC
                const mintTx = await officialUsdc.mint(userAddress, mintAmount);
                console.log("📤 Mint transaction sent:", mintTx.hash);
                
                const mintReceipt = await mintTx.wait();
                console.log("✅ Official USDC minted successfully!");
                console.log("⛽ Gas used:", mintReceipt.gasUsed.toString());
                
                // Check new balance
                const newBalance = await officialUsdc.balanceOf(userAddress);
                console.log("💰 New official USDC balance:", ethers.formatUnits(newBalance, 6), "USDC");
                
                officialUsdcWorking = true;
                
            } catch (error) {
                console.log("❌ Failed to mint official USDC:", error.message);
                console.log("💡 This might mean the official USDC doesn't have a mint function");
                console.log("💡 Or the address is incorrect");
            }
        } else {
            console.log("✅ Official USDC is already working");
        }
        console.log("");

        // Step 2: Get Correct Aave Pool Address
        console.log("📋 STEP 2: AAVE POOL ADDRESS VERIFICATION");
        console.log("------------------------------------------");
        
        let aavePoolAddress;
        try {
            aavePoolAddress = await poolAddressProvider.getPool();
            console.log("✅ Pool from provider:", aavePoolAddress);
            console.log("✅ Configured pool:", CONTRACTS.aavePool);
            
            if (aavePoolAddress.toLowerCase() !== CONTRACTS.aavePool.toLowerCase()) {
                console.log("⚠️  Pool address mismatch - using provider address");
                aavePoolAddress = aavePoolAddress; // Use the one from provider
            } else {
                aavePoolAddress = CONTRACTS.aavePool;
            }
            
        } catch (error) {
            console.log("⚠️  Could not get pool from provider:", error.message);
            console.log("🔧 Using configured pool address");
            aavePoolAddress = CONTRACTS.aavePool;
        }
        
        // Create Aave pool contract
        const aavePool = new ethers.Contract(aavePoolAddress, AAVE_POOL_ABI, signer);
        console.log("✅ Using Aave pool:", aavePoolAddress);
        console.log("");

        // Step 3: Get USDC Reserve Data
        console.log("📋 STEP 3: USDC RESERVE DATA");
        console.log("-----------------------------");
        
        let aUsdcAddress;
        let usdcToUse;
        
        if (officialUsdcWorking) {
            usdcToUse = officialUsdc;
            console.log("🎯 Using official USDC for Aave deposit test");
        } else {
            usdcToUse = ourUsdc;
            console.log("🎯 Using our USDC for Aave deposit test");
        }
        
        const usdcAddress = usdcToUse.target;
        console.log("🔍 USDC address to use:", usdcAddress);
        
        try {
            const reserveData = await aavePool.getReserveData(usdcAddress);
            aUsdcAddress = reserveData.aTokenAddress;
            
            console.log("✅ USDC reserve found in Aave");
            console.log("✅ aUSDC address:", aUsdcAddress);
            console.log("✅ Liquidity index:", reserveData.liquidityIndex.toString());
            console.log("✅ Current liquidity rate:", reserveData.currentLiquidityRate.toString());
            
            // Create aUSDC contract
            const aUsdc = new ethers.Contract(aUsdcAddress, ERC20_ABI, provider);
            const aUsdcSymbol = await aUsdc.symbol();
            console.log("✅ aUSDC symbol:", aUsdcSymbol);
            
        } catch (error) {
            console.log("❌ Failed to get USDC reserve data:", error.message);
            throw new Error("Cannot proceed without reserve data");
        }
        console.log("");

        // Step 4: Check Current Balances
        console.log("📋 STEP 4: CURRENT BALANCES");
        console.log("----------------------------");
        
        const aUsdc = new ethers.Contract(aUsdcAddress, ERC20_ABI, provider);
        
        const [currentUsdcBalance, currentAUsdcBalance] = await Promise.all([
            usdcToUse.balanceOf(userAddress),
            aUsdc.balanceOf(userAddress)
        ]);
        
        console.log("💰 Current USDC balance:", ethers.formatUnits(currentUsdcBalance, 6), "USDC");
        console.log("💰 Current aUSDC balance:", ethers.formatUnits(currentAUsdcBalance, 6), "aUSDC");
        console.log("");

        // Step 5: Approve Aave Pool
        console.log("📋 STEP 5: APPROVING AAVE POOL");
        console.log("-------------------------------");
        
        const depositAmount = ethers.parseUnits("5", 6); // 5 USDC
        console.log("💰 Planning to deposit:", ethers.formatUnits(depositAmount, 6), "USDC");
        
        // Check current allowance
        const currentAllowance = await usdcToUse.allowance(userAddress, aavePoolAddress);
        console.log("🔍 Current allowance:", ethers.formatUnits(currentAllowance, 6), "USDC");
        
        if (currentAllowance < depositAmount) {
            console.log("🔐 Setting USDC allowance...");
            const approveTx = await usdcToUse.approve(aavePoolAddress, depositAmount);
            console.log("📤 Approval transaction sent:", approveTx.hash);
            
            const approveReceipt = await approveTx.wait();
            console.log("✅ Approval confirmed!");
            console.log("⛽ Gas used:", approveReceipt.gasUsed.toString());
            
            // Verify allowance
            const newAllowance = await usdcToUse.allowance(userAddress, aavePoolAddress);
            console.log("✅ New allowance:", ethers.formatUnits(newAllowance, 6), "USDC");
        } else {
            console.log("✅ Sufficient allowance already exists");
        }
        console.log("");

        // Step 6: Execute Direct Aave Deposit
        console.log("📋 STEP 6: EXECUTING DIRECT AAVE DEPOSIT");
        console.log("----------------------------------------");
        
        console.log("🎯 Calling Aave pool.supply() directly...");
        console.log("   Asset:", usdcAddress);
        console.log("   Amount:", ethers.formatUnits(depositAmount, 6), "USDC");
        console.log("   OnBehalfOf:", userAddress);
        console.log("   ReferralCode: 0");
        
        try {
            const supplyTx = await aavePool.supply(
                usdcAddress,           // asset
                depositAmount,         // amount
                userAddress,           // onBehalfOf
                0                      // referralCode
            );
            
            console.log("📤 Supply transaction sent:", supplyTx.hash);
            
            const supplyReceipt = await supplyTx.wait();
            console.log("✅ Supply transaction confirmed!");
            console.log("⛽ Gas used:", supplyReceipt.gasUsed.toString());
            console.log("📊 Transaction status:", supplyReceipt.status);
            
            // Check for events
            if (supplyReceipt.logs && supplyReceipt.logs.length > 0) {
                console.log("📋 Transaction events:", supplyReceipt.logs.length);
            }
            
        } catch (error) {
            console.log("❌ Direct Aave deposit failed:", error.message);
            
            // Try to decode the error
            if (error.message.includes("execution reverted")) {
                console.log("💡 This suggests the Aave pool interaction failed");
                console.log("💡 Check if USDC is properly supported in this Aave pool");
            }
            
            throw error;
        }
        console.log("");

        // Step 7: Verify Results
        console.log("📋 STEP 7: VERIFYING RESULTS");
        console.log("-----------------------------");
        
        const [newUsdcBalance, newAUsdcBalance] = await Promise.all([
            usdcToUse.balanceOf(userAddress),
            aUsdc.balanceOf(userAddress)
        ]);
        
        const usdcDecrease = currentUsdcBalance - newUsdcBalance;
        const aUsdcIncrease = newAUsdcBalance - currentAUsdcBalance;
        
        console.log("💰 New USDC balance:", ethers.formatUnits(newUsdcBalance, 6), "USDC");
        console.log("💰 New aUSDC balance:", ethers.formatUnits(newAUsdcBalance, 6), "aUSDC");
        console.log("");
        console.log("📉 USDC decrease:", ethers.formatUnits(usdcDecrease, 6), "USDC");
        console.log("📈 aUSDC increase:", ethers.formatUnits(aUsdcIncrease, 6), "aUSDC");
        
        // Verify the deposit worked
        if (usdcDecrease > 0 && aUsdcIncrease > 0) {
            console.log("");
            console.log("🎉 SUCCESS: Direct Aave deposit worked perfectly!");
            console.log("✅ USDC was successfully deposited to Aave V3");
            console.log("✅ aUSDC tokens were minted correctly");
            console.log("✅ Aave V3 pool is working properly");
            
            // Calculate conversion rate
            const conversionRate = Number(aUsdcIncrease) / Number(usdcDecrease);
            console.log("📊 Conversion rate:", conversionRate.toFixed(6), "(should be close to 1.0)");
            
        } else {
            console.log("");
            console.log("⚠️  UNEXPECTED: Deposit didn't work as expected");
            console.log("💡 USDC decrease:", usdcDecrease.toString());
            console.log("💡 aUSDC increase:", aUsdcIncrease.toString());
        }
        
        console.log("");
        console.log("🎉 DIRECT AAVE DEPOSIT TEST COMPLETED!");
        
        if (usdcDecrease > 0 && aUsdcIncrease > 0) {
            console.log("✅ RESULT: Aave V3 pool is working correctly");
            console.log("✅ RESULT: Direct USDC → aUSDC conversion successful");
            console.log("💡 This means the issue in your strategy is not with Aave itself");
        } else {
            console.log("❌ RESULT: Aave V3 pool interaction failed");
            console.log("💡 This suggests an issue with the Aave pool or USDC token");
        }
        
    } catch (error) {
        console.error("❌ TEST FAILED:", error.message);
        console.error("Stack trace:", error.stack);
        process.exit(1);
    }
}

// Run the test
testDirectAaveDeposit().catch(console.error);
