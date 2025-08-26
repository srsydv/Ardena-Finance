// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// import "../utils/SafeTransferLib.sol";

// contract FeeModule {
//     using SafeTransferLib for address;

//     address public immutable asset; // vault asset
//     address public treasury;

//     // fees in bps (1e4 = 100%)
//     uint16 public managementFeeBps; // annualized, charged on harvest/rebalance using time pro-rate
//     uint16 public performanceFeeBps; // on realized gains at harvest
//     uint16 public entryFeeBps; // on deposit
//     uint16 public exitFeeBps; // on withdraw

//     uint256 public lastFeeTimestamp; // for mgmt fee accrual

//     address public governor; // authority to update fees (time-locked in prod)

//     event FeesUpdated(uint16 mgmt, uint16 perf, uint16 entry, uint16 exit);
//     event TreasuryUpdated(address treasury);

//     modifier onlyGovernor() {
//         require(msg.sender == governor, "NOT_GOV");
//         _;
//     }

//     constructor(address _asset, address _treasury, address _governor) {
//         asset = _asset;
//         treasury = _treasury;
//         governor = _governor;
//         lastFeeTimestamp = block.timestamp;
//     }

//     function setTreasury(address t) external onlyGovernor {
//         treasury = t;
//         emit TreasuryUpdated(t);
//     }

//     function setFees(
//         uint16 mgmt,
//         uint16 perf,
//         uint16 entryF,
//         uint16 exitF
//     ) external onlyGovernor {
//         require(
//             mgmt <= 2000 && perf <= 3000 && entryF <= 300 && exitF <= 300,
//             "FEE_BOUNDS"
//         );
//         managementFeeBps = mgmt;
//         performanceFeeBps = perf;
//         entryFeeBps = entryF;
//         exitFeeBps = exitF;
//         emit FeesUpdated(mgmt, perf, entryF, exitF);
//     }

//     /// @dev charge entry fee, returns net amount after fee and feeAmount
//     function takeEntryFee(
//         uint256 amount
//     ) external returns (uint256 net, uint256 fee) {
//         fee = (amount * entryFeeBps) / 1e4;
//         if (fee > 0) asset.safeTransfer(treasury, fee);
//         net = amount - fee;
//     }

//     /// @dev charge exit fee
//     function takeExitFee(
//         uint256 amount
//     ) external returns (uint256 net, uint256 fee) {
//         fee = (amount * exitFeeBps) / 1e4;
//         if (fee > 0) asset.safeTransfer(treasury, fee);
//         net = amount - fee;
//     }

//     /// @dev charge mgmt + performance fee; caller must transfer fee from Vault to treasury
//     function computeMgmtFee(uint256 tvl) public view returns (uint256) {
//         if (managementFeeBps == 0) return 0;
//         uint256 dt = block.timestamp - lastFeeTimestamp; // seconds
//         // annualized pro-rata: tvl * rate * dt / (365 days)
//         return (tvl * managementFeeBps * dt) / (365 days * 1e4);
//     }

//     function onFeesCharged() external {
//         lastFeeTimestamp = block.timestamp;
//     }
// }
