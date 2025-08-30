// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../utils/SafeTransferLib.sol";

interface IStrategy {
    function want() external view returns (address);

    function totalAssets() external view returns (uint256);

    function deposit(uint256) external;

    function withdraw(uint256) external returns (uint256);

    function withdrawAll() external returns (uint256);

    function harvest() external returns (uint256);
}

interface IERC20 {
    function transfer(address, uint256) external returns (bool);

    function transferFrom(address, address, uint256) external returns (bool);

    function balanceOf(address) external view returns (uint256);
}

contract MockStrategyMarkToMarket is IStrategy {
    using SafeTransferLib for address;
    address public immutable vault;
    address public immutable wantToken;

    modifier onlyVault() {
        require(msg.sender == vault, "NOT_VAULT");
        _;
    }

    constructor(address _vault, address _want) {
        vault = _vault;
        wantToken = _want;
    }

    function want() external view returns (address) {
        return wantToken;
    }

    function totalAssets() public view returns (uint256) {
        // Mark-to-market via raw token balance (tests mint to this contract to simulate interest)
        return IERC20(wantToken).balanceOf(address(this));
    }

    function deposit(uint256 amount) external onlyVault {
        wantToken.safeTransferFrom(msg.sender, address(this), amount);
        // Vault must have already transferred `amount` here (test will do it), so nothing else to do
    }

    function withdraw(uint256 amount, bytes[] calldata swapData) external onlyVault returns (uint256) {
        IERC20(wantToken).transfer(vault, amount);
        return amount;
    }

    function withdrawAll() external onlyVault returns (uint256) {
        uint256 bal = IERC20(wantToken).balanceOf(address(this));
        IERC20(wantToken).transfer(vault, bal);
        return bal;
    }

    function harvest(
        bytes[] calldata swapData
    ) external override returns (uint256) {
        // ... existing logic ...
        return 0;
    }
}
