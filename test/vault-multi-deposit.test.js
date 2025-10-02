import { expect } from "chai";
import pkg from "hardhat";
const { ethers } = pkg;

describe("Vault Multi-Deposit Test", function () {
    let vault, aaveToken, feeModule, accessController;
    let owner, user1, user2, treasury;
    let vaultAddress, aaveAddress;

    beforeEach(async function () {
        // Get signers
        [owner, user1, user2, treasury] = await ethers.getSigners();

        // Deploy MockERC20 (AAVE token)
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        aaveToken = await MockERC20.deploy("Aave Token", "AAVE", 18);
        await aaveToken.waitForDeployment();
        aaveAddress = await aaveToken.getAddress();

        // Deploy AccessController
        const AccessController = await ethers.getContractFactory("AccessController");
        accessController = await AccessController.deploy();
        await accessController.waitForDeployment();
        await accessController.initialize(owner.address);

        // Deploy FeeModule
        const FeeModule = await ethers.getContractFactory("FeeModule");
        feeModule = await FeeModule.deploy();
        await feeModule.waitForDeployment();
        await feeModule.initialize(aaveAddress, treasury.address, owner.address);

        // Deploy Vault
        const Vault = await ethers.getContractFactory("Vault");
        vault = await Vault.deploy();
        await vault.waitForDeployment();
        vaultAddress = await vault.getAddress();
        await vault.initialize(
            aaveAddress,
            "Test Vault",
            "TV",
            await accessController.getAddress(),
            await feeModule.getAddress(),
            ethers.parseUnits("1000000", 18), // 1M AAVE deposit cap
            18 // decimals
        );

        // Mint AAVE tokens to users
        const mintAmount = ethers.parseUnits("1000", 18); // 1000 AAVE per user
        await aaveToken.mint(user1.address, mintAmount);
        await aaveToken.mint(user2.address, mintAmount);
        await aaveToken.mint(owner.address, mintAmount);

        // Approve vault to spend AAVE tokens
        await aaveToken.connect(user1).approve(vaultAddress, ethers.parseUnits("1000", 18));
        await aaveToken.connect(user2).approve(vaultAddress, ethers.parseUnits("1000", 18));
        await aaveToken.connect(owner).approve(vaultAddress, ethers.parseUnits("1000", 18));

        console.log("\n📋 Test Setup:");
        console.log(`Vault Address: ${vaultAddress}`);
        console.log(`AAVE Token Address: ${aaveAddress}`);
        console.log(`User1: ${user1.address}`);
        console.log(`User2: ${user2.address}`);
        console.log(`Owner: ${owner.address}`);
    });

    it("Should handle multiple deposits correctly and calculate shares properly", async function () {
        const depositAmount = ethers.parseUnits("50", 18); // 50 AAVE

        console.log("\n🧪 Testing Multi-Deposit Scenario:");
        console.log(`Deposit Amount: ${ethers.formatUnits(depositAmount, 18)} AAVE`);

        // Check initial vault state
        let totalSupply = await vault.totalSupply();
        let totalAssets = await vault.totalAssets();
        console.log(`\n📊 Initial Vault State:`);
        console.log(`Total Supply: ${ethers.formatUnits(totalSupply, 18)} shares`);
        console.log(`Total Assets: ${ethers.formatUnits(totalAssets, 18)} AAVE`);

        // STEP 1: User1 deposits 50 AAVE (first deposit)
        console.log(`\n💰 STEP 1: User1 deposits 50 AAVE`);
        
        const tx1 = await vault.connect(user1).deposit(depositAmount, user1.address);
        await tx1.wait();

        // Check vault state after first deposit
        totalSupply = await vault.totalSupply();
        totalAssets = await vault.totalAssets();
        const user1Shares1 = await vault.balanceOf(user1.address);
        const user1Assets1 = await vault.convertToAssets(user1Shares1);

        console.log(`Total Supply: ${ethers.formatUnits(totalSupply, 18)} shares`);
        console.log(`Total Assets: ${ethers.formatUnits(totalAssets, 18)} AAVE`);
        console.log(`User1 Shares: ${ethers.formatUnits(user1Shares1, 18)}`);
        console.log(`User1 Assets: ${ethers.formatUnits(user1Assets1, 18)} AAVE`);

        // Verify first deposit (should be 1:1 since vault is empty)
        expect(user1Shares1).to.equal(depositAmount);
        expect(user1Assets1).to.equal(depositAmount);
        console.log(`✅ User1 first deposit: 50 AAVE → 50 shares → 50 AAVE assets`);

        // STEP 2: User1 deposits another 50 AAVE (second deposit)
        console.log(`\n💰 STEP 2: User1 deposits another 50 AAVE`);
        
        const tx2 = await vault.connect(user1).deposit(depositAmount, user1.address);
        await tx2.wait();

        // Check vault state after second deposit
        totalSupply = await vault.totalSupply();
        totalAssets = await vault.totalAssets();
        const user1Shares2 = await vault.balanceOf(user1.address);
        const user1Assets2 = await vault.convertToAssets(user1Shares2);

        console.log(`Total Supply: ${ethers.formatUnits(totalSupply, 18)} shares`);
        console.log(`Total Assets: ${ethers.formatUnits(totalAssets, 18)} AAVE`);
        console.log(`User1 Shares: ${ethers.formatUnits(user1Shares2, 18)}`);
        console.log(`User1 Assets: ${ethers.formatUnits(user1Assets2, 18)} AAVE`);

        // Verify second deposit
        // User1 should now have 100 shares worth 100 AAVE
        expect(user1Shares2).to.equal(ethers.parseUnits("100", 18));
        expect(user1Assets2).to.equal(ethers.parseUnits("100", 18));
        console.log(`✅ User1 second deposit: 50 AAVE → 50 shares → 50 AAVE assets`);
        console.log(`✅ User1 total: 100 shares → 100 AAVE assets`);

        // STEP 3: User2 deposits 50 AAVE (third deposit)
        console.log(`\n💰 STEP 3: User2 deposits 50 AAVE`);
        
        const tx3 = await vault.connect(user2).deposit(depositAmount, user2.address);
        await tx3.wait();

        // Check vault state after third deposit
        totalSupply = await vault.totalSupply();
        totalAssets = await vault.totalAssets();
        const user2Shares = await vault.balanceOf(user2.address);
        const user2Assets = await vault.convertToAssets(user2Shares);

        console.log(`Total Supply: ${ethers.formatUnits(totalSupply, 18)} shares`);
        console.log(`Total Assets: ${ethers.formatUnits(totalAssets, 18)} AAVE`);
        console.log(`User2 Shares: ${ethers.formatUnits(user2Shares, 18)}`);
        console.log(`User2 Assets: ${ethers.formatUnits(user2Assets, 18)} AAVE`);

        // Verify third deposit
        // User2 should get 50 shares worth 50 AAVE
        expect(user2Shares).to.equal(depositAmount);
        expect(user2Assets).to.equal(depositAmount);
        console.log(`✅ User2 deposit: 50 AAVE → 50 shares → 50 AAVE assets`);

        // Final verification
        console.log(`\n🔍 Final Verification:`);
        console.log(`Total Vault Assets: ${ethers.formatUnits(totalAssets, 18)} AAVE`);
        console.log(`Total Vault Shares: ${ethers.formatUnits(totalSupply, 18)} shares`);
        console.log(`User1 Total: ${ethers.formatUnits(user1Shares2, 18)} shares → ${ethers.formatUnits(user1Assets2, 18)} AAVE`);
        console.log(`User2 Total: ${ethers.formatUnits(user2Shares, 18)} shares → ${ethers.formatUnits(user2Assets, 18)} AAVE`);

        // Verify total assets match sum of user assets
        const totalUserAssets = user1Assets2 + user2Assets;
        expect(totalAssets).to.equal(totalUserAssets);
        console.log(`✅ Total assets verification: ${ethers.formatUnits(totalAssets, 18)} = ${ethers.formatUnits(totalUserAssets, 18)}`);

        // Verify share price consistency
        const sharePrice = (totalAssets * ethers.parseUnits("1", 18)) / totalSupply;
        console.log(`Share Price: ${ethers.formatUnits(sharePrice, 18)} AAVE per share`);

        // Test convertToShares for a new 50 AAVE deposit
        const newDepositShares = await vault.convertToShares(depositAmount);
        const newDepositAssets = await vault.convertToAssets(newDepositShares);
        console.log(`\n🧪 Testing convertToShares for new 50 AAVE deposit:`);
        console.log(`Would get: ${ethers.formatUnits(newDepositShares, 18)} shares`);
        console.log(`Those shares worth: ${ethers.formatUnits(newDepositAssets, 18)} AAVE`);

        // Verify convertToShares logic
        const expectedShares = (depositAmount * totalSupply) / totalAssets;
        expect(newDepositShares).to.equal(expectedShares);
        expect(newDepositAssets).to.equal(depositAmount);
        console.log(`✅ convertToShares logic is correct`);

        console.log(`\n🎉 Multi-Deposit Test Completed Successfully!`);
    });

    it("Should handle edge case: deposit when vault has no assets", async function () {
        console.log(`\n🧪 Testing Edge Case: Deposit when vault is empty`);
        
        const depositAmount = ethers.parseUnits("50", 18);
        
        // Check initial state
        let totalSupply = await vault.totalSupply();
        let totalAssets = await vault.totalAssets();
        console.log(`Initial Total Supply: ${ethers.formatUnits(totalSupply, 18)} shares`);
        console.log(`Initial Total Assets: ${ethers.formatUnits(totalAssets, 18)} AAVE`);

        // First deposit should be 1:1
        const tx = await vault.connect(user1).deposit(depositAmount, user1.address);
        await tx.wait();

        const userShares = await vault.balanceOf(user1.address);
        const userAssets = await vault.convertToAssets(userShares);

        expect(userShares).to.equal(depositAmount);
        expect(userAssets).to.equal(depositAmount);
        console.log(`✅ First deposit: 50 AAVE → 50 shares → 50 AAVE assets`);
    });

    it("Should handle edge case: deposit when vault has assets but no shares", async function () {
        console.log(`\n🧪 Testing Edge Case: Deposit when vault has assets but no shares`);
        
        // Manually transfer assets to vault (simulating strategy returns)
        const assetAmount = ethers.parseUnits("100", 18);
        await aaveToken.connect(owner).transfer(vaultAddress, assetAmount);

        // Check state
        let totalSupply = await vault.totalSupply();
        let totalAssets = await vault.totalAssets();
        console.log(`Total Supply: ${ethers.formatUnits(totalSupply, 18)} shares`);
        console.log(`Total Assets: ${ethers.formatUnits(totalAssets, 18)} AAVE`);

        // Deposit should still work (1:1 since no shares exist)
        const depositAmount = ethers.parseUnits("50", 18);
        const tx = await vault.connect(user1).deposit(depositAmount, user1.address);
        await tx.wait();

        const userShares = await vault.balanceOf(user1.address);
        const userAssets = await vault.convertToAssets(userShares);

        expect(userShares).to.equal(depositAmount);
        expect(userAssets).to.equal(depositAmount);
        console.log(`✅ Deposit with existing assets: 50 AAVE → 50 shares → 50 AAVE assets`);
    });
});
