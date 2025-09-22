/*
  Fix the pool imbalance by adding the missing USDC to rebalance the pool.
  
  This will restore the pool to a proper 1 WETH = 100 USDC ratio.
*/

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("=== FIXING POOL IMBALANCE ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Contract addresses
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
    const POOL_ADDRESS = "0xE85292C7BeDF830071cC1C8F7b5aaB5A5391B50A";
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
        
        const poolABI = [
            "function token0() external view returns (address)",
            "function token1() external view returns (address)",
            "function fee() external view returns (uint24)",
            "function slot0() external view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
            "function liquidity() external view returns (uint128)",
            "function tickSpacing() external view returns (int24)",
        ];
        
        const positionManagerABI = [
            "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
        ];
        
        const usdc = new ethers.Contract(USDC_ADDRESS, erc20ABI, deployer);
        const weth = new ethers.Contract(WETH_ADDRESS, erc20ABI, deployer);
        const pool = new ethers.Contract(POOL_ADDRESS, poolABI, deployer);
        const positionManager = new ethers.Contract(POSITION_MANAGER, positionManagerABI, deployer);
        
        console.log("\n=== STEP 1: CHECKING CURRENT STATE ===");
        
        const token0 = await pool.token0();
        const token1 = await pool.token1();
        const fee = await pool.fee();
        const slot0 = await pool.slot0();
        const liquidity = await pool.liquidity();
        const tickSpacing = await pool.tickSpacing();
        
        console.log("Pool address:", POOL_ADDRESS);
        console.log("Token0:", token0);
        console.log("Token1:", token1);
        console.log("Fee:", fee.toString());
        console.log("Current tick:", slot0[1].toString());
        console.log("Pool liquidity:", liquidity.toString());
        console.log("Tick spacing:", tickSpacing.toString());
        
        // Get token symbols
        const token0Symbol = await (new ethers.Contract(token0, erc20ABI, deployer)).symbol();
        const token1Symbol = await (new ethers.Contract(token1, erc20ABI, deployer)).symbol();
        
        console.log("Token0 symbol:", token0Symbol);
        console.log("Token1 symbol:", token1Symbol);
        
        console.log("\n=== STEP 2: CHECKING DEPLOYER BALANCES ===");
        
        const deployerUSDCBalance = await usdc.balanceOf(deployer.address);
        const deployerWETHBalance = await weth.balanceOf(deployer.address);
        
        console.log("Deployer USDC balance:", ethers.formatUnits(deployerUSDCBalance, 6), "USDC");
        console.log("Deployer WETH balance:", ethers.formatUnits(deployerWETHBalance, 18), "WETH");
        
        // We need to add significant USDC to rebalance
        const usdcNeeded = ethers.parseUnits("5000", 6); // 5000 USDC to rebalance
        
        if (deployerUSDCBalance < usdcNeeded) {
            console.log("❌ Insufficient USDC balance to rebalance pool");
            console.log("Need:", ethers.formatUnits(usdcNeeded, 6), "USDC");
            console.log("Have:", ethers.formatUnits(deployerUSDCBalance, 6), "USDC");
            return;
        }
        
        console.log("\n=== STEP 3: CALCULATING TICK RANGE ===");
        
        const currentTick = Number(slot0[1]);
        const spacing = Number(tickSpacing);
        
        // Calculate tick range around current price
        const tickLower = Math.floor(currentTick / spacing - 100) * spacing;
        const tickUpper = Math.floor(currentTick / spacing + 100) * spacing;
        
        console.log("Current tick:", currentTick);
        console.log("Tick spacing:", spacing);
        console.log("Calculated tick lower:", tickLower);
        console.log("Calculated tick upper:", tickUpper);
        
        console.log("\n=== STEP 4: PREPARING REBALANCE AMOUNTS ===");
        
        // Add significant USDC to rebalance the pool
        const amount0Desired = ethers.parseEther("0"); // No WETH needed
        const amount1Desired = ethers.parseUnits("5000", 6); // 5000 USDC
        
        console.log("Amount0 desired:", ethers.formatUnits(amount0Desired, 18), "WETH");
        console.log("Amount1 desired:", ethers.formatUnits(amount1Desired, 6), "USDC");
        
        console.log("\n=== STEP 5: CHECKING ALLOWANCES ===");
        
        const usdcAllowance = await usdc.allowance(deployer.address, POSITION_MANAGER);
        const wethAllowance = await weth.allowance(deployer.address, POSITION_MANAGER);
        
        console.log("USDC allowance:", ethers.formatUnits(usdcAllowance, 6), "USDC");
        console.log("WETH allowance:", ethers.formatUnits(wethAllowance, 18), "WETH");
        
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
        
        console.log("\n=== STEP 6: ADDING REBALANCE LIQUIDITY ===");
        
        try {
            const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
            
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
                deadline: deadline,
            };
            
            console.log("Mint parameters:", mintParams);
            
            // Try static call first
            console.log("Testing with static call...");
            const mintResult = await positionManager.mint.staticCall(mintParams);
            console.log("✅ Static call successful!");
            console.log("Token ID:", mintResult[0].toString());
            console.log("Liquidity:", mintResult[1].toString());
            console.log("Amount0:", ethers.formatUnits(mintResult[2], 18), "WETH");
            console.log("Amount1:", ethers.formatUnits(mintResult[3], 6), "USDC");
            
            // If static call succeeds, try the actual transaction
            console.log("Executing actual mint...");
            const mintTx = await positionManager.mint(mintParams);
            console.log("Mint transaction sent:", mintTx.hash);
            
            const receipt = await mintTx.wait();
            console.log("Mint transaction confirmed:", receipt.hash);
            console.log("Gas used:", receipt.gasUsed.toString());
            console.log("Status:", receipt.status);
            
            if (receipt.status === 1) {
                console.log("🎉 REBALANCE LIQUIDITY ADDED SUCCESSFULLY!");
                
                // Check new pool state
                const newLiquidity = await pool.liquidity();
                const newSlot0 = await pool.slot0();
                
                console.log("\n=== STEP 7: CHECKING NEW POOL STATE ===");
                console.log("New pool liquidity:", newLiquidity.toString());
                console.log("New current tick:", newSlot0[1].toString());
                
                // Check new balances
                const newPoolToken0Balance = await (new ethers.Contract(token0, erc20ABI, deployer)).balanceOf(POOL_ADDRESS);
                const newPoolToken1Balance = await (new ethers.Contract(token1, erc20ABI, deployer)).balanceOf(POOL_ADDRESS);
                
                console.log(`New Pool ${token0Symbol} balance:`, ethers.formatUnits(newPoolToken0Balance, 18), token0Symbol);
                console.log(`New Pool ${token1Symbol} balance:`, ethers.formatUnits(newPoolToken1Balance, 6), token1Symbol);
                
                console.log("\n💡 Now try the swap test again to see if it works!");
                console.log("The pool should now be properly balanced for swaps");
                
            } else {
                console.log("❌ Mint transaction failed");
            }
            
        } catch (error) {
            console.log("❌ Mint failed:", error.message);
            
            if (error.message.includes("execution reverted")) {
                console.log("This suggests an issue with the position manager or pool");
                
                // Try to decode the revert reason
                try {
                    if (error.data && error.data.startsWith("0x08c379a0")) {
                        const reason = ethers.AbiCoder.defaultAbiCoder().decode(
                            ["string"],
                            "0x" + error.data.slice(10)
                        )[0];
                        console.log("Revert reason:", reason);
                    }
                } catch (decodeError) {
                    console.log("Could not decode revert reason");
                }
            }
        }
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        throw error;
    }
    
    console.log("\n🎉 POOL REBALANCE ATTEMPT COMPLETED!");
}

main().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
});
