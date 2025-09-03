const { ethers } = require("hardhat");

describe("Vault Integration Test", function () {
  let vault, aaveStrat, uniStrat, usdc, user, access, fees;

  beforeEach(async () => {
    [deployer, user, treasury] = await ethers.getSigners();

    // Load USDC token from Arbitrum
    usdc = await ethers.getContractAt(
      "IERC20",
      "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
    );

    // Deploy FeeModule + AccessController
    const FeeModule = await ethers.getContractFactory("FeeModule");
    fees = await FeeModule.deploy(usdc.address, treasury.address, deployer.address);

    const Access = await ethers.getContractFactory("AccessController");
    access = await Access.deploy(deployer.address);

    // Deploy Vault
    const Vault = await ethers.getContractFactory("Vault");
    vault = await Vault.deploy(
      usdc.address,
      "My Vault",
      "MVLT",
      access.address,
      fees.address,
      ethers.constants.AddressZero,
      ethers.utils.parseUnits("1000000", 6),
      6
    );

    // Deploy Aave Strategy
    const AaveV3Strategy = await ethers.getContractFactory("AaveV3Strategy");
    aaveStrat = await AaveV3Strategy.deploy(
      vault.address,
      usdc.address,
      "0x625E7708f30cA75bfd92586e17077590C60eb4cD", // aUSDC
      "0x794a61358D6845594F94dc1DB02A252b5b4814aD"  // Pool
    );

    // Deploy Uniswap Strategy
    const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
    uniStrat = await UniswapV3Strategy.deploy(
      vault.address,
      usdc.address,
      "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", // PositionManager
      "0x905dfcd5649217c42684f23958568e533c711aa3", // Pool
      deployer.address, // dummy exchanger for now
      deployer.address  // dummy oracle
    );

    // Add strategies
    await vault.setStrategy(aaveStrat.address, 5000);
    await vault.setStrategy(uniStrat.address, 5000);
  });

  it("should deposit USDC into vault and allocate", async () => {
    // Impersonate a USDC whale from Arbitrum
    const whale = "0x0A59649758aa4d66E25f08Dd01271e891fe52199";
    await ethers.provider.send("hardhat_impersonateAccount", [whale]);
    const whaleSigner = await ethers.getSigner(whale);

    // Transfer USDC to our test user
    await usdc.connect(whaleSigner).transfer(user.address, 1_000_000e6);

    // User deposits into Vault
    await usdc.connect(user).approve(vault.address, 1_000_000e6);
    await vault.connect(user).deposit(1_000_000e6, user.address);

    console.log("Vault assets:", (await vault.totalAssets()).toString());

    // Manager invests
    await vault.investIdle([[], []]); // empty swapData for now
    console.log("Aave strat assets:", (await aaveStrat.totalAssets()).toString());
    console.log("Uniswap strat assets:", (await uniStrat.totalAssets()).toString());
  });
});
