const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const fetch = require("node-fetch");
const axios = require("axios");
require("dotenv").config();

describe("Vault + Strategies Integration (Arbitrum fork)", function () {
  this.timeout(200_000);
  let deployer, user, treasury;
  let usdc, vault, fees, access, aaveStrat, uniStrat, mockRouter;
  const USDC_WHALE = "0x463f5D63e5a5EDB8615b0e485A090a18Aba08578";
  const USDC_WHALE_TWO = "0xace659DC614D5fC455D123A1c3E438Dd78A05e77"; // big USDC holder on Arbitrum
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

  // beforeEach(async () => {
    async function deployContracts() {
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

    return { deployer, user, treasury, usdc, vault, fees, access, aaveStrat, uniStrat, mockRouter };
  };

  describe("Deployment", function () {
    it("should deploy contracts", async () => {
      const { deployer, user, treasury, usdc, vault, fees, access, aaveStrat, uniStrat, mockRouter } = await deployContracts();
      expect(deployer).to.be.an("object");
      expect(user).to.be.an("object");
      expect(treasury).to.be.an("object");
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

    // Give whale some ETH for gas
    // await network.provider.send("hardhat_setBalance", [
    //   whale.address,
    //   "0x1000000000000000000", // 1 ETH
    // ]);

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

  it("let whale trade in uniswap pool", async () => {
    this.timeout(180_000);
    // console.log(
    //   "Uniswap totalAssets:",
    //   (await uniStrat.totalAssets()).toString()
    // );
    // console.log(
    //   "Aave totalAssets:",
    //   (await aaveStrat.totalAssets()).toString()
    // );
    // const tx = await uniStrat.knowYourAssets();
    // const receipt = await tx.wait();




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

    // give uniStrat some ETH so it can pay gas
    await network.provider.request({
      method: "hardhat_setBalance",
      params: [USDC_WHALE_TWO, "0xde0b6b3a7640000"], // 1 ETH in hex (wei)
    });

    // impersonate the account
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [USDC_WHALE_TWO],
    });
    const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // official V3 router
    const UNISWAP_POOL = "0xC6962004f452bE9203591991D15f6b388e09E8D0"; // USDC/WETH pool
    const poolFee = 500; // you confirmed this is the fee tier
    const whale = await ethers.getSigner(USDC_WHALE);
    const whale2 = await ethers.getSigner(USDC_WHALE_TWO);

    // const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS, whale);
    const amountIn = ethers.parseUnits("1000000", 6); // whale will trade 1000 USDC

    // const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // replace with the router you plan to call on fork
    const artifact = require("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
    const iface = new ethers.Interface(artifact.abi);

    const usdcContract = await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      usdc.target
    );
    await usdcContract.connect(whale).approve(UNISWAP_V3_ROUTER, amountIn);
    await usdcContract.connect(whale2).approve(UNISWAP_V3_ROUTER, amountIn);

    const params = {
      tokenIn: USDC_ADDRESS,
      tokenOut: WETH,
      fee: poolFee,
      recipient: USDC_WHALE,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      amountIn: amountIn,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    };

    const calldata = iface.encodeFunctionData("exactInputSingle", [params]);

    const IUniswapV3PoolABI = [
      "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
      "function token0() view returns (address)",
      "function token1() view returns (address)",
      "function fee() view returns (uint24)",
      "function liquidity() view returns (uint128)",
    ];

    // Instantiate pool contract (this is the step you were missing)
    const pool = await ethers.getContractAt(IUniswapV3PoolABI, UNISWAP_POOL);

    const slot0 = await pool.slot0();
    console.log("Current tick:", slot0.tick.toString());
    // console.log("your tickLower:", tickLower.toString(), "tickUpper:", tickUpper.toString());
    const poolFee1 = await pool.fee();
    console.log("fee:", poolFee1.toString());
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

      console.log(
        "Sim success — router would not revert for these exact params."
      );
    } catch (err) {
      console.error("Sim reverted — full error:", err);
      // attempt to show revert data if present
      if (err && err.data) {
        console.error("revert data (hex):", err.data);
      }
    }

    // try {
    //   const sim = await ethers.provider.call({
    //     to: UNISWAP_V3_ROUTER,
    //     data: calldata,
    //     from: whale2.address,
    //     // value: 0 // only set value if swapping ETH
    //   });
    //   console.log("Sim returned (hex):", sim);

    //   console.log(
    //     "Sim success — router would not revert for these exact params."
    //   );
    // } catch (err) {
    //   console.error("Sim reverted — full error:", err);
    //   // attempt to show revert data if present
    //   if (err && err.data) {
    //     console.error("revert data (hex):", err.data);
    //   }
    // }

    // await mineBlocks(10);

  });
});
});
