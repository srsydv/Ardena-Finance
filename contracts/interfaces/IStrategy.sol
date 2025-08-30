// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStrategy {
    /// @notice underlying asset token this strategy expects (the Vault's asset)
    function want() external view returns (address);

    /// @notice total value of this strategy denominated in `want`
    function totalAssets() external view returns (uint256);

    /// @notice deposit `amount` of want from caller (Vault) into external protocol
    function deposit(uint256 amountWant, bytes[] calldata swapCalldatas) external;


    /// @notice withdraw exact `amount` of want back to caller (Vault)
    function withdraw(uint256 amount) external returns (uint256 withdrawn);

    /// @notice withdraw everything to caller (Vault), return amount of want withdrawn
    function withdrawAll() external returns (uint256 withdrawn);

    /// @notice claim and compound rewards; return realized profit in `want`
    function harvest(bytes[] calldata swapData) external returns (uint256 profit);
}
