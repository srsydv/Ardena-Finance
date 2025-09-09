const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const fetch = require("node-fetch");
const axios = require("axios");
require("dotenv").config();

describe("Vault + Strategies Integration (Arbitrum fork)", function () {
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

    // console.log(
    //   "Whale USDC balance:",
    //   (await usdc.balanceOf(whale.address)).toString()
    // );
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
    // const { ethers } = require("hardhat");

    // Constants for Arbitrum
    const ZEROX_ARBITRUM_QUOTE = "https://arbitrum.api.0x.org/swap/v1/quote";
    // UniswapV3 quoter address used earlier in your tests (Arbitrum)
    const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
    // UniswapV3 Swap Router (periphery) — used only if falling back to building exactInputSingle calldata
    // On Arbitrum common swap router: 0xE592427A0AEce92De3Edee1F18E0157C05861564 (mainnet UniswapV3 router) or your chosen router.
    // Replace with the router you will actually call on the fork (or your mock router address)
    const SWAP_ROUTER_V3 = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    console.log("params", {
      sellToken: usdc.target,
      buyToken: WETH,
      chainId: 42161,
      sellAmount: toUniHalf.toString(),
      taker: uniStrat.target,
    });
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
      }
    );
    const quote = res.data;

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
    await vault.investIdle(allSwapData);
    // console.log("used quoteSource:", quoteSource, "meta:", meta);

    // async function build0xSwapPayload({ sellToken, buyToken, amountIn, recipient }) {
    //   const url = "https://arbitrum.api.0x.org/swap/v1/quote";

    //   const res = await axios.get(url, {
    //     params: {
    //       sellToken,
    //       buyToken,
    //       sellAmount: amountIn.toString(),
    //       takerAddress: recipient
    //     }
    //   });
    //   const quote = res.data;

    //   const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    //   const payload = abiCoder.encode(
    //     ["address","address","address","uint256","uint256","address","bytes"],
    //     [
    //       quote.to,
    //       sellToken,
    //       buyToken,
    //       amountIn,
    //       quote.buyAmount,
    //       recipient,
    //       quote.data
    //     ]
    //   );

    //   return { payload, quote };
    // }

    // const axios = require("axios");

    // const url1 = "https://arbitrum.api.0x.org/swap/v1/price";
    // const res = await axios.get(url1, {
    //   params: {
    //     sellToken: usdc.target,
    //     buyToken: WETH,
    //     sellAmount: "1000000"
    //   }
    // });
    // console.log(res.data);

    // async function debug0xQuote({ sellToken, buyToken, amountIn, takerAddress }) {

    //   const url = "https://arbitrum.api.0x.org/swap/v1/quote";
    //   const params = {
    //     sellToken: sellToken,
    //     buyToken: buyToken,
    //     sellAmount: amountIn.toString(), // MUST be string
    //     // takerAddress: takerAddress,     // try with and without
    //     // slippagePercentage: 0.01
    //   };

    //   console.log("0x quote request url:", url);
    //   console.log("0x quote request params:", params);

    //   try {
    //     const resp = await axios.get(url, { params, timeout: 15000 });
    //     console.log("0x quote status:", resp.status);
    //     console.log("0x quote data keys:", Object.keys(resp.data));
    //     // print smaller important fields
    //     console.log("to:", resp.data.to);
    //     console.log("buyAmount:", resp.data.buyAmount);
    //     console.log("data length:", resp.data.data ? resp.data.data.length : 0);
    //     return resp.data;
    //   } catch (err) {
    //     console.error("0x quote FAILED");
    //     if (err.response) {
    //       // server responded with non-2xx
    //       console.error("status:", err.response.status);
    //       console.error("headers:", err.response.headers && JSON.stringify(err.response.headers).slice(0, 200));
    //       console.error("body:", err.response.data);
    //     } else if (err.request) {
    //       // request sent but no response
    //       console.error("no response; request:", err.request);
    //     } else {
    //       // something else
    //       console.error("err.message:", err.message);
    //     }
    //     throw err; // rethrow so your test stops here
    //   }
    // }

    // console.log(">>> debug start");
    // await debug0xQuote({
    //   sellToken: usdc.target,
    //   buyToken: WETH,
    //   amountIn: (toUniHalf).toString(),
    //   takerAddress: uniStrat.target
    // });
    // console.log(">>> debug end");

    // const { payload, quote } = await build0xSwapPayload({
    //   sellToken: usdc.target,
    //   buyToken: WETH,
    //   amountIn: (toUniHalf).toString(),
    //   recipient: uniStrat.target
    // });

    // --- DEBUG BLOCK: inspect state, run investIdle and catch revert with revertData ---
    // console.log("==== DEBUG BEFORE investIdle ====");
    // console.log("vault USDC balance:", ethers.formatUnits(await usdc.balanceOf(vault.target), 6));
    // console.log("vault allowance -> aaveStrat:", (await usdc.allowance(vault.target, aaveStrat.target)).toString());
    // console.log("vault allowance -> uniStrat:", (await usdc.allowance(vault.target, uniStrat.target)).toString());
    // console.log("uniStrat USDC balance (before):", ethers.formatUnits(await usdc.balanceOf(uniStrat.target), 6));
    // console.log("uniStrat allowance -> exchanger (before):", (await usdc.allowance(uniStrat.target, exchanger.target)).toString());
    // console.log("exchanger USDC balance (before):", ethers.formatUnits(await usdc.balanceOf(exchanger.target), 6));
    // console.log("exchanger allowance -> router (before):", (await usdc.allowance(exchanger.target, mockRouter.target)).toString());
    // console.log("mockRouter WETH balance:", ethers.formatEther(await (await ethers.getContractAt("IERC20", WETH)).balanceOf(mockRouter.target)));

    // try {

    //   const tx = await vault.investIdle([[], [uniPayload]]);
    //   const rc = await tx.wait();
    //   console.log("investIdle OK tx:", rc.transactionHash);

    //   console.log("==== DEBUG AFTER investIdle (SUCCESS) ====");
    //   console.log("vault USDC balance:", ethers.formatUnits(await usdc.balanceOf(vault.target), 6));
    //   console.log("uniStrat USDC balance (after):", ethers.formatUnits(await usdc.balanceOf(uniStrat.target), 6));
    //   console.log("uniStrat allowance -> exchanger (after):", (await usdc.allowance(uniStrat.target, exchanger.target)).toString());
    //   console.log("exchanger USDC balance (after):", ethers.formatUnits(await usdc.balanceOf(exchanger.target), 6));
    // } catch (err) {
    //   console.log("investIdle REVERT. raw err:", err.message || err);

    //   // try to extract revert data
    //   let revertData = null;
    //   if (err && err.data) revertData = err.data;
    //   else if (err && err.error && err.error.data) revertData = err.error.data;
    //   else if (err && err.body) {
    //     try {
    //       const b = JSON.parse(err.body);
    //       revertData = b && b.error && b.error.data ? b.error.data : null;
    //     } catch (e) {}
    //   }
    //   console.log("investIdle revertData:", revertData);

    //   // If there's revert data, try decode Error(string)
    //   if (revertData && revertData !== "0x") {
    //     try {
    //       const reason = ethers.decodeErrorResult("Error(string)", revertData);
    //       console.log("Decoded revert reason:", reason[0]);
    //     } catch (e) {
    //       try {
    //         console.log("Revert utf8:", ethers.toUtf8String(revertData));
    //       } catch (u) {
    //         console.log("Couldn't decode revertData");
    //       }
    //     }
    //   }

    //   // print post-mortem balances anyway
    //   console.log("==== DEBUG AFTER investIdle (REVERT) ====");
    //   console.log("vault USDC balance:", ethers.formatUnits(await usdc.balanceOf(vault.target), 6));
    //   console.log("uniStrat USDC balance (after):", ethers.formatUnits(await usdc.balanceOf(uniStrat.target), 6));
    //   console.log("uniStrat allowance -> exchanger (after):", (await usdc.allowance(uniStrat.target, exchanger.target)).toString());
    //   console.log("exchanger USDC balance (after):", ethers.formatUnits(await usdc.balanceOf(exchanger.target), 6));
    // }

    ///////

    // const whale = await ethers.getSigner(USDC_WHALE);

    // const vaultIdle = await usdc.balanceOf(vault.target);
    // const vaultTVL = await vault.totalAssets();

    // console.log("vaultTVL (raw):", vaultTVL.toString());
    // console.log("vaultTVL (USDC):", ethers.formatUnits(vaultTVL, 6)); // USDC human-readable

    // console.log(
    //   "Vault totalAssets (USDC):",
    //   ethers.formatUnits(await vault.totalAssets(), 6)
    // );
    // console.log(
    //   "Aave strat assets:",
    //   ethers.formatUnits(await aaveStrat.totalAssets(), 6)
    // );
    // console.log(
    //   "Uni strat assets:",
    //   ethers.formatUnits(await uniStrat.totalAssets(), 6)
    // );
    // console.log(
    //   "Uni idle USDC:",
    //   ethers.formatUnits(await usdc.balanceOf(uniStrat.target), 6)
    // );
    // console.log(
    //   "Uni WETH balance:",
    //   ethers.formatEther(
    //     await ethers
    //       .getContractAt("IERC20", WETH)
    //       .then((c) => c.balanceOf(uniStrat.target))
    //   )
    // );

    // // Aave: aToken balance held by the strategy (interest accrues to aToken)
    // // The Aave strategy exposes aToken() in your test earlier — if not, derive from getReserveData
    // const aTokenAddr = await aaveStrat.aToken();
    // const aToken = await ethers.getContractAt(
    //   "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    //   aTokenAddr
    // );
    // const aTokenBal = await aToken.balanceOf(aaveStrat.target);

    // // Uniswap: idle want in strategy + LP position owed fees
    // const uniWantIdle = await usdc.balanceOf(uniStrat.target);
    // // if Uniswap strategy exposes tokenId
    // const tokenId = await uniStrat.tokenId();
    // console.log("tokenId", tokenId.toString());
    // let uniFees0 = 0n,
    //   uniFees1 = 0n;
    // if (tokenId !== 0n) {
    //   const pm = await ethers.getContractAt(
    //     "INonfungiblePositionManager",
    //     UNISWAP_POSITION_MANAGER
    //   );
    //   const pos = await pm.positions(tokenId);
    //   // tokensOwed0 is pos[10], tokensOwed1 is pos[11] (per your interface)
    //   uniFees0 = pos[10];
    //   uniFees1 = pos[11];
    //   console.log("uniFees0", uniFees0);
    //   console.log("uniFees1", uniFees1);
    // }

    // // Treasury balance snapshot (in want)
    // const treasuryBal = await usdc.balanceOf(treasury.address);
  });
});
