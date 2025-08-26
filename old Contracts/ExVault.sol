// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// import "../interfaces/IStrategy.sol";
// import "../interfaces/IOracleRouter.sol";
// import "../core/AccessController.sol";
// import "../core/FeeModule.sol";
// import "../utils/SafeTransferLib.sol";

// interface IERC20 {
//     function totalSupply() external view returns (uint256);

//     function balanceOf(address) external view returns (uint256);

//     function transfer(address, uint256) external returns (bool);

//     function allowance(address, address) external view returns (uint256);

//     function approve(address, uint256) external returns (bool);

//     function transferFrom(address, uint256) external returns (bool);

//     function decimals() external view returns (uint8);
// }

// contract Vault {
//     using SafeTransferLib for address;

//     // --- Config ---
//     string public name;
//     string public symbol;
//     uint8 public immutable decimals;
//     address public immutable asset; // ERC20 underlying (e.g., USDC)
//     AccessController public access; // role control
//     FeeModule public fees; // fee module
//     IOracleRouter public oracle; // price sanity if needed

//     // --- ERC4626-ish shares ---
//     uint256 public totalSupply; // total shares
//     mapping(address => uint256) public balanceOf;

//     // --- Strategies ---
//     IStrategy[] public strategies;
//     mapping(IStrategy => uint16) public targetBps; // target allocation per strategy (sum <= 1e4)

//     // --- Limits & Timers ---
//     uint256 public depositCap; // max TVL
//     uint256 public minHarvestInterval; // seconds
//     uint256 public lastHarvest;

//     event Deposit(
//         address indexed from,
//         address indexed to,
//         uint256 assets,
//         uint256 shares
//     );
//     event Withdraw(
//         address indexed caller,
//         address indexed to,
//         uint256 assets,
//         uint256 shares
//     );
//     event Harvest(uint256 profit, uint256 tvlAfter);
//     event StrategySet(address strategy, uint16 bps);

//     modifier onlyManager() {
//         require(access.managers(msg.sender), "NOT_MANAGER");
//         _;
//     }
//     modifier onlyKeeper() {
//         require(access.keepers(msg.sender), "NOT_KEEPER");
//         _;
//     }

//     constructor(
//         address _asset,
//         string memory _name,
//         string memory _symbol,
//         address _access,
//         address _fees,
//         address _oracle,
//         uint256 _depositCap,
//         uint8 _decimals
//     ) {
//         asset = _asset;
//         name = _name;
//         symbol = _symbol;
//         access = AccessController(_access);
//         fees = FeeModule(_fees);
//         oracle = IOracleRouter(_oracle);
//         depositCap = _depositCap;
//         decimals = _decimals;
//     }

//     // -----------------
//     // View helpers
//     // -----------------
//     function totalAssets() public view returns (uint256 t) {
//         t = _assetBal();
//         for (uint256 i; i < strategies.length; i++)
//             t += strategies[i].totalAssets();
//     }

//     function convertToShares(uint256 assets) public view returns (uint256) {
//         uint256 ts = totalSupply;
//         uint256 ta = totalAssets();
//         return ts == 0 || ta == 0 ? assets : (assets * ts) / ta;
//     }

//     function convertToAssets(uint256 shares) public view returns (uint256) {
//         uint256 ts = totalSupply;
//         uint256 ta = totalAssets();
//         return ts == 0 ? shares : (shares * ta) / ts;
//     }

//     // -----------------
//     // User actions
//     // -----------------
//     function deposit(
//         uint256 assets,
//         address receiver
//     ) external returns (uint256 shares) {
//         require(totalAssets() + assets <= depositCap, "CAP");
//         asset.safeTransferFrom(msg.sender, address(this), assets);
//         (uint256 net, ) = fees.takeEntryFee(assets);
//         shares = convertToShares(net);
//         _mint(receiver, shares);
//         emit Deposit(msg.sender, receiver, assets, shares);
//     }

//     function withdraw(
//         uint256 shares,
//         address receiver
//     ) external returns (uint256 assets) {
//         require(balanceOf[msg.sender] >= shares, "BALANCE");
//         assets = convertToAssets(shares);
//         _burn(msg.sender, shares);
//         // try using idle cash first
//         uint256 idle = _assetBal();
//         if (idle < assets) {
//             // pull shortfall from strategies pro-rata (naive)
//             uint256 shortfall = assets - idle;
//             for (uint256 i; i < strategies.length && shortfall > 0; i++) {
//                 uint256 got = strategies[i].withdraw(shortfall);
//                 shortfall -= got;
//             }
//         }
//         (uint256 net, ) = fees.takeExitFee(assets);
//         asset.safeTransfer(receiver, net);
//         emit Withdraw(msg.sender, receiver, net, shares);
//     }

//     // -----------------
//     // Management
//     // -----------------
//     function setStrategy(IStrategy s, uint16 bps) external onlyManager {
//         require(s.want() == asset, "STRAT_WANT");
//         if (!_hasStrategy(s)) strategies.push(s);
//         targetBps[s] = bps;
//         emit StrategySet(address(s), bps);
//     }

//     function investIdle() external onlyManager {
//         uint256 idle = _assetBal();
//         for (uint256 i; i < strategies.length; i++) {
//             IStrategy s = strategies[i];
//             uint256 toSend = (idle * targetBps[s]) / 1e4;
//             if (toSend > 0) {
//                 asset.safeApprove(address(s), 0);
//                 asset.safeApprove(address(s), toSend);
//                 s.deposit(toSend);
//             }
//         }
//     }

//     function harvestAll() external onlyKeeper {
//         require(
//             block.timestamp >= lastHarvest + minHarvestInterval,
//             "HARVEST_COOLDOWN"
//         );
//         uint256 beforeTA = totalAssets();
//         uint256 profit;
//         for (uint256 i; i < strategies.length; i++) {
//             profit += strategies[i].harvest();
//         }
//         uint256 tvlAfter = totalAssets();
//         // charge mgmt fee (and optionally perf fee on profit)
//         uint256 mgmt = fees.computeMgmtFee(tvlAfter);
//         if (mgmt > 0) asset.safeTransfer(address(fees), mgmt);
//         fees.onFeesCharged();
//         lastHarvest = block.timestamp;
//         emit Harvest(profit, tvlAfter);
//     }

//     // -----------------
//     // Internals
//     // -----------------
//     function _assetBal() internal view returns (uint256) {
//         return IERC20(asset).balanceOf(address(this));
//     }

//     function _mint(address to, uint256 amount) internal {
//         totalSupply += amount;
//         balanceOf[to] += amount;
//     }

//     function _burn(address from, uint256 amount) internal {
//         balanceOf[from] -= amount;
//         totalSupply -= amount;
//     }

//     function _hasStrategy(IStrategy s) internal view returns (bool) {
//         for (uint256 i; i < strategies.length; i++)
//             if (address(strategies[i]) == address(s)) return true;
//         return false;
//     }
// }
