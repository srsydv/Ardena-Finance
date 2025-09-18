// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../utils/SafeTransferLib.sol";
import "../interfaces/IStrategy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// Minimal Aave v3 types to read aToken from getReserveData
library DataTypes {
    struct ReserveConfigurationMap {
        uint256 data;
    }

    struct ReserveData {
        ReserveConfigurationMap configuration; // uint256
        uint128 liquidityIndex; // u128
        uint128 currentLiquidityRate; // u128
        uint128 variableBorrowIndex; // u128
        uint128 currentVariableBorrowRate; // u128
        uint128 currentStableBorrowRate; // u128
        uint40 lastUpdateTimestamp; // u40
        uint16 id; // u16  <-- position matters
        address aTokenAddress; // address
        address stableDebtTokenAddress; // address
        address variableDebtTokenAddress; // address
        address interestRateStrategyAddress; // address
        uint128 accruedToTreasury; // u128  <-- present on v3
        uint128 unbacked; // u128
        uint128 isolationModeTotalDebt; // u128
    }
}

interface IAavePool {
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);

    function getReserveData(
        address asset
    ) external view returns (DataTypes.ReserveData memory);
}

contract AaveV3Strategy is Initializable, UUPSUpgradeable, IStrategy {
    using SafeTransferLib for address;

    address public vault;
    address public wantToken;
    IERC20 public aToken;
    IAavePool public aave;

    modifier onlyVault() {
        require(msg.sender == vault, "NOT_VAULT");
        _;
    }

    function initialize(address _vault, address _want, address _aavePool) public initializer {
        __UUPSUpgradeable_init();
        require(_vault != address(0) && _want != address(0) && _aavePool != address(0), "BAD_ADDR");
        vault = _vault;
        wantToken = _want;
        aave = IAavePool(_aavePool);
        // derive aToken from pool to avoid mismatches
        DataTypes.ReserveData memory rd = aave.getReserveData(_want);
        aToken = IERC20(rd.aTokenAddress);
    }

    // --- Views ---
    function want() external view override returns (address) {
        return wantToken;
    }

    function totalAssets() public view override returns (uint256) {
        // return IERC20(aToken).balanceOf(address(this));
        uint256 raw = IERC20(address(aToken)).balanceOf(address(this));

        uint8 aDec = IERC20Metadata(address(aToken)).decimals();
        uint8 wantDec = IERC20Metadata(wantToken).decimals();

        return _scaleDecimals(raw, aDec, wantDec);
    }

    // --- Vault calls ---
    function deposit(
        uint256 amountWant,
        bytes[] calldata /*swapCalldatas*/
    ) external override onlyVault {
        // For Aave we don’t need swapCalldatas (but must keep signature for interface)
        IERC20(wantToken).transferFrom(vault, address(this), amountWant);

        wantToken.safeApprove(address(aave), 0);
        wantToken.safeApprove(address(aave), amountWant);
        aave.supply(wantToken, amountWant, address(this), 0);
    }

    function withdraw(
        uint256 amount,
        bytes[] calldata /*swapCalldatas*/
    ) external override onlyVault returns (uint256 withdrawn) {
        withdrawn = aave.withdraw(wantToken, amount, vault);
    }

    function withdrawAll()
        external
        override
        onlyVault
        returns (uint256 withdrawn)
    {
        withdrawn = aave.withdraw(wantToken, type(uint256).max, vault);
    }

    function harvest(
        bytes[] calldata /*swapCalldatas*/
    ) external override onlyVault returns (uint256 profit) {
        // No manual harvest in Aave (interest auto-accrues)
        return 0;
    }

    function _scaleDecimals(
        uint256 amount,
        uint8 fromDec,
        uint8 toDec
    ) internal pure returns (uint256) {
        if (fromDec == toDec) return amount;
        if (fromDec < toDec) {
            return amount * (10 ** (toDec - fromDec));
        } else {
            return amount / (10 ** (fromDec - toDec));
        }
    }

    function _authorizeUpgrade(address /*newImplementation*/) internal view override {
        require(msg.sender == vault, "NOT_VAULT");
    }

    uint256[50] private __gap;
}
