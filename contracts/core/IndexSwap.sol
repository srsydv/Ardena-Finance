// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IStrategy.sol";
import "../core/Vault.sol";
import "../interfaces/IOracleRouter.sol";
import "../interfaces/IExchangeHandler.sol";

contract IndexSwap {
    struct TokenWeight {
        IStrategy strat;
        uint16 bps; // allocation in basis points (10000 = 100%)
    }

    Vault public immutable vault;
    IOracleRouter public oracle;
    IExchangeHandler public exchanger;

    uint256 public cooldown;
    uint256 public lastRebalance;
    TokenWeight[] public targets;

    address public manager;

    event TargetsUpdated(TokenWeight[] targets);
    event Rebalanced(uint256 timestamp);

    modifier onlyManager() {
        require(msg.sender == manager, "NOT_MANAGER");
        _;
    }

    constructor(
        address _vault,
        address _oracle,
        address _exchanger,
        address _manager,
        uint256 _cooldown
    ) {
        require(_vault != address(0) && _manager != address(0), "BAD_ADDR");
        vault = Vault(_vault);
        oracle = IOracleRouter(_oracle);
        exchanger = IExchangeHandler(_exchanger);
        manager = _manager;
        cooldown = _cooldown;
    }

    // ---------------- Config ----------------

    function updateTargets(TokenWeight[] calldata newTargets) external onlyManager {
        delete targets;
        uint256 sum;
        for (uint i; i < newTargets.length; i++) {
            targets.push(newTargets[i]);
            sum += newTargets[i].bps;
        }
        require(sum == 1e4, "BPS_NOT_100%");
        emit TargetsUpdated(newTargets);
    }

    function setCooldown(uint256 t) external onlyManager {
        cooldown = t;
    }

    // ---------------- Rebalancing ----------------

    /// @notice Keeper/manager triggers rebalance. 
    /// - Prepares calldata off-chain with what to withdraw and deposit.
    /// - swapData[i] = calldata for strategy[i] (e.g. UniV3 swap routes).
    function rebalance(
        IStrategy[] calldata overweights,
        uint256[] calldata withdrawAmts,
        bytes[][] calldata allSwapData
    ) external onlyManager {
        require(block.timestamp >= lastRebalance + cooldown, "COOLDOWN");

        require(overweights.length == withdrawAmts.length, "LEN_MISMATCH");

        // Step 1: Withdraw from overweight strategies
        for (uint i; i < overweights.length; i++) {
            if (withdrawAmts[i] > 0) {
                vault.withdrawFromStrategy(overweights[i], withdrawAmts[i], allSwapData[i]);
            }
        }

        // Step 2: Reinvest idle USDC into target allocations
        vault.investIdle();

        lastRebalance = block.timestamp;
        emit Rebalanced(block.timestamp);
    }
}
