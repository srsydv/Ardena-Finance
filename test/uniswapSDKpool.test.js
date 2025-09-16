const { expect } = require("chai");
const { ethers } = require("hardhat");
const { abi: IUniswapV3FactoryABI } = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
const { abi: IUniswapV3PoolABI } = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
const { abi: INonfungiblePositionManagerABI } = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");

describe("Vault + UniswapV3 Strategy E2E", function () {
    this.timeout(200_000);
  let weth, factory, positionManager, pool, mockUSDC, mockWETH;

  const FEE = 100; // 0.05%
//   const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"; // Arbitrum
  const USDC_ADDRESS = "0xaf88d065e77c8cc2239327c5edb3a432268e5831"; // Arbitrum

//   before(async () => {
//     [deployer, user] = await ethers.getSigners();

//     // Attach tokens
//     weth = await ethers.getContractAt("IERC20", WETH);
//     usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);

    

//     // Deploy Vault + Strategy (your contracts)
//     const Vault = await ethers.getContractFactory("Vault");
//     vault = await Vault.deploy(WETH); // assume want = WETH
//     await vault.waitForDeployment();

//     const UniV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
//     uniStrat = await UniV3Strategy.deploy(vault.target, positionManager.target, WETH, USDC_ADDRESS);
//     await uniStrat.waitForDeployment();

//     // Link uniStrat to vault
//     await vault.setStrategy(uniStrat.target);
//   });



  let deployer, user, treasury;
  let usdc, vault, fees, access, aaveStrat, uniStrat, mockRouter, ERC20, swapRouter;
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

    // usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS_ADDRESS);
    usdc = await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      USDC_ADDRESS_ADDRESS
    );
    // console.log("USDC_ADDRESS contract at:", usdc.target); // ethers v6 uses .target instead of .address
    // const code = await ethers.provider.getCode(USDC_ADDRESS_ADDRESS);
    // console.log("Deployed code at USDC_ADDRESS:", code);

   
    // console.log("USDC_ADDRESS:", usdc.target);
    // console.log("Deployer:", deployer.address);
    // console.log("treasury:", treasury.address);

    // const v3pool = await ethers.getContractAt("IUniswapV3Pool", UNISWAP_POOL);
    // console.log("pool token0", await v3pool.token0());
    // console.log("pool token1", await v3pool.token1());
    // console.log("pool fee", (await v3pool.fee()).toString());

    // Transfer 10,000 USDC_ADDRESS from whale to deployer
    await usdc
      .connect(whale)
      .transfer(deployer.address, ethers.parseUnits("10000", 6));

    // console.log(
    //   "Deployer USDC_ADDRESS balance:",
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

    // const rd = await pool.getReserveData(USDC_ADDRESS_ADDRESS);
    // console.log("id:", rd[7]); // 12 on Arbitrum
    // console.log("aToken:", rd[8]); // 0x625E77... (aUSDC_ADDRESS)
    // console.log("stableDebt:", rd[9]);
    // console.log("variableDebt:", rd[10]);

    // expect(await usdc.balanceOf(deployer.address)).to.equal(
    //   ethers.parseUnits("10000", 6)
    // );

    const Oracle = await ethers.getContractFactory("OracleModule");
    const oracle = await Oracle.deploy(WETH);

    // ETH/USD (needed for any token that uses token/ETH composition)
    await oracle.setEthUsd(ETH_USD, "864000");
    // Direct USD feeds
    await oracle.setTokenUsd(usdc.target, USDC_ADDRESS_USD, "864000");

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

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    // ERC20 = await mochERC20.deploy("SHRISH","SRS", 18);

     mockUSDC = await MockERC20.deploy("Mock USDC","mUSDC",6);
 mockWETH = await MockERC20.deploy("Mock WETH","mWETH",18);

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

    // --- Deploy Uniswap Strategy ---
    const UniswapV3Strategy = await ethers.getContractFactory(
      "UniswapV3Strategy"
    );
    uniStrat = await UniswapV3Strategy.deploy(
      vault.target,
      mockUSDC.target,
      UNISWAP_POSITION_MANAGER,
      UNISWAP_POOL,
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
      } = await deployContracts();
      expect(deployer).to.be.an("object");
      expect(user).to.be.an("object");
      expect(treasury).to.be.an("object");
    });


  it("should create pool if not exists, deposit, invest, and harvest fees", async () => {
    // 1. Create pool (if not exists)

// give uniStrat some ETH so it can pay gas
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
const sqrtPriceX96 = (1n << 96n).toString(); // price = 1 -> sqrt(price) * 2^96

// // Try a staticcall (simulate) to see if it gives a clearer revert or pass
// try {
//   await positionManager.createAndInitializePoolIfNecessary(
//     mockWETH.target,
//         mockUSDC.target,
//         500,
//         sqrtPriceX96.toString()
//   );
//   console.log("callStatic succeeded (would not revert)");
// } catch (err) {
//   console.error("callStatic error:", err.message, "err.data:", err.data ?? err);
// }

    if (poolAddress === ethers.ZeroAddress) {
      // compute sqrtPriceX96 for initial price: aim for 1 WETH == 1e12 USDC (accounting decimals)
      // Because USDC (6) and WETH (18) if price should be 1:1 in human terms, token1/token0 ratio
      // If we take token1 = WETH, token0 = USDC, set reserves accordingly:
      const reserve1 = BigInt("1000000000000000000"); // 1 WETH (18)
      const reserve0 = BigInt("10000000"); // 1 USDC (6)
    //   const sqrtPriceX96 = await encodePriceSqrtJS(reserve1, reserve0);
      const sqrtPriceX96 = (1n << 96n).toString(); // price = 1 -> sqrt(price) * 2^96

      // create and initialize pool
      await positionManager.connect(deployer).createAndInitializePoolIfNecessary(
        mockWETH.target,
        mockUSDC.target,
        500,
        sqrtPriceX96.toString()
      );

      poolAddress = await factory.getPool(mockWETH.target, mockUSDC.target, 500);
      console.log("created pool:", poolAddress);
    } else {
      console.log("pool existed already at", poolAddress);
    }




    pool = await ethers.getContractAt(IUniswapV3PoolABI, poolAddress);
    console.log("Pool created at:", poolAddress);

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

                  mockWETH.mint(whaleW.address, ethers.parseEther("10"));
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
    const depositAmount = ethers.parseUnits("100", 6);
    console.log("depositAmount:", depositAmount);
    await mockUSDC.connect(user).approve(vault.target, depositAmount);
    console.log("approved");
    await vault.connect(user).deposit(depositAmount, user.address);
    console.log("Vault balance after deposit:", (await vault.totalAssets()).toString());

    // 4. Invest idle (uniStrat provides liquidity)
    await vault.investIdle();
    console.log("Invested into UniswapV3");

    // // Simulate trades for fees (swap USDC_ADDRESS→WETH repeatedly)
    // await usdc.connect(user).approve(positionManager.target, ethers.MaxUint256);
    // // You can also use a UniswapV3 router to make swaps and move price

    // // 5. Harvest fees
    // const beforeBal = await weth.balanceOf(vault.target);
    // await vault.harvestAll([]);
    // const afterBal = await weth.balanceOf(vault.target);

    // console.log("Profit from harvest:", afterBal - beforeBal);
    // expect(afterBal).to.be.gte(beforeBal);
  });
});
});
