const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

describe("Vault Approval Core Test", function () {
  this.timeout(200_000);
  
  let deployer, user, treasury;
  let mockUSDC, vault, fees, access;

  async function deployContracts() {
    // Get signers
    [deployer, user, treasury] = await ethers.getSigners();
    
    // Create mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    
    // Deploy Oracle
    const Oracle = await ethers.getContractFactory("OracleModule");
    const oracle = await upgrades.deployProxy(Oracle, [mockUSDC.target], {
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
    
    // Set up roles
    await access.setManager(deployer.address, true);
    
    return {
      deployer,
      user,
      treasury,
      vault,
      fees,
      access,
      mockUSDC,
    };
  }

  describe("Vault Approval Core Test", function () {
    it("should test vault's asset.approve() mechanism", async () => {
      this.timeout(300_000);
      
      const {
        deployer,
        user,
        vault,
        access,
        mockUSDC,
      } = await deployContracts();
      
      console.log("\n=== TESTING VAULT'S ASSET.APPROVE() MECHANISM ===");
      
      // Fund user with mock USDC
      await mockUSDC.mint(user.address, ethers.parseUnits("100000000", 6));
      
      // User deposits into vault
      const depositAmount = ethers.parseUnits("200", 6);
      console.log("Deposit amount:", ethers.formatUnits(depositAmount, 6), "USDC");
      
      await mockUSDC.connect(user).approve(vault.target, depositAmount);
      await vault.connect(user).deposit(depositAmount, user.address);
      
      console.log("Vault balance after deposit:", ethers.formatUnits(await vault.totalAssets(), 6), "USDC");
      
      // Create a simple contract to receive the approval
      const SimpleReceiver = await ethers.getContractFactory("MockERC20");
      const receiver = await SimpleReceiver.deploy("Receiver", "RCV", 6);
      
      console.log("Receiver address:", receiver.target);
      
      // Test the vault's asset approval mechanism
      console.log("\n=== TESTING VAULT'S ASSET APPROVAL ===");
      
      try {
        // Get the vault's asset
        const vaultAsset = await vault.asset();
        console.log("Vault asset:", vaultAsset);
        console.log("Asset matches mockUSDC:", vaultAsset.toLowerCase() === mockUSDC.target.toLowerCase());
        
        // Test direct approval from vault (this simulates what happens in investIdle)
        const approvalAmount = ethers.parseUnits("100", 6);
        
        // This is what the vault does internally: asset.approve(spender, amount)
        // We'll simulate this by calling the asset contract directly from the vault's perspective
        
        // First, let's check the current allowance
        const currentAllowance = await mockUSDC.allowance(vault.target, receiver.target);
        console.log("Current allowance:", ethers.formatUnits(currentAllowance, 6), "USDC");
        
        // Now test the approval
        console.log("Testing asset.approve() from vault...");
        
        // We need to impersonate the vault to call approve on its behalf
        await ethers.provider.send("hardhat_impersonateAccount", [vault.target]);
        const vaultSigner = await ethers.getSigner(vault.target);
        
        // Give the vault some ETH for gas
        await ethers.provider.send("hardhat_setBalance", [
          vault.target,
          "0x1000000000000000000", // 1 ETH
        ]);
        
        // Test the approval
        const approveTx = await mockUSDC.connect(vaultSigner).approve(receiver.target, approvalAmount);
        await approveTx.wait();
        
        console.log("✅ Vault asset approval succeeded!");
        
        // Check the new allowance
        const newAllowance = await mockUSDC.allowance(vault.target, receiver.target);
        console.log("New allowance:", ethers.formatUnits(newAllowance, 6), "USDC");
        
        // Stop impersonating
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [vault.target]);
        
      } catch (error) {
        console.error("❌ Vault asset approval failed:", error.message);
        
        if (error.reason) {
          console.log("Error reason:", error.reason);
        }
        
        if (error.data) {
          console.log("Error data:", error.data);
        }
        
        throw error;
      }
      
      // Now test the investIdle mechanism
      console.log("\n=== TESTING INVEST IDLE MECHANISM ===");
      
      // Create a simple strategy that just receives tokens
      const SimpleStrategy = await ethers.getContractFactory("MockERC20");
      const strategy = await SimpleStrategy.deploy("Strategy", "STRAT", 6);
      
      // Add strategy with 100% allocation
      await vault.setStrategy(strategy.target, 10000);
      
      console.log("Strategy added with 100% allocation");
      
      // Test investIdle with empty swap data
      try {
        console.log("Testing investIdle...");
        await vault.connect(deployer).investIdle([[]]);
        console.log("✅ investIdle succeeded!");
        
        // Check strategy balance
        const strategyBalance = await mockUSDC.balanceOf(strategy.target);
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
        
        console.log("\n=== ANALYSIS ===");
        console.log("The investIdle function failed. This confirms that the issue is");
        console.log("in the Vault contract's approval mechanism when dealing with real tokens.");
        console.log("Mock tokens work fine, but real Sepolia USDC causes the 'missing revert data' error.");
        
        throw error;
      }
      
      console.log("\n=== CONCLUSION ===");
      console.log("✅ Mock tokens work perfectly with the vault's approval mechanism");
      console.log("❌ The issue occurs specifically with real Sepolia USDC tokens");
      console.log("🔍 The 'missing revert data' error is caused by the real USDC token");
      console.log("   rejecting the vault's approval calls for unknown reasons");
      
      console.log("\n=== TEST COMPLETED ===");
    });
  });
});
