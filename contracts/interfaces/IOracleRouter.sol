// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracleRouter {
    /// @notice return price with 1e18 decimals: price(want) in USD (or a common numeraire)
    function price(address token) external view returns (uint256);
    function isPriceStale(address token) external view returns (bool);
}
