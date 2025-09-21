const { ethers } = require("hardhat");
require("dotenv").config();

async function debugUniswapStrategy() {
    try {
        console.log("=== DEBUGGING UNISWAP V3 STRATEGY ===");
        
        // Setup provider and wallet
        const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik");
        const wallet = new ethers.Wallet(process.env.PK, provider);
        
        // Contract addresses
        const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
        const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
        const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
        const UNI_STRATEGY_ADDRESS = "0xA87bFB6973b92685C66D2BDc37A670Ee995a4C3B";
        const POOL_ADDRESS = "0xE85292C7BeDF830071cC1C8F7b5aaB5A5391B50A";
        const POSITION_MANAGER_ADDRESS = "0x1238536071e1c677a632429e3655c799b22cda52";
        
        // Contract ABIs
        const strategyABI = [
            "function vault() external view returns (address)",
            "function wantToken() external view returns (address)",
            "function pool() external view returns (address)",
            "function pm() external view returns (address)",
            "function tokenId() external view returns (uint256)",
            "function deposit(uint256 amountWant, bytes[] calldata swaps) external",
            "function totalAssets() external view returns (uint256)"
        ];
        
        const poolABI = [
            "function token0() external view returns (address)",
            "function token1() external view returns (address)",
            "function fee() external view returns (uint24)",
            "function tickSpacing() external view returns (int24)",
            "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
            "function liquidity() external view returns (uint128)"
        ];
        
        const usdcABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function decimals() external view returns (uint8)"
        ];
        
        const wethABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function decimals() external view returns (uint8)"
        ];
        
        // Initialize contracts
        const strategy = new ethers.Contract(UNI_STRATEGY_ADDRESS, strategyABI, wallet);
        const pool = new ethers.Contract(POOL_ADDRESS, poolABI, wallet);
        const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);
        const weth = new ethers.Contract(WETH_ADDRESS, wethABI, wallet);
        
        console.log("\n=== STEP 1: CHECKING STRATEGY CONFIGURATION ===");
        
        // Check strategy configuration
        const strategyVault = await strategy.vault();
        const strategyWantToken = await strategy.wantToken();
        const strategyPool = await strategy.pool();
        const strategyPm = await strategy.pm();
        const strategyTokenId = await strategy.tokenId();
        
        console.log("Strategy vault:", strategyVault);
        console.log("Strategy wantToken:", strategyWantToken);
        console.log("Strategy pool:", strategyPool);
        console.log("Strategy position manager:", strategyPm);
        console.log("Strategy tokenId:", strategyTokenId.toString());
        
        console.log("\nExpected values:");
        console.log("Expected vault:", VAULT_ADDRESS);
        console.log("Expected wantToken:", USDC_ADDRESS);
        console.log("Expected pool:", POOL_ADDRESS);
        console.log("Expected position manager:", POSITION_MANAGER_ADDRESS);
        
        console.log("\nConfiguration matches:");
        console.log("Vault match:", strategyVault.toLowerCase() === VAULT_ADDRESS.toLowerCase());
        console.log("WantToken match:", strategyWantToken.toLowerCase() === USDC_ADDRESS.toLowerCase());
        console.log("Pool match:", strategyPool.toLowerCase() === POOL_ADDRESS.toLowerCase());
        console.log("PM match:", strategyPm.toLowerCase() === POSITION_MANAGER_ADDRESS.toLowerCase());
        
        console.log("\n=== STEP 2: CHECKING POOL STATE ===");
        
        // Check pool configuration
        const poolToken0 = await pool.token0();
        const poolToken1 = await pool.token1();
        const poolFee = await pool.fee();
        const poolTickSpacing = await pool.tickSpacing();
        const poolLiquidity = await pool.liquidity();
        
        console.log("Pool token0:", poolToken0);
        console.log("Pool token1:", poolToken1);
        console.log("Pool fee:", poolFee.toString());
        console.log("Pool tick spacing:", poolTickSpacing.toString());
        console.log("Pool liquidity:", poolLiquidity.toString());
        
        // Check current pool state
        const slot0 = await pool.slot0();
        const currentTick = slot0.tick;
        const sqrtPriceX96 = slot0.sqrtPriceX96;
        
        console.log("Current tick:", currentTick.toString());
        console.log("Current sqrtPriceX96:", sqrtPriceX96.toString());
        
        console.log("\n=== STEP 3: CHECKING TOKEN BALANCES ===");
        
        // Check token balances
        const vaultUSDCBalance = await usdc.balanceOf(VAULT_ADDRESS);
        const vaultWETHBalance = await weth.balanceOf(VAULT_ADDRESS);
        const strategyUSDCBalance = await usdc.balanceOf(UNI_STRATEGY_ADDRESS);
        const strategyWETHBalance = await weth.balanceOf(UNI_STRATEGY_ADDRESS);
        
        console.log("Vault USDC balance:", ethers.formatUnits(vaultUSDCBalance, 6), "USDC");
        console.log("Vault WETH balance:", ethers.formatUnits(vaultWETHBalance, 18), "WETH");
        console.log("Strategy USDC balance:", ethers.formatUnits(strategyUSDCBalance, 6), "USDC");
        console.log("Strategy WETH balance:", ethers.formatUnits(strategyWETHBalance, 18), "WETH");
        
        console.log("\n=== STEP 4: CHECKING TICK CALCULATIONS ===");
        
        // Calculate ticks that would be used in deposit
        const spacing = Number(poolTickSpacing);
        const tick = Number(currentTick);
        
        console.log("Tick spacing:", spacing);
        console.log("Current tick:", tick);
        
        // Calculate lower and upper ticks (same logic as in UniswapV3Strategy.sol)
        const lower = (Math.floor(tick / spacing) - 100) * spacing;
        const upper = (Math.floor(tick / spacing) + 100) * spacing;
        
        console.log("Calculated tickLower:", lower);
        console.log("Calculated tickUpper:", upper);
        
        // Check if ticks are valid
        const MIN_TICK = -887272;
        const MAX_TICK = 887272;
        
        console.log("\nTick validation:");
        console.log("Lower tick valid:", lower >= MIN_TICK && lower <= MAX_TICK);
        console.log("Upper tick valid:", upper >= MIN_TICK && upper <= MAX_TICK);
        console.log("Lower < Upper:", lower < upper);
        console.log("Lower aligned to spacing:", lower % spacing === 0);
        console.log("Upper aligned to spacing:", upper % spacing === 0);
        
        console.log("\n=== STEP 5: CHECKING POOL LIQUIDITY REQUIREMENTS ===");
        
        // Check if pool has sufficient liquidity
        if (poolLiquidity === 0n) {
            console.log("❌ CRITICAL: Pool has NO liquidity!");
            console.log("This will cause the mint/increaseLiquidity calls to fail");
        } else {
            console.log("✅ Pool has liquidity:", poolLiquidity.toString());
        }
        
        // Check if current tick is within reasonable range
        if (tick < MIN_TICK || tick > MAX_TICK) {
            console.log("❌ CRITICAL: Current tick is out of bounds!");
            console.log("Current tick:", tick, "Min:", MIN_TICK, "Max:", MAX_TICK);
        } else {
            console.log("✅ Current tick is within bounds");
        }
        
        console.log("\n=== STEP 6: CHECKING STRATEGY TOTAL ASSETS ===");
        
        // Check strategy total assets
        try {
            const totalAssets = await strategy.totalAssets();
            console.log("Strategy total assets:", ethers.formatUnits(totalAssets, 6), "USDC");
        } catch (error) {
            console.log("❌ Error getting strategy total assets:", error.message);
        }
        
        console.log("\n=== STEP 7: SIMULATING DEPOSIT CALL ===");
        
        // Simulate what would happen in deposit
        console.log("Simulating deposit call:");
        console.log("1. Strategy would call transferFrom(vault, strategy, amountWant)");
        console.log("2. Strategy would call _executeSwaps(swaps)");
        console.log("3. Strategy would check balances and approve position manager");
        console.log("4. Strategy would call pm.mint() or pm.increaseLiquidity()");
        
        // Check if strategy has existing position
        if (strategyTokenId === 0n) {
            console.log("Strategy has no existing position - would call pm.mint()");
            console.log("Mint parameters would be:");
            console.log("- token0:", poolToken0);
            console.log("- token1:", poolToken1);
            console.log("- fee:", poolFee.toString());
            console.log("- tickLower:", lower);
            console.log("- tickUpper:", upper);
            console.log("- amount0Desired: [strategy's token0 balance]");
            console.log("- amount1Desired: [strategy's token1 balance]");
        } else {
            console.log("Strategy has existing position (tokenId:", strategyTokenId.toString(), ") - would call pm.increaseLiquidity()");
        }
        
        console.log("\n=== STEP 8: POTENTIAL ISSUES ===");
        
        // Identify potential issues
        const issues = [];
        
        if (poolLiquidity === 0n) {
            issues.push("Pool has no liquidity - mint/increaseLiquidity will fail");
        }
        
        if (lower >= upper) {
            issues.push("Invalid tick range - lower >= upper");
        }
        
        if (lower % spacing !== 0 || upper % spacing !== 0) {
            issues.push("Ticks not aligned to spacing");
        }
        
        if (vaultUSDCBalance === 0n) {
            issues.push("Vault has no USDC to deposit");
        }
        
        if (strategyTokenId === 0n && strategyUSDCBalance === 0n && strategyWETHBalance === 0n) {
            issues.push("Strategy has no tokens and no existing position - mint will fail");
        }
        
        if (issues.length > 0) {
            console.log("❌ POTENTIAL ISSUES FOUND:");
            issues.forEach((issue, index) => {
                console.log(`${index + 1}. ${issue}`);
            });
        } else {
            console.log("✅ No obvious issues found in configuration");
        }
        
        console.log("\n=== STEP 9: RECOMMENDATIONS ===");
        
        if (poolLiquidity === 0n) {
            console.log("🔧 RECOMMENDATION: Add liquidity to the pool first");
            console.log("The pool needs initial liquidity before strategies can mint positions");
        }
        
        if (vaultUSDCBalance === 0n) {
            console.log("🔧 RECOMMENDATION: Deposit USDC to vault first");
            console.log("The vault needs USDC before investIdle can work");
        }
        
        console.log("\n=== CONCLUSION ===");
        console.log("The 'missing revert data' error is likely caused by:");
        console.log("1. Pool having no liquidity (most likely)");
        console.log("2. Invalid tick calculations");
        console.log("3. Strategy having no tokens to deposit");
        console.log("4. Position manager contract issues");
        
    } catch (error) {
        console.error("Debug failed:", error);
    }
}

debugUniswapStrategy();
