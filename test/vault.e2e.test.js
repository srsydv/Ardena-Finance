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


    // const tx = await uniStrat.knowYourAssets();  
    // const receipt = await tx.wait();
  
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
    //     // ignore unrelated logs
    //   }
    // }

    // console.log("Vault idle:", (await usdc.balanceOf(vault.target)).toString());
    // console.log("Aave aToken:", await aaveStrat.aToken()); // or reserveData check
    // console.log(
    //   "Uniswap totalAssets:",
    //   (await uniStrat.totalAssets()).toString()
    // );
    // console.log(
    //   "Aave totalAssets:",
    //   (await aaveStrat.totalAssets()).toString()
    // );



    // const vaultTVL = await vault.totalAssets();

    // console.log("vaultTVL (raw):", vaultTVL.toString());
// console.log("vaultTVL (USDC):", ethers.formatUnits(vaultTVL, 6)); // USDC human-readable

// console.log("Vault totalAssets (USDC):", ethers.formatUnits(await vault.totalAssets(), 6));
// console.log("Aave strat assets:", ethers.formatUnits(await aaveStrat.totalAssets(), 6));
// console.log("Uni strat assets:", ethers.formatUnits(await uniStrat.totalAssets(), 6));
// console.log("Uni idle USDC:", ethers.formatUnits(await usdc.balanceOf(uniStrat.target), 6));
// console.log("Uni WETH balance:", ethers.formatEther(await ethers.getContractAt("IERC20", WETH).then(c => c.balanceOf(uniStrat.target))));


//*********from here whale will trade into the same pool and we will earn some money **********/
   
// requires: axios installed, ethers, network from hardhat

async function whaleExec0xSwap({
  sellToken,
  buyToken,
  sellAmount,        // BigInt or string in minor units (e.g. "250000000")
  whaleAddr,
  chainId  ,   // Arbitrum
  zeroXEndpoint ,
  zeroXApiKey
}) {
  // 1) request 0x quote with taker=whale
  const res = await axios.get(zeroXEndpoint, {
    headers: {
      "0x-api-key": zeroXApiKey,
      "0x-version": "v2",
    },
    params: {
      sellToken,
      buyToken,
      sellAmount: sellAmount.toString(),
      taker: whaleAddr,
      chainId
    },
  });

  const quote = res.data;
  if (!quote.liquidityAvailable) throw new Error("0x: liquidity not available");
  // inspect route to ensure it's acceptable for your objectives
  console.log("0x route summary:", {
    sellToken: quote.sellToken,
    buyToken: quote.buyToken,
    buyAmount: quote.buyAmount,
    minBuyAmount: quote.minBuyAmount,
    routeTokensCount: quote.route?.tokens?.length || 0,
    fillsCount: quote.route?.fills?.length || 0,
  });

  // Look into fills to see the sources used (e.g. "UniswapV3", "SushiSwap", aggregator names).
  // If you need the trade to pass through *your specific pool* you can inspect fills[].type or fills[].router or fills[].poolAddress if provided by 0x.
  console.log("fills:", quote.route?.fills?.map(f => ({source: f.source, pool: f.poolAddress || f.pool || f.router})) );

  // 2) impersonate whale + top up ETH
  await network.provider.request({
    method: "hardhat_impersonateAccount", params: [whaleAddr]
  });
  const whaleSigner = await ethers.getSigner(whaleAddr);

  // Give whale ETH for gas on hardhat
  await network.provider.send("hardhat_setBalance", [whaleAddr, "0xDE0B6B3A7640000"]); // 1 ETH

  // 3) Ensure allowanceTarget is approved (0x often needs allowanceTarget approval for token pulls)
  // allowanceTarget is in quote.allowanceTarget
  if (quote.allowanceTarget && quote.allowanceTarget !== ethers.ZeroAddress) {
    const token = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", sellToken);
    // Check current allowance
    const current = await token.allowance(whaleAddr, quote.allowanceTarget);
    if (BigInt(current.toString()) < BigInt(sellAmount.toString())) {
      // approve from whale
      const approveTx = await token.connect(whaleSigner).approve(quote.allowanceTarget, sellAmount.toString());
      await approveTx.wait();
      console.log("Approved allowanceTarget", quote.allowanceTarget);
    } else {
      console.log("Allowance already present");
    }
  } else {
    console.log("No allowanceTarget provided by 0x (or zero address) — maybe quote is prebuilt.");
  }

  // 4) optionally verify quote.transaction.to == expected router address and route includes Uniswap V3 pool you want
  console.log("quote.to:", quote.transaction.to);
  // If you want to whitelist the router in your ExchangeHandler
  try {
    await exchanger.setRouter(quote.transaction.to, true);
  } catch (e) {
    // ignore if not relevant to your flow
    console.log("setRouter may fail if not needed:", e.message);
  }

  // 5) Execute the raw transaction as the whale (send tx using quote.transaction.to + data)
  const txReq = {
    to: quote.transaction.to,
    data: quote.transaction.data,
    value: quote.transaction.value ? quote.transaction.value : 0
  };
  // If quote.transaction.gasPrice provided you can set gasPrice, but on forks default is fine.
  console.log("Sending swap tx from whale:", txReq);
  const tx = await whaleSigner.sendTransaction(txReq);
  const receipt = await tx.wait();
  console.log("Swap tx mined:", receipt.transactionHash);

  // 6) Post-swap: check your LP tokensOwed for fees (position manager)
  const pm = await ethers.getContractAt("INonfungiblePositionManager", UNISWAP_POSITION_MANAGER);
  const tokenId = await uniStrat.tokenId(); // or whatever tokenId you want to check
  const pos = await pm.positions(tokenId);
  const tokensOwed0 = BigInt(pos[10].toString());
  const tokensOwed1 = BigInt(pos[11].toString());

  console.log("tokensOwed0:", tokensOwed0.toString(), "tokensOwed1:", tokensOwed1.toString());
  return { quote, receipt, tokensOwed0, tokensOwed1 };
}


let res1 = await whaleExec0xSwap(usdc.target, WETH,3050173774855, whale.address, 42161, "https://api.0x.org/swap/allowance-holder/quote", process.env.ZeroXAPI )

console.log("reeeeeeeee",res1)







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
