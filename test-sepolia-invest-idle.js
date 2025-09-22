const {
  abi: IUniswapV3FactoryABI,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
const {
  abi: IUniswapV3PoolABI,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
const {
  abi: INonfungiblePositionManagerABI,
} = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");
const { expect } = require("chai");
const { ethers, network, upgrades } = require("hardhat");
require("dotenv").config();

describe("Sepolia InvestIdle Test", function () {
  this.timeout(200_000);
  
  // Sepolia addresses
  const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
  const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
  const DEPLOYER_ADDRESS = "0xf69F75EB0c72171AfF58D79973819B6A3038f39f";
  
  // Uniswap V3 addresses (same on Sepolia)
  const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const UNISWAP_POSITION_MANAGER = "0x1238536071e1c677a632429e3655c799b22cda52";
  const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
  
  const FEE = 500; // 0.05%
  
  let deployer, user, treasury;
  let usdc, weth, vault, fees, access, uniStrat, exchanger, pool, positionManager, factory;
  let mockUSDC, mockWETH; // We'll use real tokens but create mocks for testing

  async function deployContracts() {
    // Get signers
    [deployer, user, treasury] = await ethers.getSigners();
    
    console.log("Deployer address:", deployer.address);
    console.log("Expected deployer:", DEPLOYER_ADDRESS);
    console.log("Addresses match:", deployer.address.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase());
    
    // Use real Sepolia tokens
    usdc = await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      USDC_ADDRESS
    );
    weth = await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      WETH_ADDRESS
    );
    
    // Uniswap contracts
    factory = await ethers.getContractAt(
      IUniswapV3FactoryABI,
      UNISWAP_V3_FACTORY
    );
    positionManager = await ethers.getContractAt(
      INonfungiblePositionManagerABI,
      UNISWAP_POSITION_MANAGER
    );
    
    // Create mock tokens for testing (since we can't mint real USDC/WETH)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    mockWETH = await MockERC20.deploy("Mock WETH", "mWETH", 18);
    
    // Deploy Oracle
    const Oracle = await ethers.getContractFactory("OracleModule");
    const oracle = await upgrades.deployProxy(Oracle, [mockWETH.target], {
      kind: "uups",
      initializer: "initialize",
    });
    await oracle.waitForDeployment();
    
    // Deploy FeeModule
    const FeeModule = await ethers.getContractFactory("FeeModule");
    fees = await upgrades.deployProxy(
      FeeModule,
      [mockUSDC.target, treasury.address, deployer.address],
      { kind: "uups", initializer: "initialize" }
    );
    await fees.waitForDeployment();
    
    // Deploy AccessController
    const Access = await ethers.getContractFactory("AccessController");
    access = await upgrades.deployProxy(Access, [deployer.address], {
      kind: "uups",
      initializer: "initialize",
    });
    await access.waitForDeployment();
    
    // Deploy Vault
    const Vault = await ethers.getContractFactory("Vault");
    vault = await upgrades.deployProxy(
      Vault,
      [
        mockUSDC.target, // Use mock USDC for testing
        "Test Vault",
        "TVLT",
        access.target,
        fees.target,
        ethers.parseUnits("100000000", 6), // deposit cap
        6, // decimals
      ],
      { kind: "uups", initializer: "initialize" }
    );
    
    // Deploy ExchangeHandler
    const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
    exchanger = await upgrades.deployProxy(
      ExchangeHandler,
      [deployer.address],
      { kind: "uups", initializer: "initialize" }
    );
    await exchanger.waitForDeployment();
    
    // Set up Uniswap V3 router
    await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
    
    // Create or get existing pool
    let poolAddress = await factory.getPool(
      mockWETH.target,
      mockUSDC.target,
      FEE
    );
    
    console.log("Existing pool for fee", FEE, ":", poolAddress);
    
    // If pool doesn't exist, create it
    if (poolAddress === ethers.ZeroAddress) {
      console.log("Creating new pool...");
      
      // Sort tokens by address for Uniswap
      const [t0, t1] =
        mockUSDC.target.toLowerCase() < mockWETH.target.toLowerCase()
          ? [mockUSDC.target, mockWETH.target]
          : [mockWETH.target, mockUSDC.target];
      
      // Target: 1 WETH = 100 USDC (as per your requirement)
      let amount0, amount1;
      if (t0 === mockUSDC.target) {
        // token0 = USDC(6), token1 = WETH(18)
        amount0 = ethers.parseUnits("100", 6); // token0 amount (USDC)
        amount1 = ethers.parseUnits("1", 18); // token1 amount (WETH)
      } else {
        // token0 = WETH(18), token1 = USDC(6)
        amount0 = ethers.parseUnits("1", 18); // token0 amount (WETH)
        amount1 = ethers.parseUnits("100", 6); // token1 amount (USDC)
      }
      
      // Calculate sqrtPriceX96
      const sqrtPriceX96 = calculateSqrtPriceX96(amount1, amount0);
      
      const tx = await positionManager
        .connect(deployer)
        .createAndInitializePoolIfNecessary(
          t0,
          t1,
          FEE,
          sqrtPriceX96.toString()
        );
      
      await tx.wait();
      
      poolAddress = await factory.getPool(
        mockUSDC.target,
        mockWETH.target,
        FEE
      );
      console.log("Created pool:", poolAddress);
      
      // Verify pool was created
      if (poolAddress === ethers.ZeroAddress) {
        throw new Error("Failed to create pool");
      }
    } else {
      console.log("Pool existed already at", poolAddress);
    }
    
    pool = await ethers.getContractAt(IUniswapV3PoolABI, poolAddress);
    console.log("Pool created at:", poolAddress);
    
    // Deploy MathAdapter
    const F = await ethers.getContractFactory("UniswapV3MathAdapter");
    const math = await F.deploy();
    await math.waitForDeployment();
    console.log("MathAdapter:", math.target);
    
    // Deploy Uniswap Strategy
    const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
    
    uniStrat = await upgrades.deployProxy(
      UniswapV3Strategy,
      [
        vault.target,
        mockUSDC.target,
        UNISWAP_POSITION_MANAGER,
        poolAddress,
        exchanger.target,
        oracle.target,
        math.target,
      ],
      { kind: "uups", initializer: "initialize" }
    );
    
    // Set up roles
    await access.setManager(deployer.address, true);
    await access.setKeeper(deployer.address, true);
    
    // Add strategy (100% allocation)
    await vault.setStrategy(uniStrat.target, 10000);
    
    return {
      deployer,
      user,
      treasury,
      vault,
      fees,
      access,
      uniStrat,
      exchanger,
      mockWETH,
      mockUSDC,
      poolAddress,
      pool,
      positionManager,
      factory,
    };
  }
  
  // Helper function to calculate sqrtPriceX96
  function calculateSqrtPriceX96(amount1, amount0) {
    // sqrtPriceX96 = floor(sqrt((amount1 << 192) / amount0))
    const ratio = (amount1 << 192n) / amount0;
    return sqrtBigInt(ratio);
  }
  
  // BigInt integer sqrt (Newton)
  function sqrtBigInt(n) {
    if (n <= 1n) return n;
    let x0 = n,
      x1 = (n >> 1n) + 1n;
    while (x1 < x0) {
      x0 = x1;
      x1 = (x1 + n / x1) >> 1n;
    }
    return x0;
  }

  describe("Sepolia InvestIdle Test", function () {
    it("should test investIdle with Sepolia addresses", async () => {
      this.timeout(300_000);
      
      const {
        deployer,
        user,
        vault,
        access,
        uniStrat,
        exchanger,
        mockWETH,
        mockUSDC,
        poolAddress,
        pool,
        positionManager,
      } = await deployContracts();
      
      console.log("\n=== TESTING INVEST IDLE WITH SEPOLIA ADDRESSES ===");
      
      // Fund deployer with mock tokens
      await mockUSDC.mint(deployer.address, ethers.parseUnits("500000", 6));
      await mockWETH.mint(deployer.address, ethers.parseEther("100"));
      
      // Approve position manager
      await mockUSDC
        .connect(deployer)
        .approve(positionManager.target, ethers.parseUnits("500000", 6));
      await mockWETH
        .connect(deployer)
        .approve(positionManager.target, ethers.parseEther("100"));
      
      // Get pool info
      const tick = Number((await pool.slot0()).tick);
      const spacing = Number(await pool.tickSpacing());
      const lower = Math.floor(tick / spacing - 100) * spacing;
      const upper = Math.floor(tick / spacing + 100) * spacing;
      
      console.log("Pool info:");
      console.log("- token0:", await pool.token0());
      console.log("- token1:", await pool.token1());
      console.log("- mockUSDC:", mockUSDC.target);
      console.log("- mockWETH:", mockWETH.target);
      console.log("- fee:", await pool.fee());
      console.log("- spacing:", spacing);
      console.log("- tick:", tick);
      console.log("- tickLower:", lower);
      console.log("- tickUpper:", upper);
      
      // Mint initial liquidity to the pool
      await (
        await positionManager.connect(deployer).mint({
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
          deadline: (await ethers.provider.getBlock("latest")).timestamp + 1200,
        })
      ).wait();
      
      console.log("Initial liquidity added to pool");
      
      // Fund user with mock USDC
      await mockUSDC.mint(user.address, ethers.parseUnits("100000000", 6));
      
      // User deposits into vault
      const depositAmount = ethers.parseUnits("200", 6);
      console.log("Deposit amount:", ethers.formatUnits(depositAmount, 6), "USDC");
      
      await mockUSDC.connect(user).approve(vault.target, depositAmount);
      await vault.connect(user).deposit(depositAmount, user.address);
      
      console.log("Vault balance after deposit:", ethers.formatUnits(await vault.totalAssets(), 6), "USDC");
      
      // Test investIdle
      console.log("\n=== TESTING INVEST IDLE ===");
      
      // Amount vault will send to the uni strategy (targetBps=10000 → all idle)
      const toSend = depositAmount;
      const amountIn = toSend / 2n; // swap half to WETH
      
      console.log("Amount to send to strategy:", ethers.formatUnits(toSend, 6), "USDC");
      console.log("Amount to swap (USDC -> WETH):", ethers.formatUnits(amountIn, 6), "USDC");
      
      // Create Uniswap V3 swap payload
      const artifact = require("@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json");
      const iface = new ethers.Interface(artifact.abi);
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 1200;
      
      const params = {
        tokenIn: mockUSDC.target,
        tokenOut: mockWETH.target,
        fee: FEE,
        recipient: uniStrat.target, // deliver WETH to the strategy
        deadline,
        amountIn,
        amountOutMinimum: 0n, // for tests; in prod use a quoted minOut
        sqrtPriceLimitX96: 0n,
      };
      
      const routerCalldata = iface.encodeFunctionData("exactInputSingle", [params]);
      
      // Pack payload for ExchangeHandler.swap(bytes)
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
          mockUSDC.target,
          mockWETH.target,
          amountIn,
          0,
          uniStrat.target,
          routerCalldata,
        ]
      );
      
      console.log("Payload created, length:", payload.length);
      
      // Ensure router is allowed
      await exchanger.setRouter(UNISWAP_V3_ROUTER, true);
      console.log("Router set in exchanger");
      
      // Call investIdle
      try {
        console.log("Calling investIdle...");
        await vault.connect(deployer).investIdle([[payload]]);
        console.log("✅ investIdle succeeded!");
        
        // Check strategy balances
        const t0Bal = await mockUSDC.balanceOf(uniStrat.target);
        const t1Bal = await mockWETH.balanceOf(uniStrat.target);
        console.log("Strategy balances after investIdle:");
        console.log("- USDC:", ethers.formatUnits(t0Bal, 6), "USDC");
        console.log("- WETH:", ethers.formatUnits(t1Bal, 18), "WETH");
        
        // Check if strategy has a position
        const tokenId = await uniStrat.tokenId();
        console.log("Strategy token ID:", tokenId.toString());
        
        if (tokenId > 0) {
          console.log("✅ Strategy successfully created Uniswap V3 position!");
        } else {
          console.log("❌ Strategy did not create a position");
        }
        
      } catch (error) {
        console.error("❌ investIdle failed:", error.message);
        
        if (error.reason) {
          console.log("Error reason:", error.reason);
        }
        
        if (error.data) {
          console.log("Error data:", error.data);
        }
        
        // Re-throw to fail the test
        throw error;
      }
      
      console.log("\n=== TEST COMPLETED ===");
    });
  });
});
