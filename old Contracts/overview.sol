// // SPDX-License-Identifier: MIT
// // Velvet-Style DeFAI MVP – Core Contracts (Solidity)
// // -------------------------------------------------
// // NOTE: This is an MVP reference implementation meant for learning + starting a prototype.
// // It intentionally simplifies many production concerns (permit2, advanced MEV-protection,
// // full oracle safety, precise math libs, upgrade patterns, multi-chain messaging, etc.).
// // Use OpenZeppelin ^5.x and test thoroughly. Treat as a scaffold, not final production code.
// //
// // Contracts included below (single file for readability; split into files in real repo):
// //  - interfaces/IStrategy.sol
// //  - interfaces/IExchangeHandler.sol
// //  - interfaces/IOracleRouter.sol
// //  - core/AccessController.sol
// //  - core/FeeModule.sol
// //  - core/IndexSwap.sol
// //  - core/ExchangeHandler.sol (minimal DEX router adapter)
// //  - core/Vault.sol (ERC4626-based)
// //  - core/PortfolioFactory.sol
// //  - strategies/AaveV3Strategy.sol (skeleton)
// //  - strategies/UniswapV3Strategy.sol (skeleton)
// //  - utils/SafeTransferLib.sol (lightweight helper for transfers)
// //
// // ---------------------------
// // interfaces/IStrategy.sol
// // ---------------------------
// pragma solidity ^0.8.24;

// interface IStrategy {
//     /// @notice underlying asset token this strategy expects (the Vault's asset)
//     function want() external view returns (address);

//     /// @notice total value of this strategy denominated in `want`
//     function totalAssets() external view returns (uint256);

//     /// @notice deposit `amount` of want from caller (Vault) into external protocol
//     function deposit(uint256 amount) external;

//     /// @notice withdraw exact `amount` of want back to caller (Vault)
//     function withdraw(uint256 amount) external returns (uint256 withdrawn);

//     /// @notice withdraw everything to caller (Vault), return amount of want withdrawn
//     function withdrawAll() external returns (uint256 withdrawn);

//     /// @notice claim and compound rewards; return realized profit in `want`
//     function harvest() external returns (uint256 profit);
// }

// // ---------------------------------
// // interfaces/IExchangeHandler.sol
// // ---------------------------------
// interface IExchangeHandler {
//     /// @dev generic swap using encoded params (router, path, minOut, deadline, etc.)
//     /// implementers may support multiple DEXs behind a single entrypoint.
//     function swap(bytes calldata data) external returns (uint256 amountOut);

//     /// @dev convenience: swap exact tokens for tokens with common params
//     function swapExact(
//         address tokenIn,
//         address tokenOut,
//         uint256 amountIn,
//         uint256 minOut,
//         address to
//     ) external returns (uint256 amountOut);
// }

// // -------------------------------
// // interfaces/IOracleRouter.sol
// // -------------------------------
// interface IOracleRouter {
//     /// @notice return price with 1e18 decimals: price(want) in USD (or a common numeraire)
//     function price(address token) external view returns (uint256);
//     function isPriceStale(address token) external view returns (bool);
// }

// // ---------------------------
// // utils/SafeTransferLib.sol
// // ---------------------------
// library SafeTransferLib {
//     function safeTransfer(address token, address to, uint256 amount) internal {
//         (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
//         require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
//     }

//     function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
//         (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
//         require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FROM_FAILED");
//     }

//     function safeApprove(address token, address spender, uint256 amount) internal {
//         (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0x095ea7b3, spender, amount));
//         require(ok && (data.length == 0 || abi.decode(data, (bool))), "APPROVE_FAILED");
//     }
// }

// // ---------------------------
// // core/AccessController.sol
// // ---------------------------
// contract AccessController {
//     address public owner;          // protocol owner (can be DAO multisig)
//     mapping(address => bool) public managers;    // allowed to operate vaults
//     mapping(address => bool) public keepers;     // bots allowed to call keeper funcs

//     event OwnerUpdated(address indexed newOwner);
//     event ManagerSet(address indexed who, bool allowed);
//     event KeeperSet(address indexed who, bool allowed);

//     modifier onlyOwner() { require(msg.sender == owner, "NOT_OWNER"); _; }
//     modifier onlyManager() { require(managers[msg.sender], "NOT_MANAGER"); _; }
//     modifier onlyKeeper() { require(keepers[msg.sender], "NOT_KEEPER"); _; }

//     constructor(address _owner) { owner = _owner; }

//     function setOwner(address _owner) external onlyOwner { owner = _owner; emit OwnerUpdated(_owner); }
//     function setManager(address who, bool ok) external onlyOwner { managers[who] = ok; emit ManagerSet(who, ok); }
//     function setKeeper(address who, bool ok) external onlyOwner { keepers[who] = ok; emit KeeperSet(who, ok); }
// }

// // -----------------------
// // core/FeeModule.sol
// // -----------------------
// contract FeeModule {
//     using SafeTransferLib for address;

//     address public immutable asset; // vault asset
//     address public treasury;

//     // fees in bps (1e4 = 100%)
//     uint16 public managementFeeBps;   // annualized, charged on harvest/rebalance using time pro-rate
//     uint16 public performanceFeeBps;  // on realized gains at harvest
//     uint16 public entryFeeBps;        // on deposit
//     uint16 public exitFeeBps;         // on withdraw

//     uint256 public lastFeeTimestamp;  // for mgmt fee accrual

//     address public governor;          // authority to update fees (time-locked in prod)

//     event FeesUpdated(uint16 mgmt, uint16 perf, uint16 entry, uint16 exit);
//     event TreasuryUpdated(address treasury);

//     modifier onlyGovernor() { require(msg.sender == governor, "NOT_GOV"); _; }

//     constructor(address _asset, address _treasury, address _governor) {
//         asset = _asset; treasury = _treasury; governor = _governor; lastFeeTimestamp = block.timestamp;
//     }

//     function setTreasury(address t) external onlyGovernor { treasury = t; emit TreasuryUpdated(t); }

//     function setFees(uint16 mgmt, uint16 perf, uint16 entryF, uint16 exitF) external onlyGovernor {
//         require(mgmt <= 2000 && perf <= 3000 && entryF <= 300 && exitF <= 300, "FEE_BOUNDS");
//         managementFeeBps = mgmt; performanceFeeBps = perf; entryFeeBps = entryF; exitFeeBps = exitF;
//         emit FeesUpdated(mgmt, perf, entryF, exitF);
//     }

//     /// @dev charge entry fee, returns net amount after fee and feeAmount
//     function takeEntryFee(uint256 amount) external returns (uint256 net, uint256 fee) {
//         fee = (amount * entryFeeBps) / 1e4;
//         if (fee > 0) asset.safeTransfer(treasury, fee);
//         net = amount - fee;
//     }

//     /// @dev charge exit fee
//     function takeExitFee(uint256 amount) external returns (uint256 net, uint256 fee) {
//         fee = (amount * exitFeeBps) / 1e4;
//         if (fee > 0) asset.safeTransfer(treasury, fee);
//         net = amount - fee;
//     }

//     /// @dev charge mgmt + performance fee; caller must transfer fee from Vault to treasury
//     function computeMgmtFee(uint256 tvl) public view returns (uint256) {
//         if (managementFeeBps == 0) return 0;
//         uint256 dt = block.timestamp - lastFeeTimestamp; // seconds
//         // annualized pro-rata: tvl * rate * dt / (365 days)
//         return (tvl * managementFeeBps * dt) / (365 days * 1e4);
//     }

//     function onFeesCharged() external { lastFeeTimestamp = block.timestamp; }
// }

// // -----------------------
// // core/IndexSwap.sol
// // -----------------------
// contract IndexSwap {
//     using SafeTransferLib for address;

//     struct TokenWeight { address token; uint32 bps; } // sum bps = 1e4

//     address public asset;                 // vault asset (numeraire for accounting)
//     IOracleRouter public oracle;          // price source
//     IExchangeHandler public exchanger;    // DEX router adapter

//     uint256 public cooldown;              // seconds between rebalances
//     uint256 public lastRebalance;

//     TokenWeight[] public targets;         // target weights for portfolio tokens

//     address public manager;               // vault/manager that can call rebalance

//     event Rebalanced(uint256 timestamp);
//     event TargetsUpdated();

//     modifier onlyManager() { require(msg.sender == manager, "NOT_MANAGER"); _; }
//     modifier cooldownElapsed() { require(block.timestamp >= lastRebalance + cooldown, "COOLDOWN"); _; }

//     constructor(address _asset, address _oracle, address _exchanger, address _manager, uint256 _cooldown, TokenWeight[] memory _targets){
//         asset = _asset; oracle = IOracleRouter(_oracle); exchanger = IExchangeHandler(_exchanger); manager = _manager; cooldown = _cooldown;
//         _setTargets(_targets);
//         lastRebalance = block.timestamp;
//     }

//     function _setTargets(TokenWeight[] memory _targets) internal {
//         delete targets;
//         uint256 sum;
//         for (uint256 i; i < _targets.length; i++) {
//             targets.push(_targets[i]); sum += _targets[i].bps;
//         }
//         require(sum == 1e4, "BAD_WEIGHTS");
//         emit TargetsUpdated();
//     }

//     function updateTargets(TokenWeight[] calldata _targets) external onlyManager { _setTargets(_targets); }
//     function setCooldown(uint256 s) external onlyManager { cooldown = s; }

//     /// @notice simplistic rebalance: bring each token to target weight by swapping via ExchangeHandler.
//     /// Caller must have custody of portfolio tokens (e.g., Vault calling this with allowances set).
//     function rebalance(bytes[] calldata swapCalldatas) external onlyManager cooldownElapsed {
//         // Off-chain bot computes required deltas and provides encoded swaps in order.
//         for (uint256 i; i < swapCalldatas.length; i++) {
//             exchanger.swap(swapCalldatas[i]);
//         }
//         lastRebalance = block.timestamp; emit Rebalanced(block.timestamp);
//     }
// }

// // ----------------------------
// // core/ExchangeHandler.sol
// // ----------------------------
// contract ExchangeHandler is IExchangeHandler {
//     using SafeTransferLib for address;

//     address public owner;
//     event OwnerUpdated(address indexed);

//     // whitelisted routers -> true
//     mapping(address => bool) public routers;

//     event RouterSet(address indexed router, bool allowed);

//     modifier onlyOwner() { require(msg.sender == owner, "NOT_OWNER"); _; }

//     constructor(address _owner) { owner = _owner; }
//     function setOwner(address _owner) external onlyOwner { owner = _owner; emit OwnerUpdated(_owner); }
//     function setRouter(address router, bool ok) external onlyOwner { routers[router] = ok; emit RouterSet(router, ok); }

//     /// @dev data layout (example): abi.encode(
//     ///   router, tokenIn, tokenOut, amountIn, minOut, path[], deadline, routerSelector
//     /// )
//     function swap(bytes calldata data) external override returns (uint256 amountOut) {
//         (
//             address router,
//             address tokenIn,
//             address tokenOut,
//             uint256 amountIn,
//             uint256 minOut,
//             address to,
//             bytes memory routerCalldata
//         ) = abi.decode(data, (address, address, address, uint256, uint256, address, bytes));
//         require(routers[router], "ROUTER_NOT_ALLOWED");
//         tokenIn.safeApprove(router, 0);
//         tokenIn.safeApprove(router, amountIn);
//         (bool ok, bytes memory ret) = router.call(routerCalldata);
//         require(ok, "ROUTER_CALL_FAIL");
//         // parse return to get amountOut if needed; for simplicity rely on balance diff
//         uint256 balBefore = _balance(tokenOut, to);
//         // NOTE: in practice, we should compute before/after within this contract and then transfer.
//         // Here we assume router sends tokens directly to `to`.
//         uint256 balAfter = _balance(tokenOut, to);
//         require(balAfter >= balBefore + minOut, "SLIPPAGE");
//         amountOut = balAfter - balBefore;
//     }

//     function swapExact(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
//         external override returns (uint256 amountOut)
//     {
//         // Example for UniswapV2-like routers: selector 0x38ed1739 swapExactTokensForTokens
//         address router = _pickAnyRouter();
//         bytes memory callData = abi.encodeWithSelector(
//             bytes4(0x38ed1739), amountIn, minOut, _simplePath(tokenIn, tokenOut), to, block.timestamp
//         );
//         bytes memory pack = abi.encode(router, tokenIn, tokenOut, amountIn, minOut, to, callData);
//         amountOut = swap(pack);
//     }

//     function _pickAnyRouter() internal view returns (address r) {
//         // naive: pick first allowed router. In prod, off-chain bot sets router per swap.
//         // iterate mapping not possible; maintain an array in prod. Hardcode for MVP.
//         revert("NO_DEFAULT_ROUTER");
//     }

//     function _balance(address token, address who) internal view returns (uint256) {
//         (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
//         require(ok, "BALANCE_FAIL");
//         return abi.decode(data, (uint256));
//     }

//     function _simplePath(address a, address b) internal pure returns (address[] memory p) {
//         p = new address[](2); p[0] = a; p[1] = b;
//     }
// }

// // -------------------
// // core/Vault.sol
// // -------------------
// interface IERC20 { function totalSupply() external view returns (uint256); function balanceOf(address) external view returns (uint256); function transfer(address,uint256) external returns (bool); function allowance(address,address) external view returns (uint256); function approve(address,uint256) external returns (bool); function transferFrom(address,address,uint256) external returns (bool); function decimals() external view returns (uint8); }

// contract Vault {
//     using SafeTransferLib for address;

//     // --- Config ---
//     string public name; string public symbol; uint8 public immutable decimals;
//     address public immutable asset;              // ERC20 underlying (e.g., USDC)
//     AccessController public access;              // role control
//     FeeModule public fees;                       // fee module
//     IOracleRouter public oracle;                 // price sanity if needed

//     // --- ERC4626-ish shares ---
//     uint256 public totalSupply;                  // total shares
//     mapping(address => uint256) public balanceOf;

//     // --- Strategies ---
//     IStrategy[] public strategies;
//     mapping(IStrategy => uint16) public targetBps; // target allocation per strategy (sum <= 1e4)

//     // --- Limits & Timers ---
//     uint256 public depositCap;                   // max TVL
//     uint256 public minHarvestInterval;           // seconds
//     uint256 public lastHarvest;

//     event Deposit(address indexed from, address indexed to, uint256 assets, uint256 shares);
//     event Withdraw(address indexed caller, address indexed to, uint256 assets, uint256 shares);
//     event Harvest(uint256 profit, uint256 tvlAfter);
//     event StrategySet(address strategy, uint16 bps);

//     modifier onlyManager() { require(access.managers(msg.sender), "NOT_MANAGER"); _; }
//     modifier onlyKeeper() { require(access.keepers(msg.sender), "NOT_KEEPER"); _; }

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
//         asset = _asset; name = _name; symbol = _symbol; access = AccessController(_access); fees = FeeModule(_fees); oracle = IOracleRouter(_oracle); depositCap = _depositCap; decimals = _decimals;
//     }

//     // -----------------
//     // View helpers
//     // -----------------
//     function totalAssets() public view returns (uint256 t) {
//         t = _assetBal();
//         for (uint256 i; i < strategies.length; i++) t += strategies[i].totalAssets();
//     }

//     function convertToShares(uint256 assets) public view returns (uint256) {
//         uint256 ts = totalSupply; uint256 ta = totalAssets();
//         return ts == 0 || ta == 0 ? assets : (assets * ts) / ta;
//     }

//     function convertToAssets(uint256 shares) public view returns (uint256) {
//         uint256 ts = totalSupply; uint256 ta = totalAssets();
//         return ts == 0 ? shares : (shares * ta) / ts;
//     }

//     // -----------------
//     // User actions
//     // -----------------
//     function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
//         require(totalAssets() + assets <= depositCap, "CAP");
//         asset.safeTransferFrom(msg.sender, address(this), assets);
//         (uint256 net,) = fees.takeEntryFee(assets);
//         shares = convertToShares(net);
//         _mint(receiver, shares);
//         emit Deposit(msg.sender, receiver, assets, shares);
//     }

//     function withdraw(uint256 shares, address receiver) external returns (uint256 assets) {
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
//         (uint256 net,) = fees.takeExitFee(assets);
//         asset.safeTransfer(receiver, net);
//         emit Withdraw(msg.sender, receiver, net, shares);
//     }

//     // -----------------
//     // Management
//     // -----------------
//     function setStrategy(IStrategy s, uint16 bps) external onlyManager {
//         require(s.want() == asset, "STRAT_WANT");
//         if (!_hasStrategy(s)) strategies.push(s);
//         targetBps[s] = bps; emit StrategySet(address(s), bps);
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
//         require(block.timestamp >= lastHarvest + minHarvestInterval, "HARVEST_COOLDOWN");
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
//         lastHarvest = block.timestamp; emit Harvest(profit, tvlAfter);
//     }

//     // -----------------
//     // Internals
//     // -----------------
//     function _assetBal() internal view returns (uint256) { return IERC20(asset).balanceOf(address(this)); }

//     function _mint(address to, uint256 amount) internal { totalSupply += amount; balanceOf[to] += amount; }
//     function _burn(address from, uint256 amount) internal { balanceOf[from] -= amount; totalSupply -= amount; }
//     function _hasStrategy(IStrategy s) internal view returns (bool) { for (uint256 i; i < strategies.length; i++) if (address(strategies[i]) == address(s)) return true; return false; }
// }

// // ---------------------------
// // core/PortfolioFactory.sol
// // ---------------------------
// contract PortfolioFactory {
//     event VaultDeployed(address vault, address asset, string name, string symbol);

//     function deployVault(
//         address asset,
//         string calldata name_,
//         string calldata symbol_,
//         address access,
//         address fees,
//         address oracle,
//         uint256 cap,
//         uint8 decimals_
//     ) external returns (address vault) {
//         vault = address(new Vault(asset, name_, symbol_, access, fees, oracle, cap, decimals_));
//         emit VaultDeployed(vault, asset, name_, symbol_);
//     }
// }

// // ---------------------------------
// // strategies/AaveV3Strategy.sol
// // ---------------------------------
// interface IAavePool { function supply(address asset, uint256 amount, address onBehalf, uint16) external; function withdraw(address asset, uint256 amount, address to) external returns (uint256); }

// contract AaveV3Strategy is IStrategy {
//     using SafeTransferLib for address;

//     address public immutable wantToken;
//     IAavePool public immutable aave;
//     address public vault; // only Vault can call state-changing methods

//     modifier onlyVault() { require(msg.sender == vault, "NOT_VAULT"); _; }

//     constructor(address _want, address _aave, address _vault) { wantToken = _want; aave = IAavePool(_aave); vault = _vault; }

//     function want() external view override returns (address) { return wantToken; }

//     function totalAssets() public view override returns (uint256) {
//         // Simplified: return this contract's want balance + supplied aToken balance (omitted for brevity)
//         // In production, read aToken balance via IERC20(aToken).balanceOf(address(this)) and map 1:1 to want.
//         return _bal();
//     }

//     function deposit(uint256 amount) external override onlyVault {
//         wantToken.safeApprove(address(aave), 0);
//         wantToken.safeApprove(address(aave), amount);
//         aave.supply(wantToken, amount, address(this), 0);
//     }

//     function withdraw(uint256 amount) external override onlyVault returns (uint256 withdrawn) {
//         withdrawn = aave.withdraw(wantToken, amount, vault);
//     }

//     function withdrawAll() external override onlyVault returns (uint256 withdrawn) {
//         // use max uint to withdraw all
//         withdrawn = aave.withdraw(wantToken, type(uint256).max, vault);
//     }

//     function harvest() external override onlyVault returns (uint256 profit) {
//         // Claim incentives (not implemented) -> swap to want via Vault/ExchangeHandler if desired.
//         // Return realized profit amount in want.
//         return 0;
//     }

//     function _bal() internal view returns (uint256) {
//         (bool ok, bytes memory data) = wantToken.staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
//         require(ok, "BAL_VIEW_FAIL");
//         return abi.decode(data, (uint256));
//     }
// }

// // --------------------------------------
// // strategies/UniswapV3Strategy.sol
// // --------------------------------------
// interface INonfungiblePositionManager {
//     struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }
//     function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
//     function collect(bytes calldata params) external payable returns (uint256 amount0, uint256 amount1);
// }

// contract UniswapV3Strategy is IStrategy {
//     using SafeTransferLib for address;

//     address public immutable wantToken; // e.g., USDC as numeraire; position value translated into want
//     INonfungiblePositionManager public immutable pm;
//     address public vault;

//     uint256 public posId; // NOT SAFE in prod; use proper storage types & position mgmt

//     modifier onlyVault() { require(msg.sender == vault, "NOT_VAULT"); _; }

//     constructor(address _want, address _pm, address _vault) { wantToken = _want; pm = INonfungiblePositionManager(_pm); vault = _vault; }

//     function want() external view override returns (address) { return wantToken; }

//     function totalAssets() external view override returns (uint256) {
//         // Omitted: read position liquidity and convert amounts to `want` using oracle math.
//         return 0;
//     }

//     function deposit(uint256 amount) external override onlyVault {
//         // Omitted: split want into token0/token1 by swapping via Vault's ExchangeHandler; then PM.mint(...)
//     }

//     function withdraw(uint256 amount) external override onlyVault returns (uint256 withdrawn) {
//         // Omitted: decrease liquidity & swap tokens back to want; transfer to vault
//         return 0;
//     }

//     function withdrawAll() external override onlyVault returns (uint256 withdrawn) {
//         // Omitted: close position, collect fees, swap back to want; transfer to vault
//         return 0;
//     }

//     function harvest() external override onlyVault returns (uint256 profit) {
//         // Omitted: PM.collect fees, convert to want, optionally rebalance ticks
//         return 0;
//     }
// }
