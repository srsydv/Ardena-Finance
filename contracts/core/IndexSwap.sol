// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IOracleRouter.sol";
import "../interfaces/IExchangeHandler.sol";

contract IndexSwap {
    struct TokenWeight {
        address token;
        uint32 bps;
    } // sum bps = 1e4

    address public asset; // vault asset (numeraire for accounting)
    IOracleRouter public oracle; // price source
    IExchangeHandler public exchanger; // DEX router adapter

    uint256 public cooldown; // seconds between rebalances
    uint256 public lastRebalance;

    TokenWeight[] public targets; // target weights for portfolio tokens

    address public manager; // vault/manager that can call rebalance

    event Rebalanced(uint256 timestamp);
    event TargetsUpdated();

    modifier onlyManager() {
        require(msg.sender == manager, "NOT_MANAGER");
        _;
    }
    modifier cooldownElapsed() {
        require(block.timestamp >= lastRebalance + cooldown, "COOLDOWN");
        _;
    }

    constructor(
        address _asset,
        address _oracle,
        address _exchanger,
        address _manager,
        uint256 _cooldown,
        TokenWeight[] memory _targets
    ) {
        asset = _asset;
        oracle = IOracleRouter(_oracle);
        exchanger = IExchangeHandler(_exchanger);
        manager = _manager;
        cooldown = _cooldown;
        _setTargets(_targets);
        lastRebalance = block.timestamp;
    }

    function _setTargets(TokenWeight[] memory _targets) internal {
        delete targets;
        uint256 sum;
        for (uint256 i; i < _targets.length; i++) {
            targets.push(_targets[i]);
            sum += _targets[i].bps;
        }
        require(sum == 1e4, "BAD_WEIGHTS");
        emit TargetsUpdated();
    }

    function updateTargets(
        TokenWeight[] calldata _targets
    ) external onlyManager {
        _setTargets(_targets);
    }

    function setCooldown(uint256 s) external onlyManager {
        cooldown = s;
    }

    /// @notice simplistic rebalance: bring each token to target weight by swapping via ExchangeHandler.
    /// Caller must have custody of portfolio tokens (e.g., Vault calling this with allowances set).
    function rebalance(
        bytes[] calldata swapCalldatas
    ) external onlyManager cooldownElapsed {
        // Off-chain bot computes required deltas and provides encoded swaps in order.
        for (uint256 i; i < swapCalldatas.length; i++) {
            exchanger.swap(swapCalldatas[i]);
        }
        lastRebalance = block.timestamp;
        emit Rebalanced(block.timestamp);
    }
}
