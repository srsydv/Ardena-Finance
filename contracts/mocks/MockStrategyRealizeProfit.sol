// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../utils/SafeTransferLib.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

interface IStrategy {
    function want() external view returns (address);
    function totalAssets() external view returns (uint256);
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256);
    function withdrawAll() external returns (uint256);
    function harvest() external returns (uint256);
}

/// @dev Uni V3–like mock: profit is realized on harvest.
///      We track `principal` and EXCLUDE "pending" fees from totalAssets()
///      until harvest() transfers them to the Vault.
contract MockStrategyRealizeProfit is IStrategy {
    using SafeTransferLib for address;
    address public immutable vault;
    address public immutable wantToken;

    uint256 public principal; // tracked principal that counts toward totalAssets()

    modifier onlyVault() {
        require(msg.sender == vault, "NOT_VAULT");
        _;
    }

    constructor(address _vault, address _want) {
        vault = _vault;
        wantToken = _want;
    }

    function want() external view returns (address) { return wantToken; }

    function totalAssets() public view returns (uint256) {
        // Only principal counts (pending = balance - principal is excluded)
        return principal;
    }

    /// @notice Vault should have transferred `amount` here first (in your investIdle()).
    function deposit(uint256 amount) external onlyVault {
        wantToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) external onlyVault returns (uint256) {
        // Send requested amount and reduce principal (clamp to principal)
        if (amount > principal) amount = principal;
        principal -= amount;
        IERC20(wantToken).transfer(vault, amount);
        return amount;
    }

    function withdrawAll() external onlyVault returns (uint256) {
        uint256 bal = IERC20(wantToken).balanceOf(address(this));
        uint256 prin = principal;
        principal = 0;
        IERC20(wantToken).transfer(vault, bal);
        return prin; // returning principal redeemed; test doesn't rely on this value
    }

    function harvest() external onlyVault returns (uint256 realized) {
        uint256 bal = IERC20(wantToken).balanceOf(address(this));
        // pending = everything above principal
        if (bal > principal) {
            realized = bal - principal;
            // transfer ONLY the pending (fees) to vault; principal stays invested
            IERC20(wantToken).transfer(vault, realized);
        } else {
            realized = 0;
        }
        return realized;
    }
}
