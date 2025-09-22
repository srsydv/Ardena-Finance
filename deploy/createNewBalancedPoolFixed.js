/*
  Create a new balanced pool using the WORKING Uniswap V3 addresses from UniswapV3MockPool.js
  
  This uses the same approach that successfully created pools before.
*/

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=== CREATING NEW BALANCED POOL WITH WORKING ADDRESSES ===");

    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);

    // Use the WORKING addresses from UniswapV3MockPool.js
    const UNIV3_FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c"; // WORKING factory
    const NFP_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52"; // Position manager
    
    // Token addresses
    const NEW_WETH_ADDRESS = "0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762"; // Our new WETH
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"; // Existing USDC
    
    const FEE = 500; // 0.05% fee tier
    const INIT_USDC_PER_WETH = 100; // Target price: 1 WETH = 100 USDC

    // ABIs from working script
    const IUniswapV3FactoryABI = [
        "function getPool(address,address,uint24) view returns (address)",
    ];

    const INonfungiblePositionManagerABI = [
        "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) returns (address pool)",
        "function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
    ];

    const IUniswapV3PoolABI = [
        "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
        "function tickSpacing() view returns (int24)",
        "function fee() view returns (uint24)",
        "function token0() view returns (address)",
        "function token1() view returns (address)",
        "function liquidity() view returns (uint128)",
    ];

    const ERC20_META = [
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function approve(address,uint256) returns (bool)",
        "function balanceOf(address) view returns (uint256)",
        "function mint(address to, uint256 amount) external", // For RateLimitedERC20
    ];

    console.log("\n=== STEP 1: VERIFYING WORKING ADDRESSES ===");
    
    // Check that the working addresses have code
    const codeF = await ethers.provider.getCode(UNIV3_FACTORY);
    const codePM = await ethers.provider.getCode(NFP_MANAGER);
    
    if (codeF === "0x") {
        throw new Error(`UniswapV3Factory not deployed: ${UNIV3_FACTORY}`);
    }
    if (codePM === "0x") {
        throw new Error(`NonfungiblePositionManager not deployed: ${NFP_MANAGER}`);
    }
    
    console.log("✅ Factory code length:", codeF === "0x" ? 0 : codeF.length);
    console.log("✅ Position Manager code length:", codePM === "0x" ? 0 : codePM.length);

    console.log("\n=== STEP 2: SETTING UP CONTRACTS ===");
    
    const factory = await ethers.getContractAt(IUniswapV3FactoryABI, UNIV3_FACTORY);
    const pm = await ethers.getContractAt(INonfungiblePositionManagerABI, NFP_MANAGER);

    // Sort tokens for Uniswap (token0 < token1)
    const [t0, t1] = NEW_WETH_ADDRESS.toLowerCase() < USDC_ADDRESS.toLowerCase() 
        ? [NEW_WETH_ADDRESS, USDC_ADDRESS] 
        : [USDC_ADDRESS, NEW_WETH_ADDRESS];

    console.log("Token0:", t0);
    console.log("Token1:", t1);

    // Read token details
    const [t0c, t1c] = await Promise.all([
        ethers.getContractAt(ERC20_META, t0),
        ethers.getContractAt(ERC20_META, t1),
    ]);
    
    const [sym0, sym1, dec0, dec1] = await Promise.all([
        t0c.symbol(),
        t1c.symbol(),
        t0c.decimals(),
        t1c.decimals(),
    ]);

    console.log("Token0:", sym0, "decimals:", dec0.toString());
    console.log("Token1:", sym1, "decimals:", dec1.toString());

    console.log("\n=== STEP 3: MINTING TOKENS ===");
    
    // Mint tokens for testing
    const mintAmountWETH = ethers.parseEther("100"); // 100 WETH
    const mintAmountUSDC = ethers.parseUnits("10000", dec1); // 10,000 USDC
    
    try {
        console.log("Minting WETH...");
        const mintWETHTx = await t0c.mint(deployer.address, mintAmountWETH);
        await mintWETHTx.wait();
        console.log("✅ WETH minted:", ethers.formatEther(mintAmountWETH), "WETH");
        
        // Check USDC balance
        const currentUSDCBalance = await t1c.balanceOf(deployer.address);
        console.log("Current USDC balance:", ethers.formatUnits(currentUSDCBalance, dec1), "USDC");
        
        if (currentUSDCBalance < mintAmountUSDC) {
            console.log("⚠️  Insufficient USDC balance. Please fund deployer with USDC from faucet.");
            return;
        }
        
    } catch (error) {
        console.error("❌ Failed to mint tokens:", error.message);
        throw error;
    }

    console.log("\n=== STEP 4: CALCULATING INITIAL PRICE ===");
    
    // Calculate sqrtPriceX96 for 1 WETH = 100 USDC
    const usdcPerWeth = BigInt(INIT_USDC_PER_WETH);
    let amount0, amount1;
    
    if (t0.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
        // token0=USDC(6), token1=WETH(18): 1 WETH = 100 USDC
        amount0 = usdcPerWeth * (10n ** BigInt(dec0)); // 100 USDC
        amount1 = 1n * (10n ** BigInt(dec1)); // 1 WETH
    } else {
        // token0=WETH(18), token1=USDC(6)
        amount0 = 1n * (10n ** BigInt(dec0)); // 1 WETH
        amount1 = usdcPerWeth * (10n ** BigInt(dec1)); // 100 USDC
    }

    console.log("Amount0:", amount0.toString());
    console.log("Amount1:", amount1.toString());

    // Calculate sqrtPriceX96 using the working formula
    const sqrtPriceX96 = encodeSqrtPriceX96ByAmounts(amount1, amount0);
    console.log("Calculated sqrtPriceX96:", sqrtPriceX96.toString());

    console.log("\n=== STEP 5: CREATING AND INITIALIZING POOL ===");
    
    try {
        console.log("Creating and initializing pool...");
        const tx = await pm.createAndInitializePoolIfNecessary(
            t0,
            t1,
            FEE,
            sqrtPriceX96
        );
        const rc = await tx.wait();
        const poolAddr = await factory.getPool(t0, t1, FEE);
        
        console.log("✅ Pool created at:", poolAddr);
        console.log(`Initialized ${sym0}/${sym1} fee=${FEE} sqrtPriceX96=${sqrtPriceX96.toString()}`);

    } catch (error) {
        console.error("❌ Pool creation failed:", error.message);
        throw error;
    }

    console.log("\n=== STEP 6: ADDING INITIAL LIQUIDITY ===");
    
    const poolAddr = await factory.getPool(t0, t1, FEE);
    const pool = await ethers.getContractAt(IUniswapV3PoolABI, poolAddr);
    const spacing = Number(await pool.tickSpacing());
    const s0 = await pool.slot0();
    const tick = Number(s0.tick);
    const nearest = Math.floor(tick / spacing) * spacing;
    const k = 100; // ±100 spacings for wider range
    const lower = nearest - k * spacing;
    const upper = nearest + k * spacing;

    console.log("Current tick:", tick);
    console.log("Tick spacing:", spacing);
    console.log("Tick lower:", lower);
    console.log("Tick upper:", upper);

    // Seed amounts
    const SEED_WETH_WEI = ethers.parseEther("60"); // 60 WETH
    const SEED_USDC = ethers.parseUnits("6000", dec1); // 6000 USDC

    // Approve tokens
    const [cW, cU] = await Promise.all([
        ethers.getContractAt(ERC20_META, NEW_WETH_ADDRESS),
        ethers.getContractAt(ERC20_META, USDC_ADDRESS),
    ]);
    
    console.log("Approving tokens...");
    await (await cW.approve(NFP_MANAGER, SEED_WETH_WEI)).wait();
    await (await cU.approve(NFP_MANAGER, SEED_USDC)).wait();
    console.log("✅ Tokens approved");

    // Map desired amounts to amount0/1 for mint params
    const amount0Desired = t0.toLowerCase() === USDC_ADDRESS.toLowerCase() 
        ? SEED_USDC 
        : SEED_WETH_WEI;
    const amount1Desired = t1.toLowerCase() === USDC_ADDRESS.toLowerCase() 
        ? SEED_USDC 
        : SEED_WETH_WEI;

    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 1800;
    const mintArgs = {
        token0: t0,
        token1: t1,
        fee: FEE,
        tickLower: lower,
        tickUpper: upper,
        amount0Desired,
        amount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: deployer.address,
        deadline,
    };

    console.log("Mint parameters:", mintArgs);

    try {
        console.log("Adding liquidity...");
        const m = await pm.mint([
            mintArgs.token0,
            mintArgs.token1,
            mintArgs.fee,
            mintArgs.tickLower,
            mintArgs.tickUpper,
            mintArgs.amount0Desired,
            mintArgs.amount1Desired,
            mintArgs.amount0Min,
            mintArgs.amount1Min,
            mintArgs.recipient,
            mintArgs.deadline
        ]);
        const mr = await m.wait();
        
        console.log("✅ Liquidity added successfully!");
        console.log("Seeded liquidity. lower=", lower, "upper=", upper);
        console.log("Pool L:", (await pool.liquidity()).toString());

    } catch (error) {
        console.error("❌ Liquidity addition failed:", error.message);
        throw error;
    }

    console.log("\n=== STEP 7: VERIFYING NEW POOL ===");
    
    const finalPoolLiquidity = (await pool.liquidity()).toString();
    const finalSlot0 = await pool.slot0();
    const finalPoolToken0Balance = await t0c.balanceOf(poolAddr);
    const finalPoolToken1Balance = await t1c.balanceOf(poolAddr);
    
    console.log("Final pool address:", poolAddr);
    console.log("Final pool liquidity:", finalPoolLiquidity);
    console.log("Final current tick:", finalSlot0.tick.toString());
    console.log("Final sqrtPriceX96:", finalSlot0.sqrtPriceX96.toString());
    
    if (t0.toLowerCase() === NEW_WETH_ADDRESS.toLowerCase()) {
        console.log("Final Pool WETH balance:", ethers.formatEther(finalPoolToken0Balance), "WETH");
        console.log("Final Pool USDC balance:", ethers.formatUnits(finalPoolToken1Balance, dec1), "USDC");
    } else {
        console.log("Final Pool USDC balance:", ethers.formatUnits(finalPoolToken0Balance, dec0), "USDC");
        console.log("Final Pool WETH balance:", ethers.formatEther(finalPoolToken1Balance), "WETH");
    }

    console.log("\n🎉 NEW BALANCED POOL CREATION COMPLETED!");
    console.log("\n📋 NEW POOL DETAILS:");
    console.log(`- Pool Address: ${poolAddr}`);
    console.log(`- Token0: ${t0} (${sym0})`);
    console.log(`- Token1: ${t1} (${sym1})`);
    console.log(`- Fee: ${FEE} (0.05%)`);
    console.log(`- Price: 1 WETH = 100 USDC`);
    console.log(`- Liquidity: 60 WETH + 6000 USDC`);
    
    console.log("\n💡 NEXT STEPS:");
    console.log("1. Update your DEPLOYEDCONTRACT.me with the new pool address");
    console.log("2. Update your UniswapV3Strategy to use this new pool");
    console.log("3. Test investIdle functionality with the balanced pool");
    console.log("4. Test swaps to verify the pool works correctly");
}

// Helper function for BigInt square root (from working script)
function sqrtBigInt(n) {
    if (n <= 1n) return n;
    let x0 = n,
        x1 = (n >> 1n) + 1n;
    while (x1 < x0) {
        x0 = x1;
        x1 = (x1 + n / x1) >> 1n;
    }
    return x0;
}

// sqrtPriceX96 from token1/token0 amounts (from working script)
function encodeSqrtPriceX96ByAmounts(amount1, amount0) {
    // sqrtPriceX96 = floor( sqrt((amount1 << 192) / amount0) )
    const ratio = (amount1 << 192n) / amount0;
    return sqrtBigInt(ratio);
}

main().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
});
