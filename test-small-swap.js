import hre from "hardhat";
const { ethers } = hre;

async function main() {
    console.log("=== TESTING SMALL SWAP ===");
    
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
    const weth = await ethers.getContractAt("ERC20", "0x4530fABea7444674a775aBb920924632c669466e");
    const aave = await ethers.getContractAt("ERC20", "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a");
    const exchanger = await ethers.getContractAt("ExchangeHandler", "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF");
    
    // Test with the small amount from tokensOwed
    const smallAmount = 160758674303908n; // tokensOwed0 from position
    console.log("Testing swap with small amount:", ethers.formatEther(smallAmount), "WETH");
    
    // Check if signer has enough WETH
    const wethBalance = await weth.balanceOf(signer.address);
    console.log("Signer WETH balance:", ethers.formatEther(wethBalance));
    
    if (wethBalance < smallAmount) {
        console.log("❌ Signer doesn't have enough WETH for the test");
        return;
    }
    
    // Approve ExchangeHandler
    const approveTx = await weth.connect(signer).approve("0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF", smallAmount);
    await approveTx.wait();
    console.log("✅ Approved ExchangeHandler");
    
    // Create swap calldata
    const params = {
        tokenIn: "0x4530fABea7444674a775aBb920924632c669466e",
        tokenOut: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a",
        fee: 500,
        recipient: signer.address,
        amountIn: smallAmount,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    };
    
    // Create the router calldata for exactInputSingle
    const routerCalldata = ethers.solidityPacked(
        ["bytes4", "bytes"],
        ["0x04e45aaf", ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,address,uint24,address,uint256,uint256,uint160)"],
            [[params.tokenIn, params.tokenOut, params.fee, params.recipient, params.amountIn, params.amountOutMinimum, params.sqrtPriceLimitX96]]
        )]
    );
    
    // Pack for ExchangeHandler.swap(bytes)
    const swapCalldata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "bytes"],
        [
            "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E", // router
            params.tokenIn, // tokenIn
            params.tokenOut, // tokenOut
            smallAmount, // amountIn
            0, // minOut
            signer.address, // recipient
            routerCalldata
        ]
    );
    
    try {
        // Test the swap
        const result = await exchanger.connect(signer).swap.staticCall(swapCalldata);
        console.log("✅ Small swap simulation successful!");
        console.log("Expected AAVE output:", ethers.formatUnits(result, 18));
        
        // Execute the actual swap
        const swapTx = await exchanger.connect(signer).swap(swapCalldata);
        await swapTx.wait();
        console.log("✅ Small swap executed successfully!");
        
    } catch (error) {
        console.log("❌ Small swap failed:", error.message);
        
        if (error.message.includes("STF")) {
            console.log("This suggests the amount is too small or there's an issue with the swap");
        }
    }
}

main().catch(console.error);
