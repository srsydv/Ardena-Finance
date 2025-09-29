import hre from "hardhat";
const { ethers } = hre;
import dotenv from "dotenv";
dotenv.config();

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

    // Contract addresses - NEW AAVE VAULT SYSTEM
    const VAULT_ADDRESS = "0x3cd0145707C03316B48f8A254c494600c30ebf8d"; // NEW AAVE VAULT
    const ACCESS_CONTROLLER_ADDRESS =
      "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";
    const AAVE_ADDRESS = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a"; // AAVE TOKEN
    const WETH_ADDRESS = "0x4530fABea7444674a775aBb920924632c669466e"; // NEW WETH
    const UNISWAP_V3_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E"; // NEW WORKING ROUTER
    const EXCHANGER_ADDRESS = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF";
    const UNI_STRATEGY_ADDRESS = "0x65cDA0b70d3D09139c0a78059082F885714a0Fe7"; // NEW AAVE UNISWAPV3STRATEGY
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

    const aaveABI = [
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
    const aave = new ethers.Contract(AAVE_ADDRESS, aaveABI, wallet);

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
    const idleAmount = await aave.balanceOf(VAULT_ADDRESS);
    console.log(
      "Idle amount in vault:",
      ethers.formatUnits(idleAmount, 18),
      "AAVE"
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

    // Use the new strategy directly (now at index 0 since it's the only strategy)
    const activeStrategyIndex = 0; // New strategy is at index 0 (only strategy)
    const activeStrategyAddress = UNI_STRATEGY_ADDRESS; // Use our new strategy
    const targetBps = 4000; // 40% allocation

    console.log(
      `Using NEW AAVE strategy at index ${activeStrategyIndex}: ${activeStrategyAddress}`
    );

    console.log("Active strategy found:");
    console.log("- Index:", activeStrategyIndex);
    console.log("- Address:", activeStrategyAddress);
    console.log("- Allocation:", targetBps.toString(), "bps");

    // Create swap data following uniswapV2Router.test.js pattern
    console.log("\n=== CREATING SWAP DATA ===");

    // Create UniswapV3 swap payload for UniswapV3Strategy
    // Following the exact pattern from uniswapV2Router.test.js lines 500-544

    // Amount vault will send to the uni strategy (targetBps=4000 → 40% of idle)
    const toSend = (idleAmount * BigInt(targetBps)) / 10000n;
    const amountIn = toSend / 2n; // swap half to WETH (following test pattern)

    console.log(
      "Amount going to UniswapV3 strategy:",
      ethers.formatUnits(toSend, 18),
      "AAVE"
    );
    console.log(
      "Amount to swap (AAVE -> WETH):",
      ethers.formatUnits(amountIn, 18),
      "AAVE"
    );

    // Encode exactInputSingle(params) for SwapRouter02 (following test pattern)
    // Use fallback ABI since JSON import is complex in ES modules
    const swapRouterABI = [
      "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
    ];

    const swapRouterModule = await import(
      "@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json",
      { with: { type: "json" } }
    );
    const artifact = swapRouterModule.default;
    console.log("✅ Using dynamic import for SwapRouter02 artifact in invest");
    const iface = new ethers.Interface(artifact.abi);
    const deadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const params = {
      tokenIn: AAVE_ADDRESS,
      tokenOut: WETH_ADDRESS,
      fee: POOL_FEE,
      recipient: activeStrategyAddress, // deliver WETH to the active strategy
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
        AAVE_ADDRESS,
        WETH_ADDRESS,
        amountIn,
        0,
        activeStrategyAddress,
        routerCalldata,
      ]
    );

    // Create allSwapData: empty arrays for all strategies, payload only for active strategy
    const allSwapData = [];
    for (let i = 0; i < strategies.length; i++) {
      if (i === activeStrategyIndex) {
        allSwapData.push([payload]); // Active strategy gets the swap payload
      } else {
        allSwapData.push([]); // Inactive strategies get empty array
      }
    }

    // Ensure we have exactly the right number of arrays
    console.log("Strategies count:", strategies.length);
    console.log("AllSwapData count:", allSwapData.length);
    console.log("Active strategy index:", activeStrategyIndex);

    console.log("Created swap payload for active strategy");
    console.log("AllSwapData structure:", allSwapData);
    console.log("AllSwapData length:", allSwapData.length);
    console.log(
      `AllSwapData[${activeStrategyIndex}] (Active Strategy):`,
      allSwapData[activeStrategyIndex].length,
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

    // --- debug callStatic / provider.call block (insert before gas estimation) ---
    console.log("\n=== ATTEMPTING STATIC CALL (no tx sent) ===");

    // encode calldata for investIdle to ensure identical call data
    const calldata = vault.interface.encodeFunctionData("investIdle", [
      allSwapData,
    ]);

    // Option A: provider.call (low-level, often reveals revert bytes)
    // try {
    //   console.log("Running provider.call(...) to get revert reason (low-level)...");
    //   const callTx = {
    //     to: VAULT_ADDRESS,
    //     from: wallet.address,
    //     data: calldata,
    //     // optional: value if function needs ETH, e.g. value: 0
    //   };

    //   // run the call at the latest block (or specific block number if needed)
    //   await provider.call(callTx);
    //   console.log("provider.call succeeded (unexpected) — no revert thrown.");
    // } catch (err) {
    //   console.log("provider.call threw — attempting to decode revert data...");

    //   // try a few common places the node might stash the revert bytes
    //   const raw = err.data || err.error?.data || err.result || err;
    //   console.log("raw revert payload:", raw);

    //   // If it's the standard Error(string) ABI, decode it:
    //   try {
    //     // raw sometimes includes '0x' + full payload; Error(string) selector is 0x08c379a0
    //     const payloadHex = typeof raw === "string" ? raw : raw?.data || raw?.result;
    //     if (payloadHex && payloadHex.startsWith("0x08c379a0")) {
    //       // strip selector + offset (first 4 bytes selector + 32 bytes offset = 4+32=36 bytes -> 72 hex chars)
    //       // but safest is to slice off the selector (10 chars incl '0x') and decode as string
    //       const reason = ethers.utils.defaultAbiCoder.decode(
    //         ["string"],
    //         "0x" + payloadHex.slice(10)
    //       )[0];
    //       console.log("Decoded revert reason (Error(string)):", reason);
    //     } else {
    //       // fallback: try to interpret trailing bytes as utf8 (common)
    //       try {
    //         // try different offsets if needed; 138 is often where the string bytes start
    //         console.log(
    //           "Fallback UTF8 attempt:",
    //           ethers.utils.toUtf8String("0x" + (payloadHex || "").slice(138))
    //         );
    //       } catch (utf8Err) {
    //         console.log("Couldn't decode UTF8 fallback:", utf8Err.message || utf8Err);
    //       }
    //     }
    //   } catch (decodeErr) {
    //     console.log("Couldn't decode revert reason using standard Error(string):", decodeErr.message || decodeErr);
    //   }
    // }

    // // Option B: contract.callStatic (nicer, may surface revert reason)
    try {
      console.log("\nTrying contract.callStatic.investIdle(...)");
      // If ethers supports callStatic, this will throw with the revert reason
      await vault.investIdle(allSwapData);
      console.log("callStatic succeeded (unexpected) — no revert thrown.");
    } catch (callStaticErr) {
      console.log("callStatic threw. Raw error:", callStaticErr);

      const raw2 =
        callStaticErr.data || callStaticErr.error?.data || callStaticErr;
      try {
        if (typeof raw2 === "string" && raw2.startsWith("0x08c379a0")) {
          const reason2 = ethers.utils.defaultAbiCoder.decode(
            ["string"],
            "0x" + raw2.slice(10)
          )[0];
          console.log("Decoded revert reason from callStatic:", reason2);
        } else {
          console.log("callStatic raw payload:", raw2);
          // try utf8 fallback
          try {
            console.log(
              "callStatic utf8 fallback:",
              ethers.utils.toUtf8String("0x" + raw2.slice(138))
            );
          } catch {}
        }
      } catch (e) {
        console.log("Couldn't decode callStatic revert:", e.message || e);
      }
    }

    // console.log("=== END STATIC CALL DEBUG ===\n");
    // --- end debug block ---

    // try {
    //   // Try gas estimation first
    //   console.log("Estimating gas...");
    //   const gasEstimate = await vault.investIdle.estimateGas(allSwapData);
    //   console.log("✅ Gas estimate:", gasEstimate.toString());

    //   // If gas estimation works, try the actual transaction
    //   console.log("Sending transaction...");
    //   const tx = await vault.investIdle(allSwapData, {
    //     gasLimit: gasEstimate * 2n, // Use 2x gas limit for safety
    //   });
    //   console.log("Transaction sent:", tx.hash);

    //   const receipt = await tx.wait();
    //   console.log("Transaction confirmed:", receipt.hash);
    //   console.log("Gas used:", receipt.gasUsed.toString());
    //   console.log("Transaction status:", receipt.status);

    //   if (receipt.status === 1) {
    //     console.log("\n=== SUCCESS! ===");
    //     console.log("InvestIdle completed successfully!");
    //   } else {
    //     console.log("\n=== FAILED ===");
    //     console.log("Transaction reverted during execution");
    //   }
    // } catch (error) {

    //     const data = error.data || error.error?.data || error.reason || error;
    // // Typical revert abi: 0x08c379a0 + offset + length + reason
    // try {
    //   // attempt to decode as Error(string)
    //   const reason = ethers.utils.defaultAbiCoder.decode(["string"], "0x" + data.slice(10))[0];
    //   console.log("revert reason:", reason);
    // } catch (e) {
    //   // fallback: try to extract raw UTF-8 bytes (works often)
    //   console.log("raw revert data:", data);
    //   try { console.log("utf8:", ethers.utils.toUtf8String("0x" + data.slice(138))); } catch {}
    // }

    //       console.error("InvestIdle failed:", error.message);

    //       if (error.message.includes("execution reverted")) {
    //         console.log(
    //           "This is a smart contract revert. The issue is in the contract logic."
    //         );
    //       }

    //       if (error.message.includes("missing revert data")) {
    //         console.log(
    //           "The transaction is reverting but the error message isn't being decoded properly."
    //         );
    //         console.log(
    //           "This suggests the revert is happening in an external contract or with custom errors."
    //         );
    //       }
    //     }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testInvestIdleDirect();
