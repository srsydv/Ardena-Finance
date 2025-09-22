/*
  Create a new balanced pool with proper 1 WETH = 100 USDC ratio.
  
  This will create a fresh pool that works correctly for swaps.
*/

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=== CREATING NEW BALANCED POOL ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Contract addresses
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
    const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
    const POOL_FEE = 500;
    
    try {
        // Initialize contracts
        const erc20ABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function symbol() external view returns (string)",
            "function decimals() external view returns (uint8)",
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function allowance(address owner, address spender) external view returns (uint256)",
        ];
        
        const factoryABI = [
            "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
            "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)",
        ];
        
        const poolABI = [
            "function token0() external view returns (address)",
            "function token1() external view returns (address)",
            "function fee() external view returns (uint24)",
            "function slot0() external view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
            "function liquidity() external view returns (uint128)",
            "function tickSpacing() external view returns (int24)",
            "function initialize(uint160 sqrtPriceX96) external",
        ];
        
        const positionManagerABI = [
            "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external returns (address pool)",
            "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
        ];
        
        const usdc = new ethers.Contract(USDC_ADDRESS, erc20ABI, deployer);
        const weth = new ethers.Contract(WETH_ADDRESS, erc20ABI, deployer);
        const factory = new ethers.Contract(UNISWAP_V3_FACTORY, factoryABI, deployer);
        const positionManager = new ethers.Contract(POSITION_MANAGER, positionManagerABI, deployer);
        
        console.log("\n=== STEP 1: CHECKING DEPLOYER BALANCES ===");
        
        const deployerUSDCBalance = await usdc.balanceOf(deployer.address);
        const deployerWETHBalance = await weth.balanceOf(deployer.address);
        
        console.log("Deployer USDC balance:", ethers.formatUnits(deployerUSDCBalance, 6), "USDC");
        console.log("Deployer WETH balance:", ethers.formatUnits(deployerWETHBalance, 18), "WETH");
        
        // We need enough tokens to create a balanced pool
        const wethNeeded = ethers.parseEther("10"); // 10 WETH
        const usdcNeeded = ethers.parseUnits("1000", 6); // 1000 USDC
        
        if (deployerUSDCBalance < usdcNeeded || deployerWETHBalance < wethNeeded) {
            console.log("❌ Insufficient balance to create balanced pool");
            console.log("Need:", ethers.formatUnits(wethNeeded, 18), "WETH and", ethers.formatUnits(usdcNeeded, 6), "USDC");
            console.log("Have:", ethers.formatUnits(deployerWETHBalance, 18), "WETH and", ethers.formatUnits(deployerUSDCBalance, 6), "USDC");
            return;
        }
        
        console.log("\n=== STEP 2: CHECKING EXISTING POOL ===");
        
        // Check if pool already exists
        const existingPool = await factory.getPool(WETH_ADDRESS, USDC_ADDRESS, POOL_FEE);
        console.log("Existing pool address:", existingPool);
        
        if (existingPool !== ethers.ZeroAddress) {
            console.log("❌ Pool already exists - we'll use a different fee tier");
            // Try with different fee
            const newFee = 3000; // 0.3% fee
            const existingPool3000 = await factory.getPool(WETH_ADDRESS, USDC_ADDRESS, newFee);
            console.log("Pool with 0.3% fee:", existingPool3000);
            
            if (existingPool3000 !== ethers.ZeroAddress) {
                console.log("❌ Pool with 0.3% fee also exists");
                console.log("💡 We'll create a pool with 0.01% fee instead");
            }
        }
        
        console.log("\n=== STEP 3: CREATING NEW POOL ===");
        
        // Use a different fee tier to avoid conflicts
        const newPoolFee = 100; // 0.01% fee
        
        // Calculate sqrtPriceX96 for 1 WETH = 100 USDC
        // For WETH/USDC pool: token0 = WETH, token1 = USDC
        // price = USDC per WETH = 100
        // sqrtPriceX96 = sqrt(price) * 2^96
        
        // Convert 100 USDC per WETH to sqrtPriceX96
        // price = 100 * 10^6 / 10^18 = 100 * 10^-12
        // sqrtPriceX96 = sqrt(100 * 10^-12) * 2^96
        const price = 100n * (10n ** 6n); // 100 USDC (6 decimals)
        const priceX96 = (price * (2n ** 96n)) / (10n ** 18n); // Adjust for decimals
        const sqrtPriceX96 = BigInt(Math.floor(Math.sqrt(Number(priceX96))));
        
        console.log("Target price: 1 WETH = 100 USDC");
        console.log("Calculated sqrtPriceX96:", sqrtPriceX96.toString());
        
        try {
            console.log("Creating pool with 0.01% fee...");
            const createTx = await positionManager.createAndInitializePoolIfNecessary(
                WETH_ADDRESS,
                USDC_ADDRESS,
                newPoolFee,
                sqrtPriceX96
            );
            
            await createTx.wait();
            console.log("✅ Pool created successfully!");
            
            // Get the new pool address
            const newPoolAddress = await factory.getPool(WETH_ADDRESS, USDC_ADDRESS, newPoolFee);
            console.log("New pool address:", newPoolAddress);
            
            if (newPoolAddress === ethers.ZeroAddress) {
                console.log("❌ Failed to create pool");
                return;
            }
            
            // Initialize the pool contract
            const newPool = new ethers.Contract(newPoolAddress, poolABI, deployer);
            
            console.log("\n=== STEP 4: ADDING INITIAL LIQUIDITY ===");
            
            // Get pool info
            const token0 = await newPool.token0();
            const token1 = await newPool.token1();
            const fee = await newPool.fee();
            const tickSpacing = await newPool.tickSpacing();
            
            console.log("New pool token0:", token0);
            console.log("New pool token1:", token1);
            console.log("New pool fee:", fee.toString());
            console.log("New pool tick spacing:", tickSpacing.toString());
            
            // Calculate tick range
            const slot0 = await newPool.slot0();
            const currentTick = Number(slot0[1]);
            const spacing = Number(tickSpacing);
            
            const tickLower = Math.floor(currentTick / spacing - 100) * spacing;
            const tickUpper = Math.floor(currentTick / spacing + 100) * spacing;
            
            console.log("Current tick:", currentTick);
            console.log("Tick lower:", tickLower);
            console.log("Tick upper:", tickUpper);
            
            // Prepare liquidity amounts
            const amount0Desired = ethers.parseEther("10"); // 10 WETH
            const amount1Desired = ethers.parseUnits("1000", 6); // 1000 USDC
            
            console.log("Amount0 desired:", ethers.formatUnits(amount0Desired, 18), "WETH");
            console.log("Amount1 desired:", ethers.formatUnits(amount1Desired, 6), "USDC");
            
            // Check allowances
            const usdcAllowance = await usdc.allowance(deployer.address, POSITION_MANAGER);
            const wethAllowance = await weth.allowance(deployer.address, POSITION_MANAGER);
            
            if (usdcAllowance < amount1Desired) {
                console.log("Setting USDC allowance...");
                const approveTx = await usdc.approve(POSITION_MANAGER, ethers.parseUnits("10000000", 6));
                await approveTx.wait();
                console.log("✅ USDC allowance set");
            }
            
            if (wethAllowance < amount0Desired) {
                console.log("Setting WETH allowance...");
                const approveTx = await weth.approve(POSITION_MANAGER, ethers.parseEther("100"));
                await approveTx.wait();
                console.log("✅ WETH allowance set");
            }
            
            // Add initial liquidity
            const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
            
            const mintParams = {
                token0: token0,
                token1: token1,
                fee: newPoolFee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: 0,
                amount1Min: 0,
                recipient: deployer.address,
                deadline: deadline,
            };
            
            console.log("Adding initial liquidity...");
            const mintTx = await positionManager.mint(mintParams);
            console.log("Mint transaction sent:", mintTx.hash);
            
            const receipt = await mintTx.wait();
            console.log("Mint transaction confirmed:", receipt.hash);
            console.log("Gas used:", receipt.gasUsed.toString());
            console.log("Status:", receipt.status);
            
            if (receipt.status === 1) {
                console.log("🎉 NEW BALANCED POOL CREATED SUCCESSFULLY!");
                
                // Check final pool state
                const finalLiquidity = await newPool.liquidity();
                const finalSlot0 = await newPool.slot0();
                
                console.log("\n=== STEP 5: FINAL POOL STATE ===");
                console.log("Pool address:", newPoolAddress);
                console.log("Pool fee:", newPoolFee.toString(), "(0.01%)");
                console.log("Pool liquidity:", finalLiquidity.toString());
                console.log("Current tick:", finalSlot0[1].toString());
                
                // Check balances
                const finalPoolToken0Balance = await (new ethers.Contract(token0, erc20ABI, deployer)).balanceOf(newPoolAddress);
                const finalPoolToken1Balance = await (new ethers.Contract(token1, erc20ABI, deployer)).balanceOf(newPoolAddress);
                
                console.log(`Pool ${token0Symbol} balance:`, ethers.formatUnits(finalPoolToken0Balance, 18), "WETH");
                console.log(`Pool ${token1Symbol} balance:`, ethers.formatUnits(finalPoolToken1Balance, 6), "USDC");
                
                console.log("\n💡 SUCCESS! You now have a properly balanced pool!");
                console.log("Update your strategy to use this new pool address:", newPoolAddress);
                console.log("And update the pool fee to:", newPoolFee);
                
            } else {
                console.log("❌ Mint transaction failed");
            }
            
        } catch (error) {
            console.log("❌ Pool creation failed:", error.message);
            
            if (error.message.includes("execution reverted")) {
                console.log("This suggests an issue with the factory or position manager");
            }
        }
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        throw error;
    }
    
    console.log("\n🎉 NEW POOL CREATION COMPLETED!");
}

main().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
});
