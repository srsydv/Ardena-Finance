// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// import "../interfaces/IStrategy.sol";
// import "../utils/SafeTransferLib.sol";

// interface IERC20 {
//     function balanceOf(address) external view returns (uint256);
//     function approve(address, uint256) external returns (bool);
// }

// interface IAavePool {
//     function supply(
//         address asset,
//         uint256 amount,
//         address onBehalf,
//         uint16
//     ) external;

//     function withdraw(
//         address asset,
//         uint256 amount,
//         address to
//     ) external returns (uint256);
// }

// contract AaveV3Strategy is IStrategy {
//     using SafeTransferLib for address;

//     address public immutable wantToken;
//     IAavePool public immutable aave;
//     address public vault; // only Vault can call state-changing methods

//     modifier onlyVault() {
//         require(msg.sender == vault, "NOT_VAULT");
//         _;
//     }

//     constructor(address _want, address _aave, address _vault) {
//         wantToken = _want;
//         aave = IAavePool(_aave);
//         vault = _vault;
//     }

//     function want() external view override returns (address) {
//         return wantToken;
//     }

//     function totalAssets() public view override returns (uint256) {
//         // aToken balance represents our underlying claim (principal + interest)
//         return IERC20(aToken).balanceOf(address(this));
//     }

//     function deposit(uint256 amount) external override onlyVault {
//         wantToken.safeApprove(address(aave), 0);
//         wantToken.safeApprove(address(aave), amount);
//         aave.supply(wantToken, amount, address(this), 0);
//     }

//     function withdraw(
//         uint256 amount
//     ) external override onlyVault returns (uint256 withdrawn) {
//         withdrawn = aave.withdraw(wantToken, amount, vault);
//     }

//     function withdrawAll()
//         external
//         override
//         onlyVault
//         returns (uint256 withdrawn)
//     {
//         // use max uint to withdraw all
//         withdrawn = aave.withdraw(wantToken, type(uint256).max, vault);
//     }

//     function harvest() external override onlyVault returns (uint256 profit) {
//         // Claim incentives (not implemented) -> swap to want via Vault/ExchangeHandler if desired.
//         // Return realized profit amount in want.
//         return 0;
//     }

//     function _bal() internal view returns (uint256) {
//         (bool ok, bytes memory data) = wantToken.staticcall(
//             abi.encodeWithSelector(0x70a08231, address(this))
//         );
//         require(ok, "BAL_VIEW_FAIL");
//         return abi.decode(data, (uint256));
//     }
// }
