// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// import "../interfaces/IStrategy.sol";
// import "../utils/SafeTransferLib.sol";

// interface INonfungiblePositionManager {
//     struct MintParams { 
//         address token0; 
//         address token1; 
//         uint24 fee; 
//         int24 tickLower; 
//         int24 tickUpper; 
//         uint256 amount0Desired; 
//         uint256 amount1Desired; 
//         uint256 amount0Min; 
//         uint256 amount1Min; 
//         address recipient; 
//         uint256 deadline; 
//     }
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
