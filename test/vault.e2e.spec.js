const { expect } = require("chai");
const { ethers } = require("hardhat");

function b6(n) {
  return ethers.parseUnits(String(n), 6);
} // 6-decimals helper

describe("Vault end-to-end (deposit → invest → harvest → fees → withdraw)", function () {
  let deployer, alice, bob, keeper, treasury, governor, manager;
  let USDC, usdc;
  let Access, access;
  let Fee, fee;
  let Vault, vault;
  let StratMM, sMM; // mark-to-market strategy (Aave-like)
  let StratReal, sReal; // realize-on-harvest strategy (UniV3-like)

  beforeEach(async () => {
    [deployer, alice, bob, keeper, treasury, governor, manager] =
      await ethers.getSigners();

    // 1) Mock USDC
    USDC = await ethers.getContractFactory("MockERC20");
    usdc = await USDC.connect(deployer).deploy("MockUSDC", "USDC", 6);
    await usdc.waitForDeployment();

    // Fund test users
    await usdc.mint(alice.address, b6(50_000));
    await usdc.mint(bob.address, b6(50_000));

    // 2) AccessController (assume your contract name)
    Access = await ethers.getContractFactory("AccessController");
    access = await Access.connect(deployer).deploy(deployer.address); // owner
    await access.waitForDeployment();

    // Roles
    await access.setManager(manager.address, true);
    await access.setKeeper(keeper.address, true);

    // 3) FeeModule (your concrete module from your code)
    Fee = await ethers.getContractFactory("FeeModule");
    fee = await Fee.connect(deployer).deploy(
      await usdc.getAddress(),
      treasury.address,
      governor.address
    );
    await fee.waitForDeployment();

    // Set fees: mgmt=2% yr, perf=20%, entry=0.1%, exit=0.1%
    await fee.connect(governor).setFees(2000, 2000, 10, 10);

    // 4) Vault (assume your Vault constructor: asset, name, symbol, access, fees, oracle, cap, decimals)
    // For oracle, pass zero address or a mock if your Vault requires; cap=1e12 for test
    Vault = await ethers.getContractFactory("Vault");
    vault = await Vault.connect(deployer).deploy(
      await usdc.getAddress(),
      "Test vUSDC",
      "vUSDC",
      await access.getAddress(),
      await fee.getAddress(),
      ethers.ZeroAddress, // oracle (if required in your constructor; else adapt)
      b6(1_000_000_000),
      6
    );
    await vault.waitForDeployment();

    // 5) Strategies
    StratMM = await ethers.getContractFactory("MockStrategyMarkToMarket");
    sMM = await StratMM.connect(deployer).deploy(
      await vault.getAddress(),
      await usdc.getAddress()
    );
    await sMM.waitForDeployment();

    StratReal = await ethers.getContractFactory("MockStrategyRealizeProfit");
    sReal = await StratReal.connect(deployer).deploy(
      await vault.getAddress(),
      await usdc.getAddress()
    );
    await sReal.waitForDeployment();

    // 6) Wire strategies with target allocations (60% / 40%)
    await vault.connect(manager).setStrategy(await sMM.getAddress(), 6000);
    await vault.connect(manager).setStrategy(await sReal.getAddress(), 4000);
  });

  it("deposit → invest → simulate yield → harvest fees → withdraw", async () => {
    const b6 = (n) => ethers.parseUnits(String(n), 6);

    // --- 1) Deposit ---
    await usdc.connect(alice).approve(await vault.getAddress(), b6(10_000));
    const trBalBefore = await usdc.balanceOf(treasury.address);

    await (
      await vault.connect(alice).deposit(b6(10_000), alice.address)
    ).wait();

    const trBalAfterDeposit = await usdc.balanceOf(treasury.address);
    // entry fee = 0.1% of 10,000 = 10 USDC
    expect(trBalAfterDeposit - trBalBefore).to.equal(b6(10));

    // --- 2) Invest idle (60/40) ---
    await (await vault.connect(manager).investIdle()).wait();

    // --- 3) Simulate yield ---
    // Aave-like: mark-to-market (already reflected in totalAssets())
    await usdc.mint(await sMM.getAddress(), b6(120));
    // UniV3-like: pending fees that are realized in harvest()
    await usdc.mint(await sReal.getAddress(), b6(180));

    // Accrue some mgmt-fee time
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // +1 week
    await ethers.provider.send("evm_mine");

    // --- 4) Harvest ---
    const tvlBefore = await vault.totalAssets();

    const txHarv = await vault.connect(keeper).harvestAll();
    const rc = await txHarv.wait();

    const tvlAfterNet = await vault.totalAssets(); // post-fee TVL
    const trBalAfterHarvest = await usdc.balanceOf(treasury.address);

    console.log("tvlBefore", tvlBefore.toString());
    console.log("tvlAfterNet", tvlAfterNet.toString());
    console.log("trBalAfterHarvest", trBalAfterHarvest.toString());

    // Parse ONLY the Vault's Harvest event
    // >>> MAKE SURE your Vault has: event Harvest(uint256 realizedProfit,uint256 mgmtFee,uint256 perfFee,uint256 tvlAfter);
    const vaultAddr = (await vault.getAddress()).toLowerCase();
    const vaultIface = new ethers.Interface([
      "event Harvest(uint256 realizedProfit,uint256 mgmtFee,uint256 perfFee,uint256 tvlAfter)",
    ]);

    let parsed;
    for (const log of rc.logs) {
      if ((log.address || "").toLowerCase() !== vaultAddr) continue;
      try {
        const p = vaultIface.parseLog(log);
        if (p?.name === "Harvest") {
          parsed = p;
          break;
        }
      } catch {
        /* not our event */
      }
    }

    // If this fails, your event signature or name in Vault does not match the Interface above.
    expect(parsed, "Vault Harvest event not found or wrong signature").to.exist;

    const realizedProfit = parsed.args.realizedProfit; // pre-fee profit (afterTA - beforeTA)
    const mgmtFee = parsed.args.mgmtFee;
    const perfFee = parsed.args.perfFee;
    const tvlAfterPreFee = parsed.args.tvlAfter; // 'afterTA' measured BEFORE fee transfers

    // 4a) Profit happened (pre-fee TVL should be above before)
    expect(realizedProfit).to.be.gt(0n);
    expect(tvlAfterPreFee).to.be.gt(tvlBefore);

    // 4b) Post-fee TVL = pre-fee TVL − (mgmt + perf), within small tolerance
    const TOL = b6(2); // 2 USDC tolerance
    const expectedAfterNet = tvlAfterPreFee - (mgmtFee + perfFee);
    const diff =
      tvlAfterNet > expectedAfterNet
        ? tvlAfterNet - expectedAfterNet
        : expectedAfterNet - tvlAfterNet;
    expect(diff).to.be.lte(TOL);

    // 4c) Treasury grew by ≈ mgmt + perf this harvest
    const treasuryDeltaHarvest = trBalAfterHarvest - trBalAfterDeposit;
    expect(treasuryDeltaHarvest + TOL).to.be.gte(mgmtFee + perfFee);

    // --- 5) Withdraw (half) ---
    const aliceShares = await vault.balanceOf(alice.address);
    const half = aliceShares / 2n;
    const usdcBefore = await usdc.balanceOf(alice.address);

    await (await vault.connect(alice).withdraw(half, alice.address)).wait();

    const usdcAfter = await usdc.balanceOf(alice.address);
    expect(usdcAfter).to.be.gt(usdcBefore); // user received funds

    // Treasury should increase again due to exit fee
    const trBalAfterWithdraw = await usdc.balanceOf(treasury.address);
    expect(trBalAfterWithdraw).to.be.gt(trBalAfterHarvest);
  });

});
