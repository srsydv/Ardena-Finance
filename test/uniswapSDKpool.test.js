
const { abi: IUniswapV3FactoryABI } = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
const { abi: IUniswapV3PoolABI } = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
const { abi: INonfungiblePositionManagerABI } = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const fetch = require("node-fetch");
const axios = require("axios");
require("dotenv").config();
describe("Vault + UniswapV3 Strategy E2E", function () {
    this.timeout(200_000);
  let weth, factory, positionManager, pool, mockUSDC, uniStrat, mockWETH;

  const FEE = 100; // 0.05%
//   const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"; // Arbitrum
  const USDC_ADDRESS = "0xaf88d065e77c8cc2239327c5edb3a432268e5831"; // Arbitrum

  let deployer, user, treasury;
  let usdc, vault, fees, access, aaveStrat, mockRouter, ERC20, swapRouter;
  const USDC_ADDRESS_WHALE = "0x463f5D63e5a5EDB8615b0e485A090a18Aba08578";
  const USDC_ADDRESS_WHALE_TWO = "0xace659DC614D5fC455D123A1c3E438Dd78A05e77"; // big USDC_ADDRESS holder on Arbitrum
  const USDC_ADDRESS_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC_ADDRESS
  const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
  const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"; // Aave V3 pool
  const A_USDC_ADDRESS = "0x625E7708f30cA75bfd92586e17077590C60eb4cD"; // Aave interest-bearing USDC_ADDRESS
  const UNISWAP_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const UNISWAP_POOL = "0xC6962004f452bE9203591991D15f6b388e09E8D0"; // USDC_ADDRESS/WETH pool
  // const CHAINLINK = "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3";

  // Chainlink feeds (verify on chainlink docs)
  const ETH_USD = "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612"; // ETH/USD
  const USDC_ADDRESS_USD = "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3";
  const USD_ETH = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"; // USDC_ADDRESS/USD
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
    // Uniswap contracts
    factory = await ethers.getContractAt(
        IUniswapV3FactoryABI,
        "0x1F98431c8aD98523631AE4a59f267346ea31F984" // UniswapV3Factory
      );
      positionManager = await ethers.getContractAt(
        INonfungiblePositionManagerABI,
        "0xC36442b4a4522E871399CD717aBDD847Ab11FE88" // NonfungiblePositionManager
      );

      const artifact = require("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
       swapRouter = await ethers.getContractAt(
        artifact.abi,
        "0xE592427A0AEce92De3Edee1F18E0157C05861564"
      );

    // --- Impersonate whale ---
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [USDC_ADDRESS_WHALE],
    });
    const whale = await ethers.getSigner(USDC_ADDRESS_WHALE);

    // Give whale some ETH for gas
    await network.provider.send("hardhat_setBalance", [
      whale.address,
      "0x1000000000000000000", // 1 ETH
    ]);

    const MockERC20 = await ethers.getContractFactory("MockERC20");

     mockUSDC = await MockERC20.deploy("Mock USDC","mUSDC",6);
 mockWETH = await MockERC20.deploy("Mock WETH","mWETH",18);

    const Oracle = await ethers.getContractFactory("OracleModule");
    const oracle = await Oracle.deploy(mockUSDC.target);

    // ETH/USD (needed for any token that uses token/ETH composition)
    await oracle.setEthUsd(ETH_USD, "864000");
    // Direct USD feeds
    // await oracle.setTokenUsd(usdc.target, USDC_ADDRESS_USD, "864000");

    // (Optional) composition route example for a token without USD feed:
    // await oracle.setTokenEthRoute(TOKEN, UNI_ETH, /*invert=*/false, heartbeat);

    // --- Deploy FeeModule + AccessController ---
    const FeeModule = await ethers.getContractFactory("FeeModule");
    fees = await FeeModule.deploy(
      mockUSDC.target,
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
        mockUSDC.target,
      "My Vault",
      "MVLT",
      access.target,
      fees.target,
      mockUSDC.target, // oracle (set to zero for now)
      ethers.parseUnits("100000000", 6), // deposit cap
      6 // decimals
    );

    // console.log("Vault:", vault.target);
    // --- Deploy Aave Strategy ---
    const AaveV3Strategy = await ethers.getContractFactory("AaveV3Strategy");
    aaveStrat = await AaveV3Strategy.deploy(
      vault.target,
      mockUSDC.target,
      AAVE_POOL
    );

    // console.log("aaveStrat:", aaveStrat.target);

    // --- Deploy ExchangeHandler ---
    const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
    exchanger = await ExchangeHandler.deploy(deployer.address);
    await exchanger.setRouter(SUSHI_ROUTER, true);

    // console.log("exchanger:", exchanger.target);




await network.provider.request({
  method: "hardhat_setBalance",
  params: [deployer.address, "0x8AC7230489E80000"], // 1 ETH in hex (wei)
});

let poolAddress = await factory.getPool(mockWETH.target, mockUSDC.target, 500);
console.log("existing pool for fee", 500, ":", poolAddress);

// inspect factory & positionManager code
const factoryCode = await ethers.provider.getCode(factory.target || factory.address);
console.log("factory code length:", factoryCode === "0x" ? 0 : factoryCode.length);

const pmCode = await ethers.provider.getCode(positionManager.target || positionManager.address);
console.log("positionManager code length:", pmCode === "0x" ? 0 : pmCode.length);

// BigInt integer sqrt (Newton)
function sqrtBigInt(n) {
  if (n <= 1n) return n;
  let x0 = n, x1 = (n >> 1n) + 1n;
  while (x1 < x0) { x0 = x1; x1 = (x1 + n / x1) >> 1n; }
  return x0;
}

// encode sqrt(price) * 2^96 from token1/token0 amounts (in smallest units)
function encodeSqrtPriceX96ByAmounts(amount1, amount0) {
  // sqrtPriceX96 = floor( sqrt((amount1 << 192) / amount0) )
  const ratio = (amount1 << 192n) / amount0;
  return sqrtBigInt(ratio);
}


if (poolAddress === ethers.ZeroAddress) {

  // sort tokens by address for Uniswap
const [t0, t1] =
mockUSDC.target.toLowerCase() < mockWETH.target.toLowerCase()
  ? [mockUSDC.target, mockWETH.target]
  : [mockWETH.target, mockUSDC.target];

// Target: 1 WETH = 4000 USDC
let amount0, amount1;
if (t0 === mockUSDC.target) {
// token0 = USDC(6), token1 = WETH(18)
amount0 = ethers.parseUnits("100", 6);  // token0 amount (USDC)
amount1 = ethers.parseUnits("1", 18);    // token1 amount (WETH)
} else {
// token0 = WETH(18), token1 = USDC(6)
amount0 = ethers.parseUnits("1", 18);    // token0 amount (WETH)
amount1 = ethers.parseUnits("100", 6);  // token1 amount (USDC)
}

const sqrtPriceX96 = encodeSqrtPriceX96ByAmounts(amount1, amount0).toString();

const tx = await positionManager.connect(deployer).createAndInitializePoolIfNecessary(
t0,
t1,
500,                     // fee tier
sqrtPriceX96
);

await tx.wait();
//   const [t0, t1] =
//   mockUSDC.target.toLowerCase() < mockWETH.target.toLowerCase()
//     ? [mockUSDC.target, mockWETH.target]
//     : [mockWETH.target, mockUSDC.target];

// // If token0=USDC(6), token1=WETH(18): price = 1e12 → sqrt = 1e6
// const sqrtPriceX96 =
//   t0 === mockUSDC.target && t1 === mockWETH.target
//     ? (1000000n << 96n).toString()
//     : ((1n << 96n) / 1000000n).toString();
// // create and initialize pool
// await positionManager.connect(deployer).createAndInitializePoolIfNecessary(
//   mockUSDC.target,
//   mockWETH.target,
//   500,
//   sqrtPriceX96.toString()
// );

poolAddress = await factory.getPool(mockUSDC.target, mockWETH.target, 500);
console.log("created pool:", poolAddress);
} else {
console.log("pool existed already at", poolAddress);
}




pool = await ethers.getContractAt(IUniswapV3PoolABI, poolAddress);
console.log("Pool created at:", poolAddress);

    // --- Deploy Uniswap Strategy ---
    const UniswapV3Strategy = await ethers.getContractFactory(
      "UniswapV3Strategy"
    );
    uniStrat = await UniswapV3Strategy.deploy(
      vault.target,
      mockUSDC.target,
      UNISWAP_POSITION_MANAGER,
      poolAddress,
      exchanger.target, // dummy exchanger (not used in test)
      oracle.target // dummy oracle
    );

    // console.log("uniStrat:", uniStrat.target);

    // After deploying AccessController
    await access.setManager(deployer.address, true);
    await access.setKeeper(deployer.address, true);

    // --- Add strategies (50/50) ---
    // await vault.setStrategy(aaveStrat.target, 5000);
    await vault.setStrategy(uniStrat.target, 10000);

    return {
      deployer,
      user,
      treasury,
      usdc,
      vault,
      fees,
      access,
      aaveStrat,
      uniStrat,
      exchanger,
      mockRouter,
      mockWETH,
      mockUSDC,
      poolAddress,
    };
  }

  describe("Deployment", function () {
    it("should deploy contracts", async () => {
      this.timeout(300_000);
      const {
        deployer,
        user,
        treasury,
        usdc,
        vault,
        fees,
        access,
        aaveStrat,
        uniStrat,
        exchanger,
        mockRouter,
        mockWETH,
      mockUSDC,
      poolAddress,
      } = await deployContracts();
      expect(deployer).to.be.an("object");
      expect(user).to.be.an("object");
      expect(treasury).to.be.an("object");
    });

    console.log("uniStrat.target2:", uniStrat);
  it("should create pool if not exists, deposit, invest, and harvest fees", async () => {
  
      poolAddress = await factory.getPool(mockWETH.target, mockUSDC.target, 500);





    pool = await ethers.getContractAt(IUniswapV3PoolABI, poolAddress);
//     console.log("Pool created at:", poolAddress);



const tick = Number((await pool.slot0()).tick);
const spacing = Number(await pool.tickSpacing());
const lower = Math.floor(tick / spacing - 100) * spacing;
const upper = Math.floor(tick / spacing + 100) * spacing;


// fund deployer
await mockUSDC.mint(deployer.address, ethers.parseUnits("500000", 6));
await mockWETH.mint(deployer.address, ethers.parseEther("100"));

// approve PM
await mockUSDC.connect(deployer).approve(positionManager.target, ethers.parseUnits("500000", 6));
await mockWETH.connect(deployer).approve(positionManager.target, ethers.parseEther("100"));

// mint initial liquidity to the pool
await (await positionManager.connect(deployer).mint({
  token0: await pool.token0(),
  token1: await pool.token1(),
  fee: await pool.fee(),
  tickLower: lower,
  tickUpper: upper,
  amount0Desired: ethers.parseUnits("4000", 6),
  amount1Desired: ethers.parseEther("40"),
  amount0Min: 0,
  amount1Min: 0,
  recipient: deployer.address,
  deadline: (await ethers.provider.getBlock("latest")).timestamp + 1200
})).wait();

// now your ExchangeHandler swap via UNISWAP_V3_ROUTER will succeed

    // 2. Fund user with WETH & USDC_ADDRESS
    // Impersonate whale on fork

    
    const whaleW = await ethers.getSigner(mockWETH.target);
    const whaleU = await ethers.getSigner(mockUSDC.target);

    const weth = await ethers.getContractAt(
                "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
                mockWETH.target
              );
              usdc = await ethers.getContractAt(
              "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
                    mockUSDC.target
                  );

                  mockWETH.mint(whaleW.address, ethers.parseEther("100"));
                  mockUSDC.mint(whaleU.address, ethers.parseUnits("100000000", 6));

                  mockUSDC.mint(user.address, ethers.parseUnits("100000000", 6));

                  const amountWETH = ethers.parseEther("0.01"); // very small
    const amountUSDC = ethers.parseUnits("10", 6); // small amount


       // Make sure deployer has balances (impersonate or transfer from whales)
    // Example: transfer from a known WETH whale (impersonation)
    // await network.provider.request({ method: "hardhat_impersonateAccount", params: [WETH_WHALE] })
    // const whaleSigner = await ethers.getSigner(WETH_WHALE)
    // await weth.connect(whaleSigner).transfer(deployer.address, amountWETH)


    // 3. User deposits WETH into vault
    const depositAmount = ethers.parseUnits("200", 6);
    console.log("depositAmount:", depositAmount);
    await mockUSDC.connect(user).approve(vault.target, depositAmount);
    console.log("approved");
    await vault.connect(user).deposit(depositAmount, user.address);
    console.log("Vault balance after deposit:", (await vault.totalAssets()).toString());

    // 4. Invest idle (uniStrat provides liquidity)

    // After deposit, before investIdle
const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const poolFee = 500; // your pool fee tier

// Amount vault will send to the uni strategy (targetBps=10000 → all idle)
const toSend = depositAmount; // or: const toSend = await usdc.balanceOf(vault.target);
const amountIn = toSend / 2n; // swap half to WETH

// Encode exactInputSingle(params) for SwapRouter
const artifact = require("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
const iface = new ethers.Interface(artifact.abi);
const deadline = (await ethers.provider.getBlock("latest")).timestamp + 1200;
console.log("uniStrat.target:", uniStrat.target);
// const uniStratAddr = await vault.strategies(0);
// console.log("uniStratAddr:", uniStratAddr);
const params = {
  tokenIn: mockUSDC.target,
  tokenOut: mockWETH.target,
  fee: poolFee,
  recipient: uniStrat.target,          // deliver WETH to the strategy
  deadline,
  amountIn,
  amountOutMinimum: 0n,                // for tests; in prod use a quoted minOut
  sqrtPriceLimitX96: 0n
};

const routerCalldata = iface.encodeFunctionData("exactInputSingle", [params]);

// Pack payload for ExchangeHandler.swap(bytes)
// abi.encode(address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to, bytes routerCalldata)
const payload = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address","address","address","uint256","uint256","address","bytes"],
  [UNISWAP_V3_ROUTER, mockUSDC.target, mockWETH.target, amountIn, 0, uniStrat.target, routerCalldata]
);

// Allow the router in ExchangeHandler and call investIdle
await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
console.log("exchanger:", exchanger.target);

try {
  await vault.connect(deployer).investIdle([[payload]]);
} catch (error) {
  console.log("error:", error);
}
 // one strategy → one inner array
    // await vault.investIdle();
    console.log("Invested into UniswapV3");
    const t0Bal = await (await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", mockUSDC.target)).balanceOf(uniStrat.target);
const t1Bal = await (await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", mockWETH.target)).balanceOf(uniStrat.target);
console.log("strategy t0,t1:", t0Bal.toString(), t1Bal.toString()); // should both be >0 (or at least one >0)

  });
  it("should whale trade in same pool", async () => {
    this.timeout(200_000);
  
    // Get the pool for your mocks (created earlier via positionManager)
    const poolAddress = await factory.getPool(mockWETH.target, mockUSDC.target, 500);
    expect(poolAddress).to.not.equal(ethers.ZeroAddress);
  
    // Fund a whale (use user as whale for simplicity)
    await mockUSDC.mint(user.address, ethers.parseUnits("50000", 6));
    await mockWETH.mint(user.address, ethers.parseEther("50"));
  
    // Approve router
    const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const artifact = require("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
    const swapRouter = await ethers.getContractAt(artifact.abi, UNISWAP_V3_ROUTER);
  
    // USDC -> WETH trade
    const usdcIn = ethers.parseUnits("2000", 6);
    await mockUSDC.connect(user).approve(swapRouter.target, usdcIn);
    const deadline1 = (await ethers.provider.getBlock("latest")).timestamp + 1200;
  
    await swapRouter.connect(user).exactInputSingle({
      tokenIn: mockUSDC.target,
      tokenOut: mockWETH.target,
      fee: 500,
      recipient: user.address,
      deadline: deadline1,
      amountIn: usdcIn,
      amountOutMinimum: 0n,       // for tests only; use quoted minOut in prod
      sqrtPriceLimitX96: 0n
    });
  
    // WETH -> USDC back trade
    const wethBal = await mockWETH.balanceOf(user.address);
    const wethIn = wethBal / 3n;  // trade part of balance
    await mockWETH.connect(user).approve(swapRouter.target, wethIn);
    const deadline2 = (await ethers.provider.getBlock("latest")).timestamp + 1200;
  
    await swapRouter.connect(user).exactInputSingle({
      tokenIn: mockWETH.target,
      tokenOut: mockUSDC.target,
      fee: 500,
      recipient: user.address,
      deadline: deadline2,
      amountIn: wethIn,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n
    });
  
    // Optional: show pool state after trades
    const IUniswapV3PoolABI = [
      "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
      "function liquidity() view returns (uint128)"
    ];
    const pool = await ethers.getContractAt(IUniswapV3PoolABI, poolAddress);
    const s0 = await pool.slot0();
    console.log("tick after trades:", s0[1].toString(), "liquidity:", (await pool.liquidity()).toString());
  });

  
});
});
