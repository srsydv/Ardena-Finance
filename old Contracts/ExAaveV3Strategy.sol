// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// import "../interfaces/IStrategy.sol";
// import "../utils/SafeTransferLib.sol";

// interface IERC20 {
//     function balanceOf(address) external view returns (uint256);
//     function approve(address, uint256) external returns (bool);
// }

// interface IAavePool {
//     function supply(
//         address asset,
//         uint256 amount,
//         address onBehalf,
//         uint16
//     ) external;

//     function withdraw(
//         address asset,
//         uint256 amount,
//         address to
//     ) external returns (uint256);
// }

// contract AaveV3Strategy is IStrategy {
//     using SafeTransferLib for address;

//     address public immutable wantToken;
//     IAavePool public immutable aave;
//     address public vault; // only Vault can call state-changing methods

//     modifier onlyVault() {
//         require(msg.sender == vault, "NOT_VAULT");
//         _;
//     }

//     constructor(address _want, address _aave, address _vault) {
//         wantToken = _want;
//         aave = IAavePool(_aave);
//         vault = _vault;
//     }

//     function want() external view override returns (address) {
//         return wantToken;
//     }

//     function totalAssets() public view override returns (uint256) {
//         // aToken balance represents our underlying claim (principal + interest)
//         return IERC20(aToken).balanceOf(address(this));
//     }

//     function deposit(uint256 amount) external override onlyVault {
//         wantToken.safeApprove(address(aave), 0);
//         wantToken.safeApprove(address(aave), amount);
//         aave.supply(wantToken, amount, address(this), 0);
//     }

//     function withdraw(
//         uint256 amount
//     ) external override onlyVault returns (uint256 withdrawn) {
//         withdrawn = aave.withdraw(wantToken, amount, vault);
//     }

//     function withdrawAll()
//         external
//         override
//         onlyVault
//         returns (uint256 withdrawn)
//     {
//         // use max uint to withdraw all
//         withdrawn = aave.withdraw(wantToken, type(uint256).max, vault);
//     }

//     function harvest() external override onlyVault returns (uint256 profit) {
//         // Claim incentives (not implemented) -> swap to want via Vault/ExchangeHandler if desired.
//         // Return realized profit amount in want.
//         return 0;
//     }

//     function _bal() internal view returns (uint256) {
//         (bool ok, bytes memory data) = wantToken.staticcall(
//             abi.encodeWithSelector(0x70a08231, address(this))
//         );
//         require(ok, "BAL_VIEW_FAIL");
//         return abi.decode(data, (uint256));
//     }
// }

function deposit(uint256 amountWant, bytes[] calldata swaps) external onlyVault {
    // Pull want or require it has been pushed, per your convention
    if (amountWant > 0 && IERC20(wantToken).balanceOf(address(this)) < amountWant) {
        IERC20(wantToken).transferFrom(vault, address(this), amountWant);
    }

    // Execute keeper-provided swaps to get token0/token1 proportions
    _executeSwaps(swaps);

    // Approve and mint Uni v3 position using current balances
    address t0 = pool.token0();
    address t1 = pool.token1();

    uint256 bal0 = IERC20(t0).balanceOf(address(this));
    uint256 bal1 = IERC20(t1).balanceOf(address(this));
    require(bal0 > 0 || bal1 > 0, "NO_FUNDS");

    t0.safeApprove(address(pm), 0); t0.safeApprove(address(pm), bal0);
    t1.safeApprove(address(pm), 0); t1.safeApprove(address(pm), bal1);

    (, int24 tick, , , , , ) = pool.slot0();
    int24 spacing = 60; // set by fee tier
    int24 lower = (tick/spacing - 100)*spacing;
    int24 upper = (tick/spacing + 100)*spacing;

    (uint256 _id,, ,) = pm.mint(
        INonfungiblePositionManager.MintParams({
            token0: t0, token1: t1, fee: _poolFeeTier,
            tickLower: lower, tickUpper: upper,
            amount0Desired: bal0, amount1Desired: bal1,
            amount0Min: 0, amount1Min: 0, // set in prod
            recipient: address(this), deadline: block.timestamp
        })
    );
    if (tokenId == 0) tokenId = _id;
    else require(tokenId == _id, "MULTI_POS_UNSUPPORTED");
}

function harvest(bytes[] calldata swaps) external onlyVault returns (uint256 profit) {
    if (tokenId == 0) return 0;
    // Collect fees from Uni v3
    (uint256 f0, uint256 f1) = pm.collect(
        INonfungiblePositionManager.CollectParams({
            tokenId: tokenId, recipient: address(this),
            amount0Max: type(uint128).max, amount1Max: type(uint128).max
        })
    );
    // Execute swaps to convert fee tokens into `want`
    uint256 before = IERC20(wantToken).balanceOf(address(this));
    _executeSwaps(swaps);
    uint256 afterBal = IERC20(wantToken).balanceOf(address(this));
    profit = afterBal > before ? afterBal - before : 0;
    if (profit > 0) wantToken.safeTransfer(vault, profit);
}

function withdraw(uint256 amountWant, bytes[] calldata swaps)
    external onlyVault returns (uint256 withdrawn)
{
    // Compute fraction to pull (use LiquidityAmounts as shown earlier)
    // decreaseLiquidity + collect ...
    // Then use keeper-provided `swaps` to convert token0/token1 to want:
    _executeSwaps(swaps);
    withdrawn = IERC20(wantToken).balanceOf(address(this));
    if (withdrawn > 0) wantToken.safeTransfer(vault, withdrawn);
}

