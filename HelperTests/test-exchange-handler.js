import hre from "hardhat";
const { ethers } = hre;

// Contract addresses from Sepolia
const CONTRACTS = {
    asset: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a", // AAVE TOKEN
    weth: "0x4530fABea7444674a775aBb920924632c669466e", // NEW WETH
    swapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E", // SwapRouter02
    exchanger: "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF" // ExchangeHandler
};

async function main() {
    console.log("=== TESTING EXCHANGEHANDLER ===");
    
    // Impersonate the share holder
    const SHARE_HOLDER = "0xf69F75EB0c72171AfF58D79973819B6A3038f39f";
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [SHARE_HOLDER],
    });
    
    await hre.network.provider.send("hardhat_setBalance", [
        SHARE_HOLDER,
        "0x1000000000000000000", // 1 ETH
    ]);
    
    const signer = await ethers.getSigner(SHARE_HOLDER);
    
    // Get contracts
    const weth = await ethers.getContractAt("ERC20", CONTRACTS.weth);
    const aave = await ethers.getContractAt("ERC20", CONTRACTS.asset);
    const exchanger = await ethers.getContractAt("ExchangeHandler", CONTRACTS.exchanger);
    const swapRouter = await ethers.getContractAt("ISwapRouter02", CONTRACTS.swapRouter);
    
    const amountIn = ethers.parseEther("0.1"); // 0.1 WETH
    
    console.log("Testing ExchangeHandler with amount:", ethers.formatEther(amountIn), "WETH");
    
    // Check balances before
    const wethBalanceBefore = await weth.balanceOf(signer.address);
    const aaveBalanceBefore = await aave.balanceOf(signer.address);
    
    console.log("Before swap:");
    console.log("  WETH balance:", ethers.formatEther(wethBalanceBefore));
    console.log("  AAVE balance:", ethers.formatUnits(aaveBalanceBefore, 18));
    
    // Approve ExchangeHandler to spend WETH
    console.log("\n=== APPROVING EXCHANGEHANDLER ===");
    try {
        const approveTx = await weth.connect(signer).approve(CONTRACTS.exchanger, amountIn);
        await approveTx.wait();
        console.log("✅ Approved ExchangeHandler to spend WETH");
        
        // Check allowance
        const allowance = await weth.allowance(signer.address, CONTRACTS.exchanger);
        console.log("Allowance:", ethers.formatEther(allowance));
        
    } catch (error) {
        console.log("❌ Approval failed:", error.message);
        return;
    }
    
    // Create the exact same router calldata that UniswapV3Strategy creates
    console.log("\n=== CREATING ROUTER CALLDATA ===");
    
    // Create ExactInputSingleParams
    const params = {
        tokenIn: CONTRACTS.weth,
        tokenOut: CONTRACTS.asset,
        fee: 500, // 0.05% fee
        recipient: signer.address,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    };
    
    console.log("SwapRouter02 params:", params);
    
    // Create the router calldata for exactInputSingle
    const routerCalldata = ethers.solidityPacked(
        ["bytes4", "bytes"],
        ["0x04e45aaf", ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,address,uint24,address,uint256,uint256,uint160)"],
            [[params.tokenIn, params.tokenOut, params.fee, params.recipient, params.amountIn, params.amountOutMinimum, params.sqrtPriceLimitX96]]
        )]
    );
    
    console.log("Router calldata length:", routerCalldata.length);
    console.log("Router calldata:", routerCalldata);
    
    // Pack for ExchangeHandler.swap(bytes)
    const swapCalldata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "bytes"],
        [
            CONTRACTS.swapRouter, // router
            CONTRACTS.weth, // tokenIn
            CONTRACTS.asset, // tokenOut
            amountIn, // amountIn
            0, // minOut
            signer.address, // recipient
            routerCalldata
        ]
    );
    
    console.log("ExchangeHandler swap calldata length:", swapCalldata.length);
    
    // Test the ExchangeHandler call
    console.log("\n=== TESTING EXCHANGEHANDLER CALL ===");
    try {
        // Simulate first
        const result = await exchanger.connect(signer).swap.staticCall(swapCalldata);
        console.log("✅ ExchangeHandler simulation successful!");
        console.log("Expected AAVE output:", ethers.formatUnits(result, 18));
        
        // Execute the actual swap
        const swapTx = await exchanger.connect(signer).swap(swapCalldata);
        const receipt = await swapTx.wait();
        console.log("✅ ExchangeHandler swap executed successfully!");
        console.log("Gas used:", receipt.gasUsed.toString());
        
        // Check balances after
        const wethBalanceAfter = await weth.balanceOf(signer.address);
        const aaveBalanceAfter = await aave.balanceOf(signer.address);
        
        console.log("\nAfter swap:");
        console.log("  WETH balance:", ethers.formatEther(wethBalanceAfter));
        console.log("  AAVE balance:", ethers.formatUnits(aaveBalanceAfter, 18));
        
        const wethUsed = wethBalanceBefore - wethBalanceAfter;
        const aaveReceived = aaveBalanceAfter - aaveBalanceBefore;
        
        console.log("\nSwap results:");
        console.log("  WETH used:", ethers.formatEther(wethUsed));
        console.log("  AAVE received:", ethers.formatUnits(aaveReceived, 18));
        
    } catch (error) {
        console.log("❌ ExchangeHandler call failed:", error.message);
        
        // Let's also check if ExchangeHandler has WETH balance
        const exchangerWethBalance = await weth.balanceOf(CONTRACTS.exchanger);
        console.log("ExchangeHandler WETH balance:", ethers.formatEther(exchangerWethBalance));
    }
}

main().catch(console.error);
