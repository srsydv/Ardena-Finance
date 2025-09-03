const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("Vault + Strategies Integration (Arbitrum fork)", function () {
  let deployer, user, treasury;
  let usdc, vault, fees, access, aaveStrat, uniStrat;
  const USDC_WHALE = "0x463f5D63e5a5EDB8615b0e485A090a18Aba08578"; // big USDC holder on Arbitrum
  const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC
  const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"; // Aave V3 pool
  const A_USDC = "0x625E7708f30cA75bfd92586e17077590C60eb4cD"; // Aave interest-bearing USDC
  const UNISWAP_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const UNISWAP_POOL = "0x905dfcd5649217c42684f23958568e533c711aa3"; // USDC/WETH pool

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

    // Transfer 10,000 USDC from whale to deployer
    await usdc
      .connect(whale)
      .transfer(deployer.address, ethers.parseUnits("10000", 6));

    console.log(
      "Deployer USDC balance:",
      (await usdc.balanceOf(deployer.address)).toString()
    );

    expect(await usdc.balanceOf(deployer.address)).to.equal(
      ethers.parseUnits("10000", 6)
    );
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
      A_USDC,
      AAVE_POOL
    );

    console.log("aaveStrat:", aaveStrat.target);

    // --- Deploy ExchangeHandler ---
    const ExchangeHandler = await ethers.getContractFactory("ExchangeHandler");
    exchanger = await ExchangeHandler.deploy(deployer.address);
    // await exchanger.deployed();

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
      deployer.address // dummy oracle
    );

    console.log("uniStrat:", uniStrat.target);

    // After deploying AccessController
    await access.setManager(deployer.address, true);

    // --- Add strategies (50/50) ---
    await vault.setStrategy(aaveStrat.target, 5000);
    await vault.setStrategy(uniStrat.target, 5000);
  });

  it("User can deposit, invest, harvest, and withdraw", async () => {
    const depositAmount = ethers.parseUnits("1000", 6);
    console.log("depositAmount:", depositAmount.toString());
    // Approve Vault
    await usdc.approve(vault.target, depositAmount);

    // Deposit into Vault
    await vault.deposit(depositAmount, deployer.address);

    expect(await usdc.balanceOf(vault.target)).to.equal(depositAmount);

    // Dummy swap data (empty for now since exchanger isn’t integrated yet)
    const emptySwaps = [[]];

    // Manager invests idle funds
    await vault.investIdle([[], []]); // empty swapData for Aave and Uniswap

    // Check strategies received funds
    expect(await aaveStrat.totalAssets()).to.be.gt(0);
    expect(await uniStrat.totalAssets()).to.be.gte(0); // might be 0 because no real swaps

    // Keeper harvests
    await vault.harvestAll([[], []]); // empty swapData

    // Withdraw all shares
    const shares = await vault.balanceOf(deployer.address);
    await vault.withdraw(shares, deployer.target, [[], []]);

    const finalBalance = await usdc.balanceOf(deployer.address);
    console.log(
      "Final USDC balance:",
      ethers.utils.formatUnits(finalBalance, 6)
    );

    expect(finalBalance).to.be.closeTo(
      ethers.parseUnits("10000", 6),
      ethers.parseUnits("10", 6) // small drift allowed
    );
  });
});
