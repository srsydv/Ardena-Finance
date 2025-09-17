// // contracts/core/PortfolioFactoryUUPS.sol
// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;
// import "./Vault.sol";
// import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// contract PortfolioFactoryUUPS {
//     address public immutable implementation; // Vault implementation

//     constructor(address _implementation) {
//         implementation = _implementation;
//     }

//     event VaultDeployed(address proxy);

//     function deployVault(
//         address asset,
//         string calldata name_,
//         string calldata symbol_,
//         address access,
//         address fees,
//         address oracle,
//         uint256 cap,
//         uint8 decimals_
//     ) external returns (address proxy) {
//         bytes memory initData = abi.encodeCall(
//             Vault.initialize,
//             (asset, name_, symbol_, access, fees, oracle, cap, decimals_)
//         );
//         proxy = address(new ERC1967Proxy(implementation, initData));
//         emit VaultDeployed(proxy);
//     }
// }