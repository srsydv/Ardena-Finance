const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const fetch = require("node-fetch");
const axios = require("axios");
require("dotenv").config();

describe("Vault + Strategies Integration (Arbitrum fork)", function () {
  this.timeout(200_000);
  let deployer, user, treasury;
  let usdc, vault, fees, access, aaveStrat, uniStrat, mockRouter;
  const USDC_WHALE = "0x463f5D63e5a5EDB8615b0e485A090a18Aba08578"; // big USDC holder on Arbitrum
  const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC
  const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
  const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"; // Aave V3 pool
  const A_USDC = "0x625E7708f30cA75bfd92586e17077590C60eb4cD"; // Aave interest-bearing USDC
  const UNISWAP_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const UNISWAP_POOL = "0xC6962004f452bE9203591991D15f6b388e09E8D0"; // USDC/WETH pool
  // const CHAINLINK = "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3";

  // Chainlink feeds (verify on chainlink docs)
  const ETH_USD = "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612"; // ETH/USD
  const USDC_USD = "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3"; // USDC/USD
  // Example token/ETH feed if you need composition (UNI/ETH etc)
  const UNI_ETH = "0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720"; // example (check your token!)

  const heartbeat = 1 * 60 * 60; // 1 hour staleness budget
  // routers
  const SUSHI_ROUTER = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506"; // UniswapV2-like
  let ZeroXrouter;

  // const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
  // const SWAPROUTER_V2 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

  beforeEach(async () => {
    [deployer, user, treasury] = await ethers.getSigners();

    // --- Impersonate whale ---
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [USDC_WHALE],
    });
    const whale = await ethers.getSigner(USDC_WHALE);

    // Give whale some ETH for gas
    await network.provider.send("hardhat_setBalance", [
      whale.address,
      "0x1000000000000000000", // 1 ETH
    ]);

    // usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
    usdc = await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      USDC_ADDRESS
    );
    // console.log("USDC contract at:", usdc.target); // ethers v6 uses .target instead of .address
    // const code = await ethers.provider.getCode(USDC_ADDRESS);
    // console.log("Deployed code at USDC:", code);

    console.log(
      "Whale USDC balance:",
      (await usdc.balanceOf(whale.address)).toString()
    );
    // console.log("USDC:", usdc.target);
    // console.log("Deployer:", deployer.address);
    // console.log("treasury:", treasury.address);

    // const v3pool = await ethers.getContractAt("IUniswapV3Pool", UNISWAP_POOL);
    // console.log("pool token0", await v3pool.token0());
    // console.log("pool token1", await v3pool.token1());
    // console.log("pool fee", (await v3pool.fee()).toString());

    // Transfer 10,000 USDC from whale to deployer
    await usdc
      .connect(whale)
      .transfer(deployer.address, ethers.parseUnits("10000", 6));

    // console.log(
    //   "Deployer USDC balance:",
    //   (await usdc.balanceOf(deployer.address)).toString()
    // );

    // const code = await ethers.provider.getCode(ETH_USD);
    // console.log("Oracle code:", code !== "0x" ? "exists" : "empty!");

    // const AAVE_POOL_code = await ethers.provider.getCode(AAVE_POOL);
    // console.log(
    //   "AAVE_POOL code:",
    //   AAVE_POOL_code !== "0x" ? "exists" : "empty!"
    // );

    // const pool = new ethers.Contract(
    //   AAVE_POOL,
    //   [
    //     "function getReserveData(address) view returns (\
    //   uint256,uint128,uint128,uint128,uint128,uint128,uint40,uint16,\
    //   address,address,address,address,uint128,uint128,uint128)",
    //   ],
    //   ethers.provider
    // );

    // const rd = await pool.getReserveData(USDC_ADDRESS);
    // console.log("id:", rd[7]); // 12 on Arbitrum
    // console.log("aToken:", rd[8]); // 0x625E77... (aUSDC)
    // console.log("stableDebt:", rd[9]);
    // console.log("variableDebt:", rd[10]);

    // expect(await usdc.balanceOf(deployer.address)).to.equal(
    //   ethers.parseUnits("10000", 6)
    // );

    const Oracle = await ethers.getContractFactory("OracleModule");
    const oracle = await Oracle.deploy(WETH);
    // await oracle.deployed();

    // ETH/USD (needed for any token that uses token/ETH composition)
    await oracle.setEthUsd(ETH_USD, heartbeat);

    // Direct USD feeds
    await oracle.setTokenUsd(usdc.target, USDC_USD, "86400");

    // (Optional) composition route example for a token without USD feed:
    // await oracle.setTokenEthRoute(TOKEN, UNI_ETH, /*invert=*/false, heartbeat);

    // --- Deploy FeeModule + AccessController ---
    const FeeModule = await ethers.getContractFactory("FeeModule");
    fees = await FeeModule.deploy(
      usdc.target,
      treasury.address,
      deployer.address
    );

    // console.log("Fee:", fees.target);

    const Access = await ethers.getContractFactory("AccessController");
    access = await Access.deploy(deployer.address);

    // console.log("Access:", access.target);

    // --- Deploy Vault ---
    const Vault = await ethers.getContractFactory("Vault");
    vault = await Vault.deploy(
      usdc.target,
      "My Vault",
      "MVLT",
      access.target,
      fees.target,
      usdc.target, // oracle (set to zero for now)
      ethers.parseUnits("1000000", 6), // deposit cap
      6 // decimals
    );

    // console.log("Vault:", vault.target);
    // --- Deploy Aave Strategy ---
    const AaveV3Strategy = await ethers.getContractFactory("AaveV3Strategy");
    aaveStrat = await AaveV3Strategy.deploy(
      vault.target,
      usdc.target,
      AAVE_POOL
    );

    // console.log("aaveStrat:", aaveStrat.target);

    // --- Deploy ExchangeHandler ---
    const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
    exchanger = await ExchangeHandler.deploy(deployer.address);
    await exchanger.setRouter(SUSHI_ROUTER, true);

    // console.log("exchanger:", exchanger.target);

    // --- Deploy Uniswap Strategy ---
    const UniswapV3Strategy = await ethers.getContractFactory(
      "UniswapV3Strategy"
    );
    uniStrat = await UniswapV3Strategy.deploy(
      vault.target,
      usdc.target,
      UNISWAP_POSITION_MANAGER,
      UNISWAP_POOL,
      exchanger.target, // dummy exchanger (not used in test)
      oracle.target // dummy oracle
    );

    // console.log("uniStrat:", uniStrat.target);

    // After deploying AccessController
    await access.setManager(deployer.address, true);

    // --- Add strategies (50/50) ---
    await vault.setStrategy(aaveStrat.target, 5000);
    await vault.setStrategy(uniStrat.target, 5000);
  });

  it("User can deposit, invest", async () => {
    this.timeout(180_000);

    async function mineBlocks(n) {
      try {
        await network.provider.request({
          method: "hardhat_mine",
          params: ["0x" + n.toString(16)],
        });
      } catch {
        for (let i = 0; i < n; i++)
          await network.provider.request({ method: "evm_mine", params: [] });
      }
    }
    // const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
    const SWAPROUTER_V2 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
    const UNISWAP_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    // const { ethers, network } = require("hardhat");

    const depositAmount = ethers.parseUnits("1000", 6);
    console.log("depositAmount:", depositAmount.toString());
    // Approve Vault
    await usdc.approve(vault.target, depositAmount);

    // Deposit into Vault
    await vault.deposit(depositAmount, deployer.address);

    expect(await usdc.balanceOf(vault.target)).to.equal(depositAmount);

    // How much goes to Uni strategy (vault will send to strategy in investIdle)
    const toUni = depositAmount / 2n; // 50% to uni strategy as per setStrategy
    const toUniHalf = toUni / 2n; // we plan to swap half of strategy allocation to WETH

    const axios = require("axios");
    console.log("before axios");
    const res = await axios.get(
      "https://api.0x.org/swap/allowance-holder/quote",
      {
        headers: {
          "0x-api-key": process.env.ZeroXAPI,
          "0x-version": "v2",
        },
        params: {
          sellAmount: toUniHalf.toString(),
          taker: uniStrat.target,
          chainId: 42161,
          sellToken: usdc.target,
          buyToken: WETH,
        },
        timeout: 200000,
      }
    );
    const quote = res.data;
    console.log("After axios");

    console.log("quote.transaction.to for investIdle()", quote.transaction.to);

    // Pack into your ExchangeHandler format
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const payload = abiCoder.encode(
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
        quote.transaction.to, // router
        usdc.target, // tokenIn
        WETH, // tokenOut
        toUniHalf, // amountIn
        quote.minBuyAmount, // minOut
        uniStrat.target, // recipient
        quote.transaction.data, // raw calldata from 0x
      ]
    );
    // console.log("payload",payload);
    await exchanger.setRouter(quote.transaction.to, true);

    // now pack into allSwapData as before
    const allSwapData = [[], [payload]];
    console.log("!Excuting vault.investIdle()");
    await vault.investIdle(allSwapData);
    console.log("!Excuted vault.investIdle()");

    await mineBlocks(3);

    const weth = await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      WETH
    );
    const usdcBal = await usdc.balanceOf(uniStrat.target);
    const wethBal = await weth.balanceOf(uniStrat.target);
    console.log(
      "uniStrat balances after collect -> USDC after investIdle:",
      ethers.formatUnits(usdcBal, 6),
      "WETH:",
      ethers.formatEther(wethBal)
    );

// Constants
const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // official V3 router
const UNISWAP_POOL = "0xC6962004f452bE9203591991D15f6b388e09E8D0";     // USDC/WETH pool
const poolFee = 500; // you confirmed this is the fee tier
const whale = await ethers.getSigner(USDC_WHALE);

// const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS, whale);
const amountIn = ethers.parseUnits("1000", 6); // whale will trade 1000 USDC

// const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // replace with the router you plan to call on fork
const artifact = require("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
const iface = new ethers.Interface(artifact.abi);

const usdcContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", usdc.target);
await usdcContract.connect(whale).approve(UNISWAP_V3_ROUTER, amountIn);

const params = {
  tokenIn: USDC_ADDRESS,
  tokenOut: WETH,
  fee: poolFee,
  recipient: USDC_WHALE,
  deadline: Math.floor(Date.now()/1000) + 60*20,
  amountIn: amountIn,
  amountOutMinimum: 0n,
  sqrtPriceLimitX96: 0n
};


const calldata = iface.encodeFunctionData("exactInputSingle", [params]);

// simulate call
// 6) Simulate via provider.call from whale
try {
  const sim = await ethers.provider.call({
    to: UNISWAP_V3_ROUTER,
    data: calldata,
    from: whale.address,
    // value: 0 // only set value if swapping ETH
  });
  console.log("Sim returned (hex):", sim);
  console.log("Sim success — router would not revert for these exact params.");
} catch (err) {
  console.error("Sim reverted — full error:", err);
  // attempt to show revert data if present
  if (err && err.data) {
    console.error("revert data (hex):", err.data);
  }
}





// usage:

//  // --- Impersonate whale ---
//  await network.provider.request({
//   method: "hardhat_impersonateAccount",
//   params: [USDC_WHALE],
// });
// const whaleAddr = await ethers.getSigner(USDC_WHALE);

// // Give whale some ETH for gas
// await network.provider.send("hardhat_setBalance", [
//   whale.address,
//   "0x1000000000000000000", // 1 ETH
// ]);


// const whaleAddr = await ethers.getSigner(USDC_WHALE);
// await network.provider.request({ method: "hardhat_impersonateAccount", params: [whaleAddr] });
// await network.provider.send("hardhat_setBalance", [whaleAddr, "0x1000000000000000000"]); // 1 ETH for gas
// const sim = await simulateExactInputSingleAs();
// if (!sim.ok) {
//   // handle revert: print and bail
//   throw new Error("swap simulation failed; see logs above");
// }
// else send for real (if you want):
// const rc = await sendExactInputSingleAs();


///////////



// const whaleSigner = await ethers.getSigner(USDC_WHALE);
//       const token = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", usdc.target);
//       const approveTx = await token.connect(whaleSigner).approve(UNISWAP_V3_ROUTER, amountIn);
//       await approveTx.wait();

//       const router = new ethers.Contract(UNISWAP_V3_ROUTER, SwapRouterABI, ethers.provider);

// const params = {
//   tokenIn: USDC_ADDRESS,
//   tokenOut: WETH,
//   fee: poolFee,
//   recipient: USDC_WHALE,                       // just send output to whale
//   deadline: Math.floor(Date.now() / 1000) + 60*20,
//   amountIn: (amountIn).toString(),
//   amountOutMinimum: 0,                            // no slippage check for test
//   sqrtPriceLimitX96: 0                            // no price limit
// };

// // console.log("parmmm",params);



//   // For tuple-ABI quirky cases, we can call using the fully qualified signature
//   const fqName = "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))";

//   // 1) simulate via callStatic (connected to whale)
//   try {
//     // attach whale as signer for call context (callStatic doesn't send)
//     const routerWithWhale = router.connect(whale);
//     console.log("Simulating callStatic...");
//     // try both convenient name and fully-qualified name if one not found
//     let simulated;
//     if (routerWithWhale.callStatic && routerWithWhale.callStatic.exactInputSingle) {
//       simulated = await routerWithWhale.callStatic.exactInputSingle(params, { gasLimit: 5_000_000 });
//     } else if (routerWithWhale.callStatic && routerWithWhale.callStatic[fqName]) {
//       simulated = await routerWithWhale.callStatic[fqName](params, { gasLimit: 5_000_000 });
//     } else {
//       // fallback: try positional array (some ABIs map tuple to single array arg)
//       if (routerWithWhale.callStatic[fqName]) {
//         simulated = await routerWithWhale.callStatic[fqName]([
//           USDC_ADDR,
//           WETH_ADDR,
//           poolFee,
//           whaleAddr,
//           params.deadline,
//           amountIn,
//           0n,
//           0n
//         ], { gasLimit: 5_000_000 });
//       } else {
//         throw new Error("callStatic exactInputSingle method not found on contract object (ABI mismatch)");
//       }
//     }
//     console.log("callStatic succeeded, amountOut:", simulated.toString());
//   } catch (simErr) {
//     console.log("callStatic reverted. simErr.message:", simErr.message || simErr);
//     // attempt to extract revert data (ethers v6 sometimes places it in error.error.data or error.data)
//     const raw = simErr.error?.data || simErr.data || simErr.body || simErr.receipt?.revertReason || simErr.reason;
//     console.log("raw revert data (may be hex):", raw);
//     const hex = typeof raw === "string" && raw.startsWith("0x") ? raw : (raw && raw.data ? raw.data : null);
//     console.log("decoded revert:", await decodeRevert(hex));
//     throw simErr; // stop here — simulation failed
//   }

//   // 2) If simulation passed, send the tx for real
//   try {
//     // need router connected to whale to send
//     const routerSigner = new ethers.Contract(SWAP_ROUTER, swapAbi, whale);
//     console.log("Sending transaction...");
//     const tx = await routerSigner.exactInputSingle(params, { gasLimit: 5_000_000 });
//     const rcpt = await tx.wait();
//     console.log("Swap tx mined. status:", rcpt.status, "txHash:", rcpt.transactionHash);
//   } catch (sendErr) {
//     console.log("sendErr.message:", sendErr.message || sendErr);
//     const raw2 = sendErr.error?.data || sendErr.data || sendErr.body || sendErr.receipt?.revertReason;
//     console.log("send revert raw:", raw2);
//     const hex2 = typeof raw2 === "string" && raw2.startsWith("0x") ? raw2 : (raw2 && raw2.data ? raw2.data : null);
//     console.log("decoded send revert:", await decodeRevert(hex2));
//     throw sendErr;
//   }




//////////////////





//  // 1) simulate with callStatic to get revert without spending gas
//  try {
//   console.log("Simulating callStatic...");
//   const simulated = await router.callStatic.exactInputSingle(params, { gasLimit: 5_000_000 });
//   console.log("callStatic succeeded, simulated amountOut:", simulated.toString());
// } catch (simErr) {
//   // try to extract revert data
//   const raw = simErr.error && simErr.error.data ? simErr.error.data : (simErr.data || simErr.body || simErr.receipt?.revertReason);
//   console.log("callStatic reverted. simErr:", simErr.message || simErr);
//   const revertHex = raw && typeof raw === "string" ? raw : (raw && raw.data ? raw.data : null);
//   console.log("decoded revert reason:", await decodeRevert(revertHex));
//   throw new Error("simulation failed - aborting send");
// }

// // 2) send the real tx
// try {
//   const tx = await router.exactInputSingle(params, { gasLimit: 5_000_000 });
//   const receipt = await tx.wait();
//   console.log("swap tx mined. status:", receipt.status, "txHash:", receipt.transactionHash);
// } catch (sendErr) {
//   const raw = sendErr.error && sendErr.error.data ? sendErr.error.data : (sendErr.data || sendErr.body);
//   console.log("sendTx failed:", sendErr.message || sendErr);
//   console.log("decoded revert reason:", await decodeRevert(raw));
//   throw sendErr;
// }

// const tx = await router.exactInputSingle(params);
// await tx.wait();
// console.log("Whale swap executed in same Uniswap V3 pool");


// await usdc.approve(UNISWAP_V3_ROUTER, amountIn);


    

    // Give whale some ETH for gas
    await network.provider.send("hardhat_setBalance", [
      whale.address,
      "0x1000000000000000000", // 1 ETH
    ]);
    // let res1 = await whaleExec0xSwap(
    //   usdc.target,
    //   WETH,
    //   "25127259878587",
    //   whale.address,
    //   42161,
    //   "https://api.0x.org/swap/allowance-holder/quote",
    //   process.env.ZeroXAPI
    // );

    // console.log("reeeeeeeee",res1)

    // require at top of file: const { ethers, network } = require("hardhat");

    async function collectFeesAndShow() {
      const pm = await ethers.getContractAt(
        "INonfungiblePositionManager",
        UNISWAP_POSITION_MANAGER
      );
      const usdc = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        USDC_ADDRESS
      );
      const weth = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        WETH
      );

      const tokenId = await uniStrat.tokenId();
      console.log("tokenId:", tokenId.toString());

      // 1) show position storage BEFORE collect
      const posBefore = await pm.positions(tokenId);
      console.log("position before (liquidity,fees):", {
        liquidity: posBefore[7].toString(),
        tokensOwed0: posBefore[10].toString(),
        tokensOwed1: posBefore[11].toString(),
        tickLower: posBefore[5].toString(),
        tickUpper: posBefore[6].toString(),
      });

      // 2) impersonate uniStrat (position owner) and fund it with ETH for gas
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [uniStrat.target],
      });
      // const uniSigner = await ethers.getSigner(uniStrat.target);

      const uniAddress = uniStrat.target;

      // give uniStrat some ETH so it can pay gas
      await network.provider.request({
        method: "hardhat_setBalance",
        params: [uniAddress, "0xde0b6b3a7640000"], // 1 ETH in hex (wei)
      });

      // impersonate the account
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [uniAddress],
      });
      const uniSigner = await ethers.getSigner(uniAddress);

      // 3) collect (max amounts)
      const max128 = (BigInt(1) << 128n) - 1n; // uint128 max

      let tx;
      try {
        // Preferred: pass struct-like object (named fields)
        tx = await pm.connect(uniSigner).collect({
          tokenId: tokenId,
          recipient: uniAddress,
          amount0Max: max128,
          amount1Max: max128,
        });
      } catch (err1) {
        console.log(
          "collect(object) failed, trying tuple/positional form (err1.message):",
          err1.message
        );

        try {
          // Alternative: pass as tuple array [tokenId, recipient, amount0Max, amount1Max]
          tx = await pm
            .connect(uniSigner)
            .collect([tokenId, uniAddress, max128, max128]);
        } catch (err2) {
          console.error("collect(tuple) also failed:", err2);
          throw err2; // rethrow so test shows it
        }
      }
      // const collectTx = await pm.connect(uniSigner).collect({
      //   tokenId: tokenId,
      //   recipient: uniStrat.target,
      //   amount0Max: max128,
      //   amount1Max: max128
      // });
      // const rec = await collectTx.wait();
      // console.log("collect tx mined:", rec.transactionHash, "status:", rec.status);

      // 4) position storage AFTER collect (tokensOwed fields should be zeroed or smaller)
      const posAfter = await pm.positions(tokenId);
      console.log("position after (liquidity,fees):", {
        liquidity: posAfter[7].toString(),
        tokensOwed0: posAfter[10].toString(),
        tokensOwed1: posAfter[11].toString(),
      });

      // 5) balances on the uniStrat contract after collect
      const usdcBal = await usdc.balanceOf(uniStrat.target);
      const wethBal = await weth.balanceOf(uniStrat.target);
      console.log(
        "uniStrat balances after collect -> USDC:",
        ethers.formatUnits(usdcBal, 6),
        "WETH:",
        ethers.formatEther(wethBal)
      );
    }

    await collectFeesAndShow();
  });

  it("User can deposit", async () => {
    console.log(
      "Uniswap totalAssets:",
      (await uniStrat.totalAssets()).toString()
    );
    console.log(
      "Aave totalAssets:",
      (await aaveStrat.totalAssets()).toString()
    );
    const tx = await uniStrat.knowYourAssets();
    const receipt = await tx.wait();
    // console.log("receipt",receipt);

    // Parse logs for `totalAsset` event
    // const iface = new ethers.Interface([
    //   "event totalAsset(uint256 amt0, uint256 amt1, uint256 fees0, uint256 fees1)"
    // ]);

    // for (const log of receipt.logs) {
    //   try {
    //     const parsed = iface.parseLog(log);
    //     if (parsed.name === "totalAsset") {
    //       console.log("Event values:");
    //       console.log("amt0 (WETH raw):", parsed.args[0].toString());
    //       console.log("amt1 (USDC raw):", parsed.args[1].toString());
    //       console.log("fees0:", parsed.args[2].toString());
    //       console.log("fees1:", parsed.args[3].toString());
    //     }
    //   } catch (err) {
    //     console.log("err:", err.message);
    //     // ignore unrelated logs
    //   }
    // }
  });
});
