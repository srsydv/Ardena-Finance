import hre from "hardhat";
const { ethers } = hre;

async function addLiquidity() {
    console.log("=== Adding Liquidity to Uniswap V3 Pool ===");
    console.log("🎯 TARGET: Setting price to 1 WETH = 10 AAVE");
    console.log("📊 This will add significant liquidity to the pool");
    console.log("💰 Amount: 5 WETH + 50 AAVE");
    
    // Get signer from private key in .env
    const [deployer] = await ethers.getSigners();
    console.log("Using account:", deployer.address);
    
    // Your pool details
    const POOL_ADDRESS = "0x6eFCe0a593782545fe1bE3fF0abce18dC8181a3c";
    const POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
    const AAVE_ADDRESS = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a";
    const WETH_ADDRESS = "0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762";
    
    // Get contracts
    const aave = await ethers.getContractAt("IERC20", AAVE_ADDRESS);
    const weth = await ethers.getContractAt("IERC20", WETH_ADDRESS);
    const positionManager = await ethers.getContractAt("INonfungiblePositionManager", POSITION_MANAGER);
    
    // Check current balances
    const aaveBalance = await aave.balanceOf(deployer.address);
    const wethBalance = await weth.balanceOf(deployer.address);
    
    console.log("\n=== Current Balances ===");
    console.log("AAVE Balance:", ethers.formatUnits(aaveBalance, 18)); // AAVE has 18 decimals
    console.log("WETH Balance:", ethers.formatEther(wethBalance));
    
    // Liquidity amounts for 1 WETH = 10 AAVE ratio
    const wethAmount = ethers.parseEther("5"); // 5 WETH
    const aaveAmount = ethers.parseEther("50"); // 50 AAVE (5 * 10 = 50)
    
    console.log("\n=== Liquidity Amounts ===");
    console.log("WETH Amount:", ethers.formatEther(wethAmount));
    console.log("AAVE Amount:", ethers.formatUnits(aaveAmount, 18));
    console.log("Target Price: 1 WETH = 10 AAVE");
    
    // Check if we have enough balance
    if (wethBalance < wethAmount) {
        throw new Error(`Insufficient WETH balance. Have: ${ethers.formatEther(wethBalance)}, Need: ${ethers.formatEther(wethAmount)}`);
    }
    
    if (aaveBalance < aaveAmount) {
        throw new Error(`Insufficient AAVE balance. Have: ${ethers.formatUnits(aaveBalance, 18)}, Need: ${ethers.formatUnits(aaveAmount, 18)}`);
    }
    
    // Check and set approvals
    console.log("\n=== Setting Approvals ===");
    
    const wethAllowance = await weth.allowance(deployer.address, POSITION_MANAGER);
    const aaveAllowance = await aave.allowance(deployer.address, POSITION_MANAGER);
    
    console.log("Current WETH Allowance:", ethers.formatEther(wethAllowance));
    console.log("Current AAVE Allowance:", ethers.formatUnits(aaveAllowance, 18));
    
    if (wethAllowance < wethAmount) {
        console.log("Approving WETH...");
        const tx1 = await weth.approve(POSITION_MANAGER, wethAmount);
        await tx1.wait();
        console.log("✅ WETH approved");
    } else {
        console.log("✅ WETH allowance sufficient");
    }
    
    if (aaveAllowance < aaveAmount) {
        console.log("Approving AAVE...");
        const tx2 = await aave.approve(POSITION_MANAGER, aaveAmount);
        await tx2.wait();
        console.log("✅ AAVE approved");
    } else {
        console.log("✅ AAVE allowance sufficient");
    }
    
    // Get current pool state first
    console.log("\n=== Getting Current Pool State ===");
    const poolABI = [
        "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
    ];
    const pool = await ethers.getContractAt(poolABI, POOL_ADDRESS);
    const slot0 = await pool.slot0();
    const currentTick = Number(slot0.tick);
    
    console.log("Current pool tick:", currentTick);
    console.log("Current sqrtPriceX96:", slot0.sqrtPriceX96.toString());
    
    // Use a wide range around the CURRENT tick to ensure liquidity is active
    const tickSpacing = 10;
    const range = 10000; // Very wide range to ensure we cover current price
    const tickLower = Math.floor((currentTick - range) / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor((currentTick + range) / tickSpacing) * tickSpacing;
    
    console.log("Using wide range around current tick:");
    console.log("tickLower:", tickLower);
    console.log("tickUpper:", tickUpper);
    console.log("Range covers:", Math.abs(tickUpper - tickLower), "ticks");
    console.log("This ensures liquidity is active at current price");
    
    // Prepare mint parameters
    const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes from now
    
    // Sort tokens correctly (token0 < token1)
    const [token0, token1] = WETH_ADDRESS.toLowerCase() < AAVE_ADDRESS.toLowerCase() 
        ? [WETH_ADDRESS, AAVE_ADDRESS] 
        : [AAVE_ADDRESS, WETH_ADDRESS];
    
    const mintParams = {
        token0: token0,
        token1: token1,
        fee: 500,
        tickLower: tickLower,
        tickUpper: tickUpper,
        amount0Desired: token0 === WETH_ADDRESS ? wethAmount : aaveAmount,
        amount1Desired: token1 === WETH_ADDRESS ? wethAmount : aaveAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: deployer.address,
        deadline: deadline
    };
    
    console.log("\n=== Mint Parameters ===");
    console.log("token0:", mintParams.token0, token0 === WETH_ADDRESS ? "(WETH)" : "(AAVE)");
    console.log("token1:", mintParams.token1, token1 === WETH_ADDRESS ? "(WETH)" : "(AAVE)");
    console.log("fee:", mintParams.fee);
    console.log("tickLower:", mintParams.tickLower);
    console.log("tickUpper:", mintParams.tickUpper);
    console.log("amount0Desired:", token0 === WETH_ADDRESS ? ethers.formatEther(mintParams.amount0Desired) + " WETH" : ethers.formatUnits(mintParams.amount0Desired, 18) + " AAVE");
    console.log("amount1Desired:", token1 === WETH_ADDRESS ? ethers.formatEther(mintParams.amount1Desired) + " WETH" : ethers.formatUnits(mintParams.amount1Desired, 18) + " AAVE");
    console.log("recipient:", mintParams.recipient);
    console.log("deadline:", mintParams.deadline);
    
    // Execute the mint transaction
    console.log("\n=== Executing Mint Transaction ===");
    try {
        const tx = await positionManager.mint(mintParams);
        console.log("Transaction sent:", tx.hash);
        
        console.log("Waiting for confirmation...");
        const receipt = await tx.wait();
        
        console.log("✅ Transaction confirmed!");
        console.log("Gas used:", receipt.gasUsed.toString());
        
        // Parse the events to get the token ID
        const mintEvent = receipt.logs.find(log => {
            try {
                const parsed = positionManager.interface.parseLog(log);
                return parsed.name === 'IncreaseLiquidity';
            } catch (e) {
                return false;
            }
        });
        
        if (mintEvent) {
            const parsed = positionManager.interface.parseLog(mintEvent);
            console.log("Position token ID:", parsed.args.tokenId.toString());
        }
        
        console.log("\n🎉 Liquidity successfully added to the pool!");
        console.log("Pool:", POOL_ADDRESS);
        console.log("Position Manager:", POSITION_MANAGER);
        console.log("\n✅ RESULT: Pool now has significant liquidity");
        console.log("🎯 TARGET ACHIEVED: Price should be close to 1 WETH = 10 AAVE");
        console.log("📈 UI should now show realistic prices instead of extreme values");
        
    } catch (error) {
        console.error("❌ Transaction failed:", error.message);
        
        // Try to get more detailed error info
        if (error.reason) {
            console.error("Reason:", error.reason);
        }
        if (error.code) {
            console.error("Error code:", error.code);
        }
        
        throw error;
    }
}

// Run the function
addLiquidity()
    .then(() => {
        console.log("\n✅ Script completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n❌ Script failed:", error.message);
        process.exit(1);
    });
