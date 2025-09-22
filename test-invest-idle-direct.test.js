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
    const UNI_STRATEGY_ADDRESS = "0xe7bA69Ffbc10Be7c5dA5776d768d5eF6a34Aa191";
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

    // Find the strategy with allocation > 0
    let activeStrategyIndex = -1;
    let activeStrategyAddress = "";
    let targetBps = 0;
    
    for (let i = 0; i < strategies.length; i++) {
      const bps = await vault.targetBps(strategies[i]);
      console.log(`Strategy ${i}: ${strategies[i]} allocation: ${bps.toString()} bps`);
      if (bps > 0) {
        activeStrategyIndex = i;
        activeStrategyAddress = strategies[i];
        targetBps = bps;
        break;
      }
    }
    
    if (activeStrategyIndex === -1) {
      console.log("No active strategy found!");
      return;
    }
    
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
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const params = {
      tokenIn: USDC_ADDRESS,
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
        USDC_ADDRESS,
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

    console.log("Created swap payload for active strategy");
    console.log("AllSwapData structure:", allSwapData);
    console.log("AllSwapData length:", allSwapData.length);
    console.log(`AllSwapData[${activeStrategyIndex}] (Active Strategy):`, allSwapData[activeStrategyIndex].length, "bytes");

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
const calldata = vault.interface.encodeFunctionData("investIdle", [allSwapData]);

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

  const raw2 = callStaticErr.data || callStaticErr.error?.data || callStaticErr;
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
        console.log("callStatic utf8 fallback:", ethers.utils.toUtf8String("0x" + raw2.slice(138)));
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
