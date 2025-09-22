/*
  Create a new balanced pool with the new WETH token and existing USDC.
  
  This will create a fresh pool with the correct price ratio: 1 WETH = 100 USDC
*/

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=== CREATING NEW BALANCED POOL WITH NEW WETH ===");

    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);

    // Contract addresses
    const NEW_WETH_ADDRESS = "0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762"; // New WETH we just deployed
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"; // Existing USDC
    const UNISWAP_POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
    const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const POOL_FEE = 500; // 0.05% fee tier

    const erc20ABI = [
        "function balanceOf(address account) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
        "function symbol() external view returns (string)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)",
        "function mint(address to, uint256 amount) external", // For RateLimitedERC20
    ];
    const factoryABI = [
        "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
        "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)",
    ];
    const poolABI = [
        "function token0() external view returns (address)",
        "function token1() external view returns (address)",
        "function fee() external view returns (uint24)",
        "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
        "function liquidity() external view returns (uint128)",
        "function tickSpacing() external view returns (int24)",
        "function initialize(uint160 sqrtPriceX96) external",
    ];
    const positionManagerABI = [
        "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
    ];

    const newWETH = new ethers.Contract(NEW_WETH_ADDRESS, erc20ABI, deployer);
    const usdc = new ethers.Contract(USDC_ADDRESS, erc20ABI, deployer);
    const factory = new ethers.Contract(UNISWAP_V3_FACTORY, factoryABI, deployer);
    const positionManager = new ethers.Contract(UNISWAP_POSITION_MANAGER, positionManagerABI, deployer);

    console.log("\n=== STEP 1: CHECKING TOKEN DETAILS ===");
    
    const [newWETHSymbol, newWETHDecimals, usdcSymbol, usdcDecimals] = await Promise.all([
        newWETH.symbol(),
        newWETH.decimals(),
        usdc.symbol(),
        usdc.decimals(),
    ]);
    
    console.log("New WETH:", NEW_WETH_ADDRESS);
    console.log("- Symbol:", newWETHSymbol);
    console.log("- Decimals:", newWETHDecimals.toString());
    
    console.log("USDC:", USDC_ADDRESS);
    console.log("- Symbol:", usdcSymbol);
    console.log("- Decimals:", usdcDecimals.toString());

    console.log("\n=== STEP 2: MINTING TOKENS FOR TESTING ===");
    
    // Mint tokens for the deployer
    const mintAmountWETH = ethers.parseEther("100"); // 100 WETH
    const mintAmountUSDC = ethers.parseUnits("10000", usdcDecimals); // 10,000 USDC
    
    try {
        console.log("Minting WETH...");
        const mintWETHTx = await newWETH.mint(deployer.address, mintAmountWETH);
        await mintWETHTx.wait();
        console.log("✅ WETH minted:", ethers.formatEther(mintAmountWETH), "WETH");
        
        // For USDC, we'll need to get some from a faucet or existing balance
        const currentUSDCBalance = await usdc.balanceOf(deployer.address);
        console.log("Current USDC balance:", ethers.formatUnits(currentUSDCBalance, usdcDecimals), "USDC");
        
        if (currentUSDCBalance < mintAmountUSDC) {
            console.log("⚠️  Insufficient USDC balance. Please fund deployer with USDC from faucet.");
            console.log("You can get USDC from: https://sepoliafaucet.com/");
            return;
        }
        
    } catch (error) {
        console.error("❌ Failed to mint tokens:", error.message);
        throw error;
    }

    console.log("\n=== STEP 3: CHECKING EXISTING POOL ===");
    
    let newPoolAddress = await factory.getPool(NEW_WETH_ADDRESS, USDC_ADDRESS, POOL_FEE);
    console.log("Existing pool for new WETH/USDC:", newPoolAddress);
    
    if (newPoolAddress !== ethers.ZeroAddress) {
        console.log("❌ Pool already exists! Cannot create new pool with same tokens and fee.");
        return;
    }

    console.log("\n=== STEP 4: CREATING NEW POOL ===");
    
    // Sort tokens by address for Uniswap
    const [token0, token1] = NEW_WETH_ADDRESS.toLowerCase() < USDC_ADDRESS.toLowerCase()
        ? [NEW_WETH_ADDRESS, USDC_ADDRESS]
        : [USDC_ADDRESS, NEW_WETH_ADDRESS];

    console.log("Token0:", token0);
    console.log("Token1:", token1);

    // Target price: 1 WETH = 100 USDC
    // Calculate sqrtPriceX96 for this price
    let sqrtPriceX96;
    
    if (token0 === NEW_WETH_ADDRESS) {
        // token0 = WETH (18 decimals), token1 = USDC (6 decimals)
        // Price = 100 USDC per 1 WETH
        // sqrtPriceX96 = sqrt(100 * 10^6 / 10^18) * 2^96
        const price = (100n * (10n ** BigInt(usdcDecimals))) / (10n ** BigInt(newWETHDecimals));
        const sqrtPrice = sqrtBigInt(price);
        sqrtPriceX96 = sqrtPrice * (2n ** 96n);
        console.log("Price calculation: 1 WETH = 100 USDC");
    } else {
        // token0 = USDC (6 decimals), token1 = WETH (18 decimals)
        // Price = 1 WETH per 100 USDC
        // sqrtPriceX96 = sqrt(10^18 / (100 * 10^6)) * 2^96
        const price = (10n ** BigInt(newWETHDecimals)) / (100n * (10n ** BigInt(usdcDecimals)));
        const sqrtPrice = sqrtBigInt(price);
        sqrtPriceX96 = sqrtPrice * (2n ** 96n);
        console.log("Price calculation: 1 WETH = 100 USDC");
    }

    console.log("Calculated sqrtPriceX96:", sqrtPriceX96.toString());

    try {
        console.log("Creating pool...");
        const createPoolTx = await factory.createPool(token0, token1, POOL_FEE);
        const receipt = await createPoolTx.wait();
        newPoolAddress = await factory.getPool(token0, token1, POOL_FEE);
        console.log("✅ Pool created at:", newPoolAddress);

        const newPool = new ethers.Contract(newPoolAddress, poolABI, deployer);
        console.log("Initializing pool with sqrtPriceX96...");
        const initializeTx = await newPool.initialize(sqrtPriceX96);
        await initializeTx.wait();
        console.log("✅ Pool initialized!");

    } catch (error) {
        console.error("❌ Pool creation failed:", error.message);
        throw error;
    }

    console.log("\n=== STEP 5: ADDING INITIAL LIQUIDITY ===");
    
    const amount0Desired = ethers.parseEther("60"); // 60 WETH
    const amount1Desired = ethers.parseUnits("6000", usdcDecimals); // 6000 USDC

    // Get current tick and calculate tick range
    const newPool = new ethers.Contract(newPoolAddress, poolABI, deployer);
    const currentTick = (await newPool.slot0()).tick;
    const tickSpacing = await newPool.tickSpacing();
    const tickLower = (currentTick / tickSpacing - 100) * tickSpacing;
    const tickUpper = (currentTick / tickSpacing + 100) * tickSpacing;

    console.log("Current tick:", currentTick.toString());
    console.log("Tick spacing:", tickSpacing.toString());
    console.log("Tick lower:", tickLower.toString());
    console.log("Tick upper:", tickUpper.toString());

    const mintParams = {
        token0: token0,
        token1: token1,
        fee: POOL_FEE,
        tickLower: tickLower,
        tickUpper: tickUpper,
        amount0Desired: amount0Desired,
        amount1Desired: amount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: deployer.address,
        deadline: (await ethers.provider.getBlock("latest")).timestamp + 3600,
    };

    console.log("Mint parameters:", mintParams);

    try {
        console.log("Approving tokens for position manager...");
        await newWETH.approve(UNISWAP_POSITION_MANAGER, amount0Desired);
        await usdc.approve(UNISWAP_POSITION_MANAGER, amount1Desired);
        console.log("✅ Tokens approved!");

        console.log("Testing mint with static call...");
        await positionManager.mint.staticCall(mintParams);
        console.log("✅ Static call successful!");

        console.log("Executing actual mint...");
        const tx = await positionManager.mint(mintParams);
        const receipt = await tx.wait();
        console.log("Mint transaction confirmed:", receipt.hash);
        console.log("Gas used:", receipt.gasUsed.toString());
        console.log("Status:", receipt.status);

        if (receipt.status === 1) {
            console.log("🎉 INITIAL LIQUIDITY ADDED SUCCESSFULLY!");
        } else {
            console.log("❌ INITIAL LIQUIDITY ADDITION FAILED: Transaction reverted");
        }
    } catch (error) {
        console.error("❌ Initial liquidity addition failed:", error.message);
        throw error;
    }

    console.log("\n=== STEP 6: VERIFYING NEW POOL ===");
    
    const newPoolLiquidity = (await newPool.liquidity()).toString();
    const newSlot0 = await newPool.slot0();
    const newPoolToken0Balance = await new ethers.Contract(token0, erc20ABI, deployer).balanceOf(newPoolAddress);
    const newPoolToken1Balance = await new ethers.Contract(token1, erc20ABI, deployer).balanceOf(newPoolAddress);
    
    console.log("New pool address:", newPoolAddress);
    console.log("New pool liquidity:", newPoolLiquidity);
    console.log("New current tick:", newSlot0.tick.toString());
    console.log("New sqrtPriceX96:", newSlot0.sqrtPriceX96.toString());
    
    if (token0 === NEW_WETH_ADDRESS) {
        console.log("New Pool WETH balance:", ethers.formatEther(newPoolToken0Balance), "WETH");
        console.log("New Pool USDC balance:", ethers.formatUnits(newPoolToken1Balance, usdcDecimals), "USDC");
    } else {
        console.log("New Pool USDC balance:", ethers.formatUnits(newPoolToken0Balance, usdcDecimals), "USDC");
        console.log("New Pool WETH balance:", ethers.formatEther(newPoolToken1Balance), "WETH");
    }

    console.log("\n🎉 NEW BALANCED POOL CREATION COMPLETED!");
    console.log("\n📋 NEW POOL DETAILS:");
    console.log(`- Pool Address: ${newPoolAddress}`);
    console.log(`- Token0: ${token0}`);
    console.log(`- Token1: ${token1}`);
    console.log(`- Fee: ${POOL_FEE} (0.05%)`);
    console.log(`- Price: 1 WETH = 100 USDC`);
    console.log(`- Liquidity: 60 WETH + 6000 USDC`);
    
    console.log("\n💡 NEXT STEPS:");
    console.log("1. Update your DEPLOYEDCONTRACT.me with the new pool address");
    console.log("2. Update your UniswapV3Strategy to use this new pool");
    console.log("3. Test investIdle functionality with the balanced pool");
    console.log("4. Test swaps to verify the pool works correctly");
}

// Helper function for BigInt square root
function sqrtBigInt(n) {
    if (n < 0n) throw new Error("sqrt of negative number");
    if (n === 0n) return 0n;
    let x = n;
    let y = (x + 1n) / 2n;
    while (y < x) {
        x = y;
        y = (x + n / x) / 2n;
    }
    return x;
}

main().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
});
