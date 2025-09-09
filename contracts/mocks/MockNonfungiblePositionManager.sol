// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// interface IERC20 {
//     function transfer(address to, uint256 amount) external returns (bool);
//     function transferFrom(address from, address to, uint256 amount) external returns (bool);
// }

// contract MockNonfungiblePositionManager {
//     struct Position {
//         address token0;
//         address token1;
//         uint24 fee;
//         int24 tickLower;
//         int24 tickUpper;
//         uint128 liquidity;
//         uint128 tokensOwed0;
//         uint128 tokensOwed1;
//     }

//     mapping(uint256 => Position) public positions;
//     uint256 public nextId = 1;

//     event Minted(uint256 id, address token0, address token1, uint128 liquidity);

//     // Mint creates a position and stores token amounts as "balances" in the contract.
//     function mint(
//         address token0,
//         address token1,
//         uint24 fee,
//         int24 tickLower,
//         int24 tickUpper,
//         uint256 amount0Desired,
//         uint256 amount1Desired,
//         uint256, // min0
//         uint256, // min1
//         address recipient,
//         uint256
//     ) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
//         tokenId = nextId++;
//         // naive liquidity bookkeeping - treat amount sum as liquidity for tests
//         liquidity = uint128((amount0Desired + amount1Desired) / 1); // simple
//         positions[tokenId] = Position({
//             token0: token0,
//             token1: token1,
//             fee: fee,
//             tickLower: tickLower,
//             tickUpper: tickUpper,
//             liquidity: liquidity,
//             tokensOwed0: 0,
//             tokensOwed1: 0
//         });
//         // The contract expects caller to have already transferred tokens to this contract
//         emit Minted(tokenId, token0, token1, liquidity);
//         amount0 = amount0Desired;
//         amount1 = amount1Desired;
//     }

//     function increaseLiquidity(
//         uint256 tokenId,
//         uint256 amount0Desired,
//         uint256 amount1Desired,
//         uint256, uint256, uint256
//     ) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
//         Position storage p = positions[tokenId];
//         liquidity = uint128(uint256(p.liquidity) + (amount0Desired + amount1Desired));
//         p.liquidity = liquidity;
//         amount0 = amount0Desired;
//         amount1 = amount1Desired;
//     }

//     function decreaseLiquidity(
//         uint256 tokenId,
//         uint128 liquidityAmount,
//         uint256, uint256, uint256
//     ) external payable returns (uint256 amount0, uint256 amount1) {
//         Position storage p = positions[tokenId];
//         if (liquidityAmount > p.liquidity) liquidityAmount = p.liquidity;
//         // simple ratio: return proportional amounts (for tests we just return liquidityAmount/2)
//         amount0 = uint256(liquidityAmount) / 2;
//         amount1 = uint256(liquidityAmount) / 2;
//         p.liquidity -= liquidityAmount;
//     }

//     function collect(uint256 tokenId, address recipient, uint128, uint128) external payable returns (uint256 amount0, uint256 amount1) {
//         Position storage p = positions[tokenId];
//         amount0 = p.tokensOwed0;
//         amount1 = p.tokensOwed1;
//         p.tokensOwed0 = 0;
//         p.tokensOwed1 = 0;
//         // send via ERC20 transfers - for tests, positions should have token balances in contract
//         if (amount0 > 0) { IERC20(p.token0).transfer(recipient, amount0); }
//         if (amount1 > 0) { IERC20(p.token1).transfer(recipient, amount1); }
//     }

//     // read-only positions() matching the real interface
//     function positionsView(uint256 tokenId) external view returns (
//         uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128
//     ) {
//         Position storage p = positions[tokenId];
//         // return slightly different shaping to match your pm interface ordering; adapt if needed
//         return (0, address(this), p.token0, p.token1, p.fee, p.tickLower, p.tickUpper, p.liquidity, 0, 0, p.tokensOwed0, p.tokensOwed1);
//     }

//     // Helper: allow your test script to credit fees to a position
//     function creditFees(uint256 tokenId, uint128 owed0, uint128 owed1) external {
//         Position storage p = positions[tokenId];
//         p.tokensOwed0 += owed0;
//         p.tokensOwed1 += owed1;
//     }

//     // Convenience wrapper in real Uniswap pm.positions index ordering might differ — adjust your strategy test to call positionsView if needed
// }
