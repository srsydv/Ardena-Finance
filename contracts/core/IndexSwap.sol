// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Vault.sol";
import "../interfaces/IStrategy.sol";
import "./AccessController.sol";

/// @title IndexSwap
/// @notice Rebalance engine for Vaults, enforcing cooldown and target allocations.
contract IndexSwap {
    Vault public immutable vault;
    AccessController public immutable access;

    uint256 public cooldown;        // min time between rebalances
    uint256 public lastRebalance;   // timestamp of last rebalance

    event Rebalanced(uint256 timestamp);
    event CooldownSet(uint256 cooldown);

    modifier onlyManager() {
        require(access.managers(msg.sender), "NOT_MANAGER");
        _;
    }

    constructor(address _vault, address _access, uint256 _cooldown) {
        require(_vault != address(0) && _access != address(0), "BAD_ADDR");
        vault = Vault(_vault);
        access = AccessController(_access);
        cooldown = _cooldown;
    }

    /// @notice Set a new cooldown (only DAO/owner in AccessManager can do this)
    function setCooldown(uint256 _cooldown) external onlyManager {
        cooldown = _cooldown;
        emit CooldownSet(_cooldown);
    }

    /// @notice Rebalance the vault according to new target weights
    /// @param withdrawAmounts how much to pull from each strategy
    /// @param withdrawSwapData calldata to convert withdrawn tokens into Vault.asset
    /// @param investSwapData calldata to reinvest idle into strategies
    function rebalance(
        uint256[] calldata withdrawAmounts,
        bytes[][] calldata withdrawSwapData,
        bytes[][] calldata investSwapData
    ) external onlyManager {
        require(block.timestamp >= lastRebalance + cooldown, "COOLDOWN");

        uint256 stratCount = vault.strategiesLength();
        require(withdrawAmounts.length == stratCount, "BAD_wAMOUNT_LEN");
        require(withdrawSwapData.length == stratCount, "BAD_wSWAPDATA_LEN");
        require(investSwapData.length == stratCount, "BAD_iSWAPDATA_LEN");

        // 1. Withdraw from over-allocated strategies
        for (uint256 i; i < stratCount; i++) {
            if (withdrawAmounts[i] > 0) {
                vault.withdrawFromStrategy(
                    vault.strategies(i),
                    withdrawAmounts[i],
                    withdrawSwapData[i]
                );
            }
        }

        // 2. Re-invest idle USDC into target weights
        vault.investIdle(investSwapData);

        // 3. Update state
        lastRebalance = block.timestamp;
        emit Rebalanced(block.timestamp);
    }
}
