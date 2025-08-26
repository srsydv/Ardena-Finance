// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IExchangeHandler {
    /// @dev generic swap using encoded params (router, path, minOut, deadline, etc.)
    /// implementers may support multiple DEXs behind a single entrypoint.
    function swap(bytes calldata data) external returns (uint256 amountOut);

    /// @dev convenience: swap exact tokens for tokens with common params
    function swapExact(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address to
    ) external returns (uint256 amountOut);
}
