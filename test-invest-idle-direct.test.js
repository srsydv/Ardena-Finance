const { ethers } = require("hardhat");
require("dotenv").config();

async function testInvestIdleDirect() {
  try {
    console.log("=== TESTING INVEST IDLE DIRECTLY ===");

    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(
      "https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik"
    );
    const wallet = new ethers.Wallet(process.env.PK, provider);

    console.log("Wallet address:", wallet.address);
    console.log(
      "Wallet balance:",
      ethers.formatEther(await provider.getBalance(wallet.address))
    );

    // Contract addresses
    const VAULT_ADDRESS = "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0";
    const ACCESS_CONTROLLER_ADDRESS =
      "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";
    const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
    const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
    const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
    const UNI_STRATEGY_ADDRESS = "0xA87bFB6973b92685C66D2BDc37A670Ee995a4C3B";
    const POOL_FEE = 500; // 0.05% fee tier

    // Contract ABIs
    const vaultABI = [
      "function investIdle(bytes[][] calldata allSwapData) external",
      "function access() external view returns (address)",
      "function strategiesLength() external view returns (uint256)",
      "function strategies(uint256) external view returns (address)",
      "function targetBps(address) external view returns (uint16)",
      "function totalAssets() external view returns (uint256)",
    ];

    const accessControllerABI = [
      "function managers(address account) external view returns (bool)",
      "function setManager(address account, bool status) external",
    ];

    const exchangerABI = [
      "function setRouter(address router, bool allowed) external",
    ];

    const usdcABI = [
      "function balanceOf(address account) external view returns (uint256)",
      "function decimals() external view returns (uint8)",
    ];

    // Initialize contracts
    const vault = new ethers.Contract(VAULT_ADDRESS, vaultABI, wallet);
    const accessController = new ethers.Contract(
      ACCESS_CONTROLLER_ADDRESS,
      accessControllerABI,
      wallet
    );
    const exchanger = new ethers.Contract(
      EXCHANGER_ADDRESS,
      exchangerABI,
      wallet
    );
    const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);

    console.log("\n=== CHECKING VAULT STATE ===");

    // Check what AccessController the vault is using
    const vaultAccessController = await vault.access();
    console.log("Vault is using AccessController at:", vaultAccessController);
    console.log("Expected AccessController:", ACCESS_CONTROLLER_ADDRESS);
    console.log(
      "Addresses match:",
      vaultAccessController.toLowerCase() ===
        ACCESS_CONTROLLER_ADDRESS.toLowerCase()
    );

    // Check manager role
    const isManager = await accessController.managers(wallet.address);
    console.log("Is manager:", isManager);

    if (!isManager) {
      console.log("Setting manager role...");
      const setManagerTx = await accessController.setManager(
        wallet.address,
        true
      );
      await setManagerTx.wait();
      console.log("Manager role set!");

      // Verify again
      const isManagerAfter = await accessController.managers(wallet.address);
      console.log("Is manager after setting:", isManagerAfter);
    }

    // Check vault idle amount
    const idleAmount = await usdc.balanceOf(VAULT_ADDRESS);
    console.log(
      "Idle amount in vault:",
      ethers.formatUnits(idleAmount, 6),
      "USDC"
    );

    if (idleAmount === 0n) {
      console.log("No idle funds to invest!");
      return;
    }

    // Get strategies
    const strategiesLength = await vault.strategiesLength();
    console.log("Number of strategies:", strategiesLength.toString());

    const strategies = [];
    for (let i = 0; i < strategiesLength; i++) {
      const strategyAddress = await vault.strategies(i);
      strategies.push(strategyAddress);
    }
    console.log("Strategies:", strategies);

    // Get UniswapV3 strategy allocation
    const uniStrategyIndex = strategies.findIndex(
      (addr) => addr.toLowerCase() === UNI_STRATEGY_ADDRESS.toLowerCase()
    );
    if (uniStrategyIndex === -1) {
      console.log("UniswapV3 strategy not found!");
      return;
    }

    const targetBps = await vault.targetBps(UNI_STRATEGY_ADDRESS);
    console.log("UniswapV3 strategy targetBps:", targetBps.toString());

    // Create swap data following uniswapV2Router.test.js pattern
    console.log("\n=== CREATING SWAP DATA ===");

    // Create UniswapV3 swap payload for UniswapV3Strategy
    // Following the exact pattern from uniswapV2Router.test.js lines 500-544

    // Amount vault will send to the uni strategy (targetBps=4000 → 40% of idle)
    const toSend = (idleAmount * BigInt(targetBps)) / 10000n;
    const amountIn = toSend / 2n; // swap half to WETH (following test pattern)

    console.log(
      "Amount going to UniswapV3 strategy:",
      ethers.formatUnits(toSend, 6),
      "USDC"
    );
    console.log(
      "Amount to swap (USDC -> WETH):",
      ethers.formatUnits(amountIn, 6),
      "USDC"
    );

    // Encode exactInputSingle(params) for SwapRouter02 (following test pattern)
    const artifact = require("@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json");
    const iface = new ethers.Interface(artifact.abi);
    const deadline =
      (await ethers.provider.getBlock("latest")).timestamp + 1200;

    const params = {
      tokenIn: USDC_ADDRESS,
      tokenOut: WETH_ADDRESS,
      fee: POOL_FEE,
      recipient: UNI_STRATEGY_ADDRESS, // deliver WETH to the strategy
      deadline,
      amountIn,
      amountOutMinimum: 0n, // for tests; in prod use a quoted minOut
      sqrtPriceLimitX96: 0n,
    };

    const routerCalldata = iface.encodeFunctionData("exactInputSingle", [
      params,
    ]);

    // Pack payload for ExchangeHandler.swap(bytes)
    // abi.encode(address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to, bytes routerCalldata)
    const payload = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "address",
        "address",
        "address",
        "uint256",
        "uint256",
        "address",
        "bytes",
      ],
      [
        UNISWAP_V3_ROUTER,
        USDC_ADDRESS,
        WETH_ADDRESS,
        amountIn,
        0,
        UNI_STRATEGY_ADDRESS,
        routerCalldata,
      ]
    );

    // Create allSwapData: empty array for AaveV3Strategy (index 0), payload for UniswapV3Strategy (index 1)
    const allSwapData = [[], [payload]];

    console.log("Created swap payload for UniswapV3Strategy");
    console.log("AllSwapData structure:", allSwapData);
    console.log("AllSwapData length:", allSwapData.length);
    console.log("AllSwapData[0] (AaveV3Strategy):", allSwapData[0]);
    console.log(
      "AllSwapData[1] (UniswapV3Strategy):",
      allSwapData[1].length,
      "bytes"
    );

    // Set router in exchanger
    console.log("\n=== SETTING ROUTER ===");
    try {
      const setRouterTx = await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
      await setRouterTx.wait();
      console.log("Router set successfully!");
    } catch (error) {
      console.log("Router might already be set:", error.message);
    }

    // Call investIdle
    console.log("\n=== CALLING INVEST IDLE ===");
    console.log("Calling investIdle with data:", allSwapData);
    console.log("Transaction will be sent from:", wallet.address);

    try {
      // Try gas estimation first
      console.log("Estimating gas...");
      const gasEstimate = await vault.investIdle.estimateGas(allSwapData);
      console.log("✅ Gas estimate:", gasEstimate.toString());

      // If gas estimation works, try the actual transaction
      console.log("Sending transaction...");
      const tx = await vault.investIdle(allSwapData, {
        gasLimit: gasEstimate * 2n, // Use 2x gas limit for safety
      });
      console.log("Transaction sent:", tx.hash);

      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt.hash);
      console.log("Gas used:", receipt.gasUsed.toString());
      console.log("Transaction status:", receipt.status);

      if (receipt.status === 1) {
        console.log("\n=== SUCCESS! ===");
        console.log("InvestIdle completed successfully!");
      } else {
        console.log("\n=== FAILED ===");
        console.log("Transaction reverted during execution");
      }
    } catch (error) {
      console.error("InvestIdle failed:", error.message);

      if (error.message.includes("execution reverted")) {
        console.log(
          "This is a smart contract revert. The issue is in the contract logic."
        );
      }

      if (error.message.includes("missing revert data")) {
        console.log(
          "The transaction is reverting but the error message isn't being decoded properly."
        );
        console.log(
          "This suggests the revert is happening in an external contract or with custom errors."
        );
      }
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testInvestIdleDirect();
