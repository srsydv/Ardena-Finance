const { ethers } = require("hardhat");

async function debugPool() {
    console.log("=== Debugging Uniswap V3 Pool ===");
    
    // Your pool details
    const POOL_ADDRESS = "0xE85292C7BeDF830071cC1C8F7b5aaB5A5391B50A";
    const POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
    
    // Get signer
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    
    // Check balances
    const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
    const weth = await ethers.getContractAt("IERC20", WETH_ADDRESS);
    
    const usdcBalance = await usdc.balanceOf(deployer.address);
    const wethBalance = await weth.balanceOf(deployer.address);
    
    console.log("\n=== Token Balances ===");
    console.log("USDC Balance:", ethers.formatUnits(usdcBalance, 6));
    console.log("WETH Balance:", ethers.formatEther(wethBalance));
    
    // Check approvals
    const positionManager = await ethers.getContractAt("INonfungiblePositionManager", POSITION_MANAGER);
    
    const usdcAllowance = await usdc.allowance(deployer.address, POSITION_MANAGER);
    const wethAllowance = await weth.allowance(deployer.address, POSITION_MANAGER);
    
    console.log("\n=== Approvals ===");
    console.log("USDC Allowance:", ethers.formatUnits(usdcAllowance, 6));
    console.log("WETH Allowance:", ethers.formatEther(wethAllowance));
    
    // Check pool state
    const poolABI = [
        "function token0() view returns (address)",
        "function token1() view returns (address)",
        "function fee() view returns (uint24)",
        "function tickSpacing() view returns (int24)",
        "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
    ];
    
    const pool = await ethers.getContractAt(poolABI, POOL_ADDRESS);
    
    console.log("\n=== Pool State ===");
    const token0 = await pool.token0();
    const token1 = await pool.token1();
    const fee = await pool.fee();
    const tickSpacing = await pool.tickSpacing();
    const slot0 = await pool.slot0();
    
    console.log("Pool Address:", POOL_ADDRESS);
    console.log("Token0:", token0);
    console.log("Token1:", token1);
    console.log("Fee:", fee.toString());
    console.log("Tick Spacing:", tickSpacing.toString());
    console.log("Current sqrtPriceX96:", slot0.sqrtPriceX96.toString());
    console.log("Current tick:", slot0.tick.toString());
    
    // Determine if our token order is correct
    const isWETHToken0 = WETH_ADDRESS.toLowerCase() === token0.toLowerCase();
    const isUSDCToken1 = USDC_ADDRESS.toLowerCase() === token1.toLowerCase();
    
    console.log("\n=== Token Order Check ===");
    console.log("Is WETH token0?", isWETHToken0);
    console.log("Is USDC token1?", isUSDCToken1);
    
    if (!isWETHToken0 || !isUSDCToken1) {
        console.log("❌ TOKEN ORDER MISMATCH!");
        console.log("Expected: WETH as token0, USDC as token1");
        console.log("Actual: token0 =", token0, "token1 =", token1);
    } else {
        console.log("✅ Token order is correct");
    }
    
    // Check if we have enough balance
    const requiredUSDC = ethers.parseUnits("2000", 6);
    const requiredWETH = ethers.parseEther("20");
    
    console.log("\n=== Balance Check ===");
    console.log("Required USDC:", ethers.formatUnits(requiredUSDC, 6));
    console.log("Required WETH:", ethers.formatEther(requiredWETH));
    console.log("Have enough USDC?", usdcBalance >= requiredUSDC);
    console.log("Have enough WETH?", wethBalance >= requiredWETH);
    
    // Check if we have enough allowance
    console.log("\n=== Allowance Check ===");
    console.log("USDC allowance sufficient?", usdcAllowance >= requiredUSDC);
    console.log("WETH allowance sufficient?", wethAllowance >= requiredWETH);
    
    // Calculate current price
    const Q96 = BigInt(2) ** BigInt(96);
    const sqrtPrice = BigInt(slot0.sqrtPriceX96.toString());
    const price = (sqrtPrice * sqrtPrice) / (Q96 * Q96);
    
    console.log("\n=== Current Price Analysis ===");
    console.log("Current price (raw):", price.toString());
    
    // Convert to human readable
    if (isWETHToken0) {
        // token0/token1 = WETH/USDC, so invert to get USDC per WETH
        const oneEther = BigInt("1000000000000000000"); // 1e18
        const oneUSDC = BigInt("1000000"); // 1e6
        const usdcPerWeth = (oneEther * oneUSDC) / price;
        console.log("Current USDC per WETH:", Number(usdcPerWeth) / 1000000);
    }
    
    // Check if our tick range makes sense
    console.log("\n=== Tick Range Check ===");
    console.log("Current tick:", slot0.tick.toString());
    console.log("Your tickLower:", -47010);
    console.log("Your tickUpper:", -45000);
    console.log("Current tick in range?", slot0.tick >= -47010 && slot0.tick <= -45000);
    
    // Suggest fixes
    console.log("\n=== Suggested Fixes ===");
    
    if (usdcBalance < requiredUSDC) {
        console.log("❌ Need more USDC. Current:", ethers.formatUnits(usdcBalance, 6), "Required: 2000");
    }
    
    if (wethBalance < requiredWETH) {
        console.log("❌ Need more WETH. Current:", ethers.formatEther(wethBalance), "Required: 20");
    }
    
    if (usdcAllowance < requiredUSDC) {
        console.log("❌ Need to approve USDC. Run: await usdc.approve(POSITION_MANAGER, requiredUSDC)");
    }
    
    if (wethAllowance < requiredWETH) {
        console.log("❌ Need to approve WETH. Run: await weth.approve(POSITION_MANAGER, requiredWETH)");
    }
    
    if (!isWETHToken0 || !isUSDCToken1) {
        console.log("❌ Wrong token order in mint parameters!");
        console.log("Correct parameters should be:");
        console.log("token0:", token0);
        console.log("token1:", token1);
    }
}

debugPool().catch(console.error);
