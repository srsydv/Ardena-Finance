// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IStrategy.sol";
import "../core/AccessController.sol";
import "../core/FeeModule.sol";
import "../utils/SafeTransferLib.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract Vault is Initializable, UUPSUpgradeable {
    using SafeTransferLib for address;

    // --- Config ---
    string public name;
    string public symbol;
    uint8 public decimals;
    IERC20 public asset; // ERC20 underlying (e.g., USDC)
    AccessController public access; // role control
    FeeModule public fees; // fee module

    // --- ERC4626-ish shares ---
    uint256 public totalSupply; // total shares
    mapping(address => uint256) public balanceOf;

    // --- Strategies ---
    IStrategy[] public strategies;
    mapping(IStrategy => uint16) public targetBps; // target allocation per strategy (sum <= 1e4)

    // --- Limits & Timers ---
    uint256 public depositCap; // max TVL
    uint256 public minHarvestInterval; // seconds
    uint256 public lastHarvest;

    event Deposit(
        address indexed from,
        address indexed to,
        uint256 assets,
        uint256 net,
        uint256 shares
    );
    event Withdraw(
        address indexed caller,
        address indexed to,
        uint256 assets,
        uint256 shares,
        uint256 exitFee,
        uint256 totalGot
    );
    event Harvest(
        uint256 realizedProfit,
        uint256 mgmtFee,
        uint256 perfFee,
        uint256 tvlAfter
    );

    event StrategySet(address strategy, uint16 bps);

    modifier onlyManager() {
        require(access.managers(msg.sender), "NOT_MANAGER");
        _;
    }
    modifier onlyKeeper() {
        require(access.keepers(msg.sender), "NOT_KEEPER");
        _;
    }

    function initialize(
        address _asset,
        string memory _name,
        string memory _symbol,
        address _access,
        address _fees,
        uint256 _depositCap,
        uint8 _decimals
    ) public initializer {
        __UUPSUpgradeable_init();
        asset = IERC20(_asset);
        name = _name;
        symbol = _symbol;
        access = AccessController(_access);
        fees = FeeModule(_fees);
        depositCap = _depositCap;
        decimals = _decimals;
    }

    function _authorizeUpgrade(
        address /*newImplementation*/
    ) internal view override {
        require(access.managers(msg.sender), "NOT_MANAGER");
    }

    uint256[50] private __gap;

    // -----------------
    // View helpers
    // -----------------
    function totalAssets() public view returns (uint256 t) {
        t = _assetBal();
        for (uint256 i; i < strategies.length; i++)
            t += strategies[i].totalAssets();
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 ts = totalSupply;
        uint256 ta = totalAssets();
        return ts == 0 || ta == 0 ? assets : (assets * ts) / ta;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 ts = totalSupply;
        uint256 ta = totalAssets();
        return ts == 0 ? shares : (shares * ta) / ts;
    }

    // -----------------
    // User actions
    // -----------------
    function deposit(
        uint256 assets,
        address receiver
    ) external returns (uint256 shares) {
        uint256 taBefore = totalAssets();
        require(taBefore + assets <= depositCap, "CAP");
        // Transfer assets first
        asset.transferFrom(msg.sender, address(this), assets);
        // Calculate fees after transfer
        (uint256 net, uint256 entryFee) = fees.takeEntryFee(assets);
        if (entryFee > 0) IERC20(asset).transfer(fees.treasury(), entryFee);
        uint256 ts = totalSupply;
        if (ts == 0 || taBefore == 0) {
            // initial case — 1:1
            shares = net;
        } else {
            // safe proportional minting using old TVL
            shares = (net * ts) / taBefore;
        }
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, net, shares);
    }

    /*
        // CORRECT WITHDRAWAL FLOW:
vault.withdraw(shares, receiver, allSwapData[][])
├── convertToAssets(shares) → calculates AAVE needed
├── Pro-rata withdrawal from strategies:
│   ├── AaveV3Strategy (60%): gets empty swap data []
│   └── UniswapV3Strategy (40%): gets WETH→AAVE swap data
└── Strategies execute:
    ├── AaveV3Strategy.withdraw() → returns AAVE directly
    └── UniswapV3Strategy.withdraw() → decreases liquidity, swaps WETH→AAVE, returns AAVE
    */

    function withdraw(
        uint256 shares,
        address receiver,
        bytes[][] calldata allSwapData // keeper provides swap routes for each strategy
    ) external returns (uint256 assets) {
        require(balanceOf[msg.sender] >= shares, "BALANCE");

        // Convert shares → assets owed
        assets = convertToAssets(shares);

        // Burn shares first
        _burn(msg.sender, shares);

        // Idle balance available
        uint256 idle = _assetBal();

        // Pro-rata withdrawals from strategies
        uint256 totalGot = idle;

        if (idle < assets) {
            uint256 shortfall = assets - idle;

            // Withdraw proportionally to each strategy's targetBps
            for (uint256 i; i < strategies.length; i++) {
                IStrategy s = strategies[i];
                uint16 bps = targetBps[s];
                if (bps == 0) continue;

                // Strategy share of shortfall
                uint256 stratShare = (shortfall * bps) / 1e4;

                if (stratShare > 0) {
                    // Cap by strategy's available assets to avoid over-asking
                    uint256 avail = s.totalAssets();
                    if (avail == 0) continue;
                    if (stratShare > avail) stratShare = avail;

                    uint256 got = s.withdraw(stratShare, allSwapData[i]);
                    totalGot += got;
                }
            }

            // If still short, do a second pass pulling from any strategy with remaining funds
            if (totalGot < assets) {
                uint256 remaining = assets - totalGot;
                for (uint256 i2; i2 < strategies.length && remaining > 0; i2++) {
                    IStrategy s2 = strategies[i2];
                    uint16 bps2 = targetBps[s2];
                    if (bps2 == 0) continue;
                    uint256 avail2 = s2.totalAssets();
                    if (avail2 == 0) continue;

                    uint256 toPull = avail2 < remaining ? avail2 : remaining;
                    if (toPull == 0) continue;

                    // Safe to pass empty swap data for second pass; Aave ignores, Uni strategy builds internally
                    bytes[] memory empty;
                    uint256 got2 = s2.withdraw(toPull, empty);
                    totalGot += got2;
                    if (got2 >= remaining) {
                        remaining = 0;
                    } else {
                        remaining -= got2;
                    }
                }
            }
        }

        // Require we met the user's owed assets after up to two passes
        require(totalGot >= assets, "WITHDRAW_FAILED");
        // We only owe `assets` to the user. If we collected more than needed, keep the surplus in Vault.
        uint256 owed = assets;

        // Compute exit fee based on actual amount collected
        (uint256 net, uint256 exitFee) = fees.takeExitFee(owed);
        if (exitFee > 0) IERC20(asset).transfer(fees.treasury(), exitFee);

        // Pay user
        asset.transfer(receiver, net);

        emit Withdraw(msg.sender, receiver, net, shares, exitFee, totalGot);
    }

    /// @notice Manager-only: pull funds back from a specific strategy into the Vault.
    /// Used for rebalancing, not user withdrawals (no share burning).
    function withdrawFromStrategy(
        IStrategy strat,
        uint256 amount,
        bytes[] calldata swapData
    ) external onlyManager returns (uint256 got) {
        require(_hasStrategy(strat), "NOT_STRATEGY");
        got = strat.withdraw(amount, swapData); // strategy sends USDC back to Vault
    }

    // -----------------
    // Management
    // -----------------
    function setStrategy(IStrategy s, uint16 bps) external onlyManager {
        require(s.want() == address(asset), "STRAT_WANT");
        if (!_hasStrategy(s)) strategies.push(s);
        targetBps[s] = bps;
        emit StrategySet(address(s), bps);
    }

    function deleteStrategy(IStrategy s) external onlyManager {
        require(_hasStrategy(s), "NOT_STRATEGY");

        // Remove strategy from array
        for (uint256 i = 0; i < strategies.length; i++) {
            if (address(strategies[i]) == address(s)) {
                // Move last element to current position
                strategies[i] = strategies[strategies.length - 1];
                strategies.pop();
                break;
            }
        }

        // Clear target allocation
        targetBps[s] = 0;

        emit StrategySet(address(s), 0);
    }

    /*
        Q:- why 2d allSwapData bytes[][] calldata allSwapData
        What’s happening

        Your Vault can have multiple strategies (say AaveV3Strategy, UniswapV3Strategy, maybe others in the future).

        investIdle() loops through all strategies and calls s.deposit(...) on each one.

        Some strategies (like Aave) don’t need swap data at all. Others (like Uniswap v3) may need multiple swaps (e.g. USDC → WETH and USDC → DAI) to set up the right token pair.
        So the input shape looks like this:


        allSwapData = [
        [ swap1_for_strategy0, swap2_for_strategy0, ... ], // array for strategy[0]
        [ swap1_for_strategy1 ],                           // array for strategy[1]
        [ ],                                               // maybe no swaps for strategy[2]
        ...
        ]

    */
    function investIdle(bytes[][] calldata allSwapData) external onlyManager {
        uint256 idle = _assetBal();
        for (uint256 i; i < strategies.length; i++) {
            IStrategy s = strategies[i];
            uint256 toSend = (idle * targetBps[s]) / 1e4;
            if (toSend > 0) {
                asset.approve(address(s), 0);
                asset.approve(address(s), toSend);
                s.deposit(toSend, allSwapData[i]);
            }
        }
    }

    /*
        Keeper role:-

        Keeper just supplies the correct swapData for _executeSwaps.

        Amounts (amountIn) are NOT precomputed — ExchangeHandler uses strategy balances.

        Keeper only ensures the swap is routed through allowed router + safe minOut.


        Vault side:-

        Accepts bytes[][] calldata allSwapData → one array of swap routes per strategy.
        Example:

        allSwapData[0] for Aave (likely empty, since no swaps needed).

        allSwapData[1] for Uniswap v3 (routes to convert WETH→USDC).

        Loops through all strategies, calls their harvest(), aggregates profits.

        Then calculates mgmt + perf fees and pays them.

        Uniswap v3 strategy side:-

        Uses collect() to pull whatever fees exist (fee0, fee1).

        _executeSwaps(swapData) handles conversions to want.

        Measures net profit in want.

        Sends realized profit to the Vault.


    */

    function harvestAll(bytes[][] calldata allSwapData) external onlyKeeper {
        require(
            block.timestamp >= lastHarvest + minHarvestInterval,
            "HARVEST_COOLDOWN"
        );

        uint256 idleBefore = IERC20(asset).balanceOf(address(this));

        // Step 1: call all strategies to realize any rewards
        for (uint i; i < strategies.length; i++) {
            strategies[i].harvest(allSwapData[i]); // Uni sends USDC to Vault; Aave does nothing
        }

        uint256 afterTA = totalAssets();
        uint256 idleAfter = IERC20(asset).balanceOf(address(this));

        // Step 2: compute realized profit (what actually hit the Vault this harvest)
        uint256 realizedProfit = idleAfter > idleBefore
            ? idleAfter - idleBefore
            : 0;

        // Step 3: management fee (time-based, on full TVL)
        uint256 mgmt = fees.computeMgmtFee(afterTA);

        // Step 4: performance fee (only on realized profit)
        uint256 perf;
        if (realizedProfit > 0 && fees.performanceFeeBps() > 0) {
            perf = (realizedProfit * fees.performanceFeeBps()) / 1e4;
        }

        // Step 5: pay fees from Vault’s idle USDC
        uint256 totalFees = mgmt + perf;
        if (totalFees > 0) {
            uint256 bal = IERC20(asset).balanceOf(address(this));
            if (bal >= totalFees) {
                // if (mgmt > 0) IERC20(asset).transfer(fees.treasury(), mgmt);
                // if (perf > 0) IERC20(asset).transfer(fees.treasury(), perf);
            }
        }

        fees.onFeesCharged();
        lastHarvest = block.timestamp;

        emit Harvest(realizedProfit, mgmt, perf, afterTA);
    }

    // -----------------
    // Internals
    // -----------------
    function _assetBal() internal view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function zerototalSupply(address to) external onlyManager {
        totalSupply = 0;
        balanceOf[to] = 0;
    }

    function _burn(address from, uint256 amount) internal {
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }

    function strategiesLength() external view returns (uint256) {
        return strategies.length;
    }

    function _hasStrategy(IStrategy s) internal view returns (bool) {
        for (uint256 i; i < strategies.length; i++)
            if (address(strategies[i]) == address(s)) return true;
        return false;
    }
}
