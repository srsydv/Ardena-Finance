// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A simple mintable ERC20 for testing
contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /// @notice Override decimals to allow custom test tokens (USDC=6, DAI=18, etc.)
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint function for tests
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
