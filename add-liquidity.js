import hre from "hardhat";
const { ethers } = hre;

async function addLiquidity() {
    console.log("=== Adding Liquidity to Uniswap V3 Pool ===");
    
    // Get signer from private key in .env
    const [deployer] = await ethers.getSigners();
    console.log("Using account:", deployer.address);
    
    // Your pool details
    const POOL_ADDRESS = "0x6eFCe0a593782545fe1bE3fF0abce18dC8181a3c";
    const POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
    const AAVE_ADDRESS = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a";
    const WETH_ADDRESS = "0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762";
    
    // Get contracts
    const usdc = await ethers.getContractAt("IERC20", AAVE_ADDRESS);
    const weth = await ethers.getContractAt("IERC20", WETH_ADDRESS);
    const positionManager = await ethers.getContractAt("INonfungiblePositionManager", POSITION_MANAGER);
    
    // Check current balances
    const usdcBalance = await usdc.balanceOf(deployer.address);
    const wethBalance = await weth.balanceOf(deployer.address);
    
    console.log("\n=== Current Balances ===");
    console.log("AAVE Balance:", ethers.formatUnits(usdcBalance, 6));
    console.log("WETH Balance:", ethers.formatEther(wethBalance));
    
    // Liquidity amounts
    const wethAmount = ethers.parseEther("10"); // 10 WETH
    const aaveAmount = ethers.parseUnits("100", 6); // 100 AAVE
    
    console.log("\n=== Liquidity Amounts ===");
    console.log("WETH Amount:", ethers.formatEther(wethAmount));
    console.log("AAVE Amount:", ethers.formatUnits(aaveAmount));
    
    // Check if we have enough balance
    if (wethBalance < wethAmount) {
        throw new Error(`Insufficient WETH balance. Have: ${ethers.formatEther(wethBalance)}, Need: ${ethers.formatEther(wethAmount)}`);
    }
    
    if (usdcBalance < aaveAmount) {
        throw new Error(`Insufficient AAVE balance. Have: ${ethers.formatUnits(usdcBalance, 6)}, Need: ${ethers.formatUnits(aaveAmount, 6)}`);
    }
    
    // Check and set approvals
    console.log("\n=== Setting Approvals ===");
    
    const wethAllowance = await weth.allowance(deployer.address, POSITION_MANAGER);
    const usdcAllowance = await usdc.allowance(deployer.address, POSITION_MANAGER);
    
    console.log("Current WETH Allowance:", ethers.formatEther(wethAllowance));
    console.log("Current AAVE Allowance:", ethers.formatUnits(usdcAllowance));
    
    if (wethAllowance < wethAmount) {
        console.log("Approving WETH...");
        const tx1 = await weth.approve(POSITION_MANAGER, wethAmount);
        await tx1.wait();
        console.log("✅ WETH approved");
    } else {
        console.log("✅ WETH allowance sufficient");
    }
    
    if (usdcAllowance < aaveAmount) {
        console.log("Approving AAVE...");
        const tx2 = await usdc.approve(POSITION_MANAGER, aaveAmount);
        await tx2.wait();
        console.log("✅ AAVE approved");
    } else {
        console.log("✅ AAVE allowance sufficient");
    }
    
    // Get current pool state to determine proper tick range
    console.log("\n=== Getting Pool State ===");
    const poolABI = [
        "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
    ];
    const pool = await ethers.getContractAt(poolABI, POOL_ADDRESS);
    const slot0 = await pool.slot0();
    const currentTick = slot0.tick;
    
    console.log("Current tick:", currentTick.toString());
    
    // Create a narrow range around current tick (±50 ticks)
    const tickSpacing = 10;
    const range = 200;
    const currentTickNum = Number(currentTick);
    const tickLower = Math.floor((currentTickNum - range) / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor((currentTickNum + range) / tickSpacing) * tickSpacing;
    
    console.log("Calculated tick range:");
    console.log("tickLower:", tickLower);
    console.log("tickUpper:", tickUpper);
    
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
    console.log("amount0Desired:", token0 === WETH_ADDRESS ? ethers.formatEther(mintParams.amount0Desired) + " WETH" : ethers.formatUnits(mintParams.amount0Desired, 6) + " AAVE");
    console.log("amount1Desired:", token1 === WETH_ADDRESS ? ethers.formatEther(mintParams.amount1Desired) + " WETH" : ethers.formatUnits(mintParams.amount1Desired, 6) + " AAVE");
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
