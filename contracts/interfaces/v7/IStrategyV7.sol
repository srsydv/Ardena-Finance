// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

interface IStrategy {
    function want() external view returns (address);
    function totalAssets() external view returns (uint256);
    function deposit(uint256 amountWant, bytes[] calldata swapCalldatas) external;
    function withdraw(uint256 amount, bytes[] calldata swapCalldatas) external returns (uint256 withdrawn);
    function withdrawAll() external returns (uint256 withdrawn);
    function harvest(bytes[] calldata swapCalldatas) external returns (uint256 profit);
}
