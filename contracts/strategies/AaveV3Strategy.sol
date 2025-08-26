// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../utils/SafeTransferLib.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IStrategy {
    function want() external view returns (address);
    function totalAssets() external view returns (uint256);
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256);
    function withdrawAll() external returns (uint256);
    function harvest() external returns (uint256);
}

contract AaveV3Strategy is IStrategy {
    using SafeTransferLib for address;

    address public immutable vault;       // only Vault can call state-changing fns
    address public immutable wantToken;   // underlying (e.g., USDC)
    address public immutable aToken;      // interest-bearing token 1:1 redeemable to want
    IAavePool public immutable aave;

    modifier onlyVault() { require(msg.sender == vault, "NOT_VAULT"); _; }

    constructor(address _vault, address _want, address _aToken, address _aavePool) {
        require(_vault != address(0) && _want != address(0) && _aToken != address(0) && _aavePool != address(0), "BAD_ADDR");
        vault = _vault;
        wantToken = _want;
        aToken = _aToken;
        aave = IAavePool(_aavePool);
    }

    // ---- View ----
    function want() external view override returns (address) { return wantToken; }

    function totalAssets() public view override returns (uint256) {
        // aToken balance represents our underlying claim (principal + interest)
        return IERC20(aToken).balanceOf(address(this));
    }

    // ---- Vault calls ----
    function deposit(uint256 amount) external override onlyVault {
        // Vault must transfer `amount` of want to this contract before calling
        wantToken.safeApprove(address(aave), 0);
        wantToken.safeApprove(address(aave), amount);
        aave.supply(wantToken, amount, address(this), 0);
    }

    function withdraw(uint256 amount) external override onlyVault returns (uint256 withdrawn) {
        // Pull `amount` want back to the Vault
        withdrawn = aave.withdraw(wantToken, amount, vault);
    }

    function withdrawAll() external override onlyVault returns (uint256 withdrawn) {
        withdrawn = aave.withdraw(wantToken, type(uint256).max, vault);
    }

    /// @notice No-op for pure lending: interest accrues in aToken
    function harvest() external override onlyVault returns (uint256) {
        return 0;
    }
}
