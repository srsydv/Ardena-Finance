// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Vault.sol";

contract PortfolioFactory {
    event VaultDeployed(address vault, address asset, string name, string symbol);

    function deployVault(
        address asset,
        string calldata name_,
        string calldata symbol_,
        address access,
        address fees,
        address oracle,
        uint256 cap,
        uint8 decimals_
    ) external returns (address vault) {
        vault = address(new Vault(asset, name_, symbol_, access, fees, oracle, cap, decimals_));
        emit VaultDeployed(vault, asset, name_, symbol_);
    }
}
