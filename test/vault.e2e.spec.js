const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("Vault + Strategies Integration (Arbitrum fork)", function () {
  let deployer, user, treasury;
  let usdc, vault, fees, access, aaveStrat, uniStrat;
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

  const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
  const SWAPROUTER_V2 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";


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
    console.log("USDC contract at:", usdc.target); // ethers v6 uses .target instead of .address
    // const code = await ethers.provider.getCode(USDC_ADDRESS);
    // console.log("Deployed code at USDC:", code);

    console.log(
      "Whale USDC balance:",
      (await usdc.balanceOf(whale.address)).toString()
    );
    console.log("USDC:", usdc.target);
    console.log("Deployer:", deployer.address);
    console.log("treasury:", treasury.address);

    const v3pool = await ethers.getContractAt("IUniswapV3Pool", UNISWAP_POOL);
    console.log("pool token0", await v3pool.token0());
    console.log("pool token1", await v3pool.token1());
    console.log("pool fee", (await v3pool.fee()).toString());

    // Transfer 10,000 USDC from whale to deployer
    await usdc
      .connect(whale)
      .transfer(deployer.address, ethers.parseUnits("10000", 6));

    console.log(
      "Deployer USDC balance:",
      (await usdc.balanceOf(deployer.address)).toString()
    );

    const code = await ethers.provider.getCode(ETH_USD);
    console.log("Oracle code:", code !== "0x" ? "exists" : "empty!");

    const AAVE_POOL_code = await ethers.provider.getCode(AAVE_POOL);
    console.log(
      "AAVE_POOL code:",
      AAVE_POOL_code !== "0x" ? "exists" : "empty!"
    );

    const pool = new ethers.Contract(
      AAVE_POOL,
      [
        "function getReserveData(address) view returns (\
      uint256,uint128,uint128,uint128,uint128,uint128,uint40,uint16,\
      address,address,address,address,uint128,uint128,uint128)",
      ],
      ethers.provider
    );

    const rd = await pool.getReserveData(USDC_ADDRESS);
    console.log("id:", rd[7]); // 12 on Arbitrum
    console.log("aToken:", rd[8]); // 0x625E77... (aUSDC)
    console.log("stableDebt:", rd[9]);
    console.log("variableDebt:", rd[10]);

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

    console.log("Fee:", fees.target);

    const Access = await ethers.getContractFactory("AccessController");
    access = await Access.deploy(deployer.address);

    console.log("Access:", access.target);

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

    console.log("Vault:", vault.target);
    // --- Deploy Aave Strategy ---
    const AaveV3Strategy = await ethers.getContractFactory("AaveV3Strategy");
    aaveStrat = await AaveV3Strategy.deploy(
      vault.target,
      usdc.target,
      AAVE_POOL
    );

    console.log("aaveStrat:", aaveStrat.target);

    // --- Deploy ExchangeHandler ---
    const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
    exchanger = await ExchangeHandler.deploy(deployer.address);
    await exchanger.setRouter(SUSHI_ROUTER, true);

    console.log("exchanger:", exchanger.target);

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

    console.log("uniStrat:", uniStrat.target);

    // After deploying AccessController
    await access.setManager(deployer.address, true);

    // --- Add strategies (50/50) ---
    await vault.setStrategy(aaveStrat.target, 5000);
    await vault.setStrategy(uniStrat.target, 5000);
  });

  it("User can deposit, invest", async () => {

    const QuoterV2ABI = [
      "function quoteExactInputSingle((address,address,uint24,uint256,uint160)) external returns (uint256 amountOut)"
    ];
    const SwapRouterABI = [
      "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) external payable returns (uint256 amountOut)"
    ];
    
    const quoter = new ethers.Contract(QUOTER_V2, QuoterV2ABI, deployer);

    
    const depositAmount = ethers.parseUnits("1000", 6);
    console.log("depositAmount:", depositAmount.toString());
    // Approve Vault
    await usdc.approve(vault.target, depositAmount);

    // Deposit into Vault
    await vault.deposit(depositAmount, deployer.address);

    expect(await usdc.balanceOf(vault.target)).to.equal(depositAmount);

    const IUniswapV2Router = new ethers.Interface([
      "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) external returns (uint256[] memory)",
      "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory)",
    ]);

    function buildSwapDataV2({
      router,
      tokenIn,
      tokenOut,
      amountIn,
      minOut,
      to,
      deadline,
    }) {
      const routerCalldata = IUniswapV2Router.encodeFunctionData(
        "swapExactTokensForTokens",
        [amountIn, minOut, [tokenIn, tokenOut], to, deadline]
      );

      // pack for ExchangeHandler.swap(bytes)
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      return abiCoder.encode(
        [
          "address",
          "address",
          "address",
          "uint256",
          "uint256",
          "address",
          "bytes",
        ],
        [router, tokenIn, tokenOut, amountIn, minOut, to, routerCalldata]
      );
    }

    // 1) figure out how much Vault will send to the Uni strategy
    const toUni = depositAmount / 2n; // because targetBps[uni] = 5000
    const toUniHalf = toUni / 2n; // we’ll swap half of what the strategy receives

    // 2) build a single swap USDC -> WETH for 'toUniHalf' to the STRATEGY address
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const deadline = now + 1200; // 20 min


    const router1 = new ethers.Contract(SUSHI_ROUTER, IUniswapV2Router, deployer);
    const amountsOut = await router1.getAmountsOut(toUniHalf, [usdc.target, WETH]);
    console.log("Expected WETH out:", amountsOut[1].toString());
    const quote = await router1.getAmountsOut(toUniHalf, [usdc.target, WETH]);
    const minOut = (quote[1] * 95n) / 100n; // allow 5% slippage

    const uniSwapDataOne = buildSwapDataV2({
      router: SUSHI_ROUTER,
      tokenIn: usdc.target,
      tokenOut: WETH,
      amountIn: toUniHalf, // <- explicit half
       minOut, // for tests; tighten in production with a quote
      to: uniStrat.target, // proceeds go to the strategy
      deadline,
    });

    // 3) For Aave we don’t need swaps -> empty []
    //    For UniV3 we pass [uniSwapDataOne]
    const allSwapData = [
      [], // Aave
      [uniSwapDataOne], // UniV3
    ];

    // 4) Manager call (your test signer must be a manager in AccessController)
    await vault.investIdle(allSwapData);

    console.log("Vault idle:", (await usdc.balanceOf(vault.target)).toString());
    console.log("Aave aToken:", await aaveStrat.aToken()); // or reserveData check
    console.log(
      "Uniswap totalAssets:",
      (await uniStrat.totalAssets()).toString()
    );
    console.log(
      "Aave totalAssets:",
      (await aaveStrat.totalAssets()).toString()
    );


    // 5) Assertions – now UniV3 has USDC + WETH balances (no NO_FUNDS)
    expect(await uniStrat.totalAssets()).to.be.gt(0n);
    expect(await aaveStrat.totalAssets()).to.be.gt(0n);

    //Let any whale trade from WETH/USDC pool gor getting the fee

    // Use Uniswap v2-like router (Sushi) to trade USDC -> WETH in your pool
// const IUniswapV2Router = new ethers.Interface([
//   "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) external returns (uint256[] memory)"
// ]);

const whale = await ethers.getSigner(USDC_WHALE);

// Approve router
await usdc.connect(whale).approve(SUSHI_ROUTER, ethers.parseUnits("1000000", 6));
const IUniswapV2Router02 = new ethers.Interface([
  "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] calldata path,address to,uint256 deadline) external returns (uint256[] memory amounts)"
]);

const router = new ethers.Contract(SUSHI_ROUTER, IUniswapV2Router02, whale);


// Do a big swap to simulate whale trading in the pool
// const router = await ethers.getContractAt("IUniswapV2Router02", SUSHI_ROUTER);
await router.connect(whale).swapExactTokensForTokens(
  ethers.parseUnits("1000000", 6), // 1000k USDC
  0,                              // minOut
  [usdc.target, WETH],            // path
  whale.address,
  Math.floor(Date.now() / 1000) + 60 * 20
);



    const vaultIdle = await usdc.balanceOf(vault.target);
      const vaultTVL = await vault.totalAssets();

      console.log("vaultTVL (raw):", vaultTVL.toString());
console.log("vaultTVL (USDC):", ethers.formatUnits(vaultTVL, 6)); // USDC human-readable

    

console.log("Vault totalAssets (USDC):", ethers.formatUnits(await vault.totalAssets(), 6));
console.log("Aave strat assets:", ethers.formatUnits(await aaveStrat.totalAssets(), 6));
console.log("Uni strat assets:", ethers.formatUnits(await uniStrat.totalAssets(), 6));
console.log("Uni idle USDC:", ethers.formatUnits(await usdc.balanceOf(uniStrat.target), 6));
console.log("Uni WETH balance:", ethers.formatEther(await ethers.getContractAt("IERC20", WETH).then(c => c.balanceOf(uniStrat.target))));


      // Aave: aToken balance held by the strategy (interest accrues to aToken)
      // The Aave strategy exposes aToken() in your test earlier — if not, derive from getReserveData
      const aTokenAddr = await aaveStrat.aToken();
      const aToken = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aTokenAddr);
      const aTokenBal = await aToken.balanceOf(aaveStrat.target);
    
      // Uniswap: idle want in strategy + LP position owed fees
      const uniWantIdle = await usdc.balanceOf(uniStrat.target);
      // if Uniswap strategy exposes tokenId
      const tokenId = await uniStrat.tokenId();
      console.log("tokenId", tokenId.toString());
      let uniFees0 = 0n, uniFees1 = 0n;
      if (tokenId !== 0n) {
        const pm = await ethers.getContractAt("INonfungiblePositionManager", UNISWAP_POSITION_MANAGER);
        const pos = await pm.positions(tokenId);
        // tokensOwed0 is pos[10], tokensOwed1 is pos[11] (per your interface)
        uniFees0 = pos[10];
        uniFees1 = pos[11];
        console.log("uniFees0", uniFees0);
        console.log("uniFees1", uniFees1);
      }
    
      // Treasury balance snapshot (in want)
      const treasuryBal = await usdc.balanceOf(treasury.address);
    

  });
  it("User can harvest, and withdraw", async () => {
    // async function snapshotState() {
      console.log(
        "Aave totalAssets1:",
        (await aaveStrat.totalAssets()).toString()
      );
      const vaultIdle = await usdc.balanceOf(vault.target);
      const vaultTVL = await vault.totalAssets();
    
      // Aave: aToken balance held by the strategy (interest accrues to aToken)
      // The Aave strategy exposes aToken() in your test earlier — if not, derive from getReserveData
      const aTokenAddr = await aaveStrat.aToken();
      const aToken = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aTokenAddr);
      const aTokenBal = await aToken.balanceOf(aaveStrat.target);
    
      // Uniswap: idle want in strategy + LP position owed fees
      const uniWantIdle = await usdc.balanceOf(uniStrat.target);
      // if Uniswap strategy exposes tokenId
      const tokenId = await uniStrat.tokenId();
      console.log("tokenId", tokenId.toString());
      let uniFees0 = 0n, uniFees1 = 0n;
      if (tokenId !== 0n) {
        const pm = await ethers.getContractAt("INonfungiblePositionManager", UNISWAP_POSITION_MANAGER);
        const pos = await pm.positions(tokenId);
        // tokensOwed0 is pos[10], tokensOwed1 is pos[11] (per your interface)
        uniFees0 = pos[10];
        uniFees1 = pos[11];
        console.log("uniFees0", uniFees0);
        console.log("uniFees1", uniFees1);
      }
    
      // Treasury balance snapshot (in want)
      const treasuryBal = await usdc.balanceOf(treasury.address);
    
    //   return {
    //     vaultIdle,
    //     vaultTVL,
    //     aTokenAddr,
    //     aTokenBal,
    //     uniWantIdle,
    //     tokenId,
    //     uniFees0,
    //     uniFees1,
    //     treasuryBal
    //   };
    // }
    
  });
});
