const { ethers } = require("hardhat");

async function addLiquidity() {
    console.log("=== Adding Liquidity to Uniswap V3 Pool ===");
    
    // Get signer from private key in .env
    const [deployer] = await ethers.getSigners();
    console.log("Using account:", deployer.address);
    
    // Your pool details
    const POOL_ADDRESS = "0xE85292C7BeDF830071cC1C8F7b5aaB5A5391B50A";
    const POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
    
    // Get contracts
    const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
    const weth = await ethers.getContractAt("IERC20", WETH_ADDRESS);
    const positionManager = await ethers.getContractAt("INonfungiblePositionManager", POSITION_MANAGER);
    
    // Check current balances
    const usdcBalance = await usdc.balanceOf(deployer.address);
    const wethBalance = await weth.balanceOf(deployer.address);
    
    console.log("\n=== Current Balances ===");
    console.log("USDC Balance:", ethers.formatUnits(usdcBalance, 6));
    console.log("WETH Balance:", ethers.formatEther(wethBalance));
    
    // Liquidity amounts
    const wethAmount = ethers.parseEther("20"); // 20 WETH
    const usdcAmount = ethers.parseUnits("2000", 6); // 2000 USDC
    
    console.log("\n=== Liquidity Amounts ===");
    console.log("WETH Amount:", ethers.formatEther(wethAmount));
    console.log("USDC Amount:", ethers.formatUnits(usdcAmount, 6));
    
    // Check if we have enough balance
    if (wethBalance < wethAmount) {
        throw new Error(`Insufficient WETH balance. Have: ${ethers.formatEther(wethBalance)}, Need: ${ethers.formatEther(wethAmount)}`);
    }
    
    if (usdcBalance < usdcAmount) {
        throw new Error(`Insufficient USDC balance. Have: ${ethers.formatUnits(usdcBalance, 6)}, Need: ${ethers.formatUnits(usdcAmount, 6)}`);
    }
    
    // Check and set approvals
    console.log("\n=== Setting Approvals ===");
    
    const wethAllowance = await weth.allowance(deployer.address, POSITION_MANAGER);
    const usdcAllowance = await usdc.allowance(deployer.address, POSITION_MANAGER);
    
    console.log("Current WETH Allowance:", ethers.formatEther(wethAllowance));
    console.log("Current USDC Allowance:", ethers.formatUnits(usdcAllowance, 6));
    
    if (wethAllowance < wethAmount) {
        console.log("Approving WETH...");
        const tx1 = await weth.approve(POSITION_MANAGER, wethAmount);
        await tx1.wait();
        console.log("✅ WETH approved");
    } else {
        console.log("✅ WETH allowance sufficient");
    }
    
    if (usdcAllowance < usdcAmount) {
        console.log("Approving USDC...");
        const tx2 = await usdc.approve(POSITION_MANAGER, usdcAmount);
        await tx2.wait();
        console.log("✅ USDC approved");
    } else {
        console.log("✅ USDC allowance sufficient");
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
    const range = 50;
    const currentTickNum = Number(currentTick);
    const tickLower = Math.floor((currentTickNum - range) / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor((currentTickNum + range) / tickSpacing) * tickSpacing;
    
    console.log("Calculated tick range:");
    console.log("tickLower:", tickLower);
    console.log("tickUpper:", tickUpper);
    
    // Prepare mint parameters
    const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes from now
    
    const mintParams = {
        token0: WETH_ADDRESS,  // WETH is token0
        token1: USDC_ADDRESS,  // USDC is token1
        fee: 500,
        tickLower: tickLower,
        tickUpper: tickUpper,
        amount0Desired: wethAmount,  // WETH amount
        amount1Desired: usdcAmount,  // USDC amount
        amount0Min: 0,
        amount1Min: 0,
        recipient: deployer.address,
        deadline: deadline
    };
    
    console.log("\n=== Mint Parameters ===");
    console.log("token0 (WETH):", mintParams.token0);
    console.log("token1 (USDC):", mintParams.token1);
    console.log("fee:", mintParams.fee);
    console.log("tickLower:", mintParams.tickLower);
    console.log("tickUpper:", mintParams.tickUpper);
    console.log("amount0Desired (WETH):", ethers.formatEther(mintParams.amount0Desired));
    console.log("amount1Desired (USDC):", ethers.formatUnits(mintParams.amount1Desired, 6));
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
