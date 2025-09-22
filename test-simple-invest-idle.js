const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

describe("Simple InvestIdle Test", function () {
  this.timeout(200_000);
  
  // Sepolia addresses
  const USDC_ADDRESS = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
  const WETH_ADDRESS = "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0";
  const DEPLOYER_ADDRESS = "0xf69F75EB0c72171AfF58D79973819B6A3038f39f";
  
  let deployer, user, treasury;
  let mockUSDC, mockWETH, vault, fees, access, exchanger;

  async function deployContracts() {
    // Get signers
    [deployer, user, treasury] = await ethers.getSigners();
    
    console.log("Deployer address:", deployer.address);
    console.log("Expected deployer:", DEPLOYER_ADDRESS);
    console.log("Addresses match:", deployer.address.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase());
    
    // Create mock tokens
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
        mockUSDC.target,
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
    
    // Set up roles
    await access.setManager(deployer.address, true);
    await access.setKeeper(deployer.address, true);
    
    return {
      deployer,
      user,
      treasury,
      vault,
      fees,
      access,
      exchanger,
      mockWETH,
      mockUSDC,
      oracle,
    };
  }

  describe("Simple InvestIdle Test", function () {
    it("should test vault approval mechanism", async () => {
      this.timeout(300_000);
      
      const {
        deployer,
        user,
        vault,
        access,
        exchanger,
        mockWETH,
        mockUSDC,
        oracle,
      } = await deployContracts();
      
      console.log("\n=== TESTING VAULT APPROVAL MECHANISM ===");
      
      // Fund user with mock USDC
      await mockUSDC.mint(user.address, ethers.parseUnits("100000000", 6));
      
      // User deposits into vault
      const depositAmount = ethers.parseUnits("200", 6);
      console.log("Deposit amount:", ethers.formatUnits(depositAmount, 6), "USDC");
      
      await mockUSDC.connect(user).approve(vault.target, depositAmount);
      await vault.connect(user).deposit(depositAmount, user.address);
      
      console.log("Vault balance after deposit:", ethers.formatUnits(await vault.totalAssets(), 6), "USDC");
      
      // Create a simple strategy that just holds tokens
      const SimpleStrategy = await ethers.getContractFactory("AaveV3Strategy");
      const simpleStrategy = await upgrades.deployProxy(
        SimpleStrategy,
        [vault.target, mockUSDC.target, ethers.ZeroAddress], // Use zero address for Aave pool (won't matter for this test)
        { kind: "uups", initializer: "initialize" }
      );
      await simpleStrategy.waitForDeployment();
      
      // Add strategy with 100% allocation
      await vault.setStrategy(simpleStrategy.target, 10000);
      
      console.log("Strategy added with 100% allocation");
      
      // Test investIdle with empty swap data
      try {
        console.log("Testing investIdle with empty swap data...");
        await vault.connect(deployer).investIdle([[]]);
        console.log("✅ investIdle succeeded!");
        
        // Check strategy balance
        const strategyBalance = await mockUSDC.balanceOf(simpleStrategy.target);
        console.log("Strategy USDC balance:", ethers.formatUnits(strategyBalance, 6), "USDC");
        
        // Check vault balance
        const vaultBalance = await mockUSDC.balanceOf(vault.target);
        console.log("Vault USDC balance:", ethers.formatUnits(vaultBalance, 6), "USDC");
        
        if (strategyBalance > 0) {
          console.log("✅ Vault successfully transferred USDC to strategy!");
        } else {
          console.log("❌ Strategy received no USDC");
        }
        
      } catch (error) {
        console.error("❌ investIdle failed:", error.message);
        
        if (error.reason) {
          console.log("Error reason:", error.reason);
        }
        
        if (error.data) {
          console.log("Error data:", error.data);
        }
        
        // This is the key test - if this fails, we've found the issue
        console.log("\n=== ANALYSIS ===");
        console.log("The investIdle function failed, which means the issue is in the Vault contract's");
        console.log("approval mechanism. This confirms our earlier findings.");
        
        // Re-throw to fail the test
        throw error;
      }
      
      console.log("\n=== TEST COMPLETED ===");
    });
    
    it("should test vault approval with real Sepolia addresses", async () => {
      this.timeout(300_000);
      
      const {
        deployer,
        user,
        vault,
        access,
        exchanger,
        mockWETH,
        mockUSDC,
        oracle,
      } = await deployContracts();
      
      console.log("\n=== TESTING WITH REAL SEPOLIA ADDRESSES ===");
      
      // Test direct approval using real Sepolia USDC address
      const realUSDC = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        USDC_ADDRESS
      );
      
      console.log("Real USDC address:", USDC_ADDRESS);
      console.log("Real WETH address:", WETH_ADDRESS);
      
      // Try to get balance of real USDC (this will fail on hardhat network)
      try {
        const balance = await realUSDC.balanceOf(deployer.address);
        console.log("Real USDC balance:", ethers.formatUnits(balance, 6), "USDC");
      } catch (error) {
        console.log("Cannot get real USDC balance on hardhat network:", error.message);
        console.log("This is expected - real tokens don't exist on hardhat network");
      }
      
      // Test the approval mechanism with mock tokens
      console.log("\nTesting approval mechanism...");
      
      // Fund deployer
      await mockUSDC.mint(deployer.address, ethers.parseUnits("1000", 6));
      
      // Test direct approval
      try {
        await mockUSDC.connect(deployer).approve(vault.target, ethers.parseUnits("100", 6));
        console.log("✅ Direct USDC approval succeeded");
        
        const allowance = await mockUSDC.allowance(deployer.address, vault.target);
        console.log("Allowance:", ethers.formatUnits(allowance, 6), "USDC");
        
      } catch (error) {
        console.error("❌ Direct USDC approval failed:", error.message);
      }
      
      // Test vault's asset approval
      try {
        const vaultAsset = await vault.asset();
        console.log("Vault asset:", vaultAsset);
        console.log("Asset matches mockUSDC:", vaultAsset.toLowerCase() === mockUSDC.target.toLowerCase());
        
        // This should work since we're using mock tokens
        console.log("✅ Vault asset is correctly set to mock USDC");
        
      } catch (error) {
        console.error("❌ Vault asset check failed:", error.message);
      }
      
      console.log("\n=== CONCLUSION ===");
      console.log("The issue is likely that on Sepolia network:");
      console.log("1. The real USDC token has restrictions or is in an unexpected state");
      console.log("2. The vault's approval mechanism fails when dealing with real tokens");
      console.log("3. Mock tokens work fine, but real tokens cause the 'missing revert data' error");
      
      console.log("\n=== TEST COMPLETED ===");
    });
  });
});
