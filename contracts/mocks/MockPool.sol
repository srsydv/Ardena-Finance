// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// contract MockPool {
//     address public token0;
//     address public token1;
//     uint24 public fee;
//     uint160 public sqrtPriceX96;
//     int24 public currentTick;
//     uint128 public liquidity;

//     constructor(address _t0, address _t1, uint24 _fee) {
//         token0 = _t0;
//         token1 = _t1;
//         fee = _fee;
//         sqrtPriceX96 = 0;
//         currentTick = 0;
//         liquidity = 0;
//     }

//     function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
//         return (sqrtPriceX96, currentTick, 0, 0, 0, 0, true);
//     }

//     function setSlot(uint160 _sqrt, int24 _tick) external {
//         sqrtPriceX96 = _sqrt;
//         currentTick = _tick;
//     }

//     function setLiquidity(uint128 _liquidity) external {
//         liquidity = _liquidity;
//     }

//     function token0Addr() external view returns (address) { return token0; }
//     function token1Addr() external view returns (address) { return token1; }

//     // For compatibility with IUniswapV3Pool interface names:
//     // function token0() external view returns (address) { return token0; }
//     // function token1() external view returns (address) { return token1; }
//     // function liquidity() external view returns (uint128) { return liquidity; }
//     function fee_() external view returns (uint24) { return fee; }
// }
