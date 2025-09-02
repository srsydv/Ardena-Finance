// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../utils/SafeTransferLib.sol";

contract FeeModule {
    using SafeTransferLib for address;

    address public immutable asset; // vault asset
    address public treasury;

    uint16 public managementFeeBps;
    uint16 public performanceFeeBps;
    uint16 public entryFeeBps;
    uint16 public exitFeeBps;

    uint256 public lastFeeTimestamp;
    address public governor;

    event FeesUpdated(uint16 mgmt, uint16 perf, uint16 entry, uint16 exit);
    event TreasuryUpdated(address treasury);

    modifier onlyGovernor() {
        require(msg.sender == governor, "NOT_GOV");
        _;
    }

    constructor(address _asset, address _treasury, address _governor) {
        asset = _asset;
        treasury = _treasury;
        governor = _governor;
        lastFeeTimestamp = block.timestamp;
    }

    function setTreasury(address t) external onlyGovernor {
        treasury = t;
        emit TreasuryUpdated(t);
    }

     function setGovernor(address g) external onlyGovernor {
        require(g != address(0), "BAD_GOV");
        governor = g;
    }

    function setFees(
        uint16 mgmt,
        uint16 perf,
        uint16 entryF,
        uint16 exitF
    ) external onlyGovernor {
        require(
            mgmt <= 2000 && perf <= 3000 && entryF <= 300 && exitF <= 300,
            "FEE_BOUNDS"
        );
        managementFeeBps = mgmt;
        performanceFeeBps = perf;
        entryFeeBps = entryF;
        exitFeeBps = exitF;
        emit FeesUpdated(mgmt, perf, entryF, exitF);
    }

    /// @dev just compute: returns (netAfterFee, feeAmount)
    function takeEntryFee(
        uint256 amount
    ) external view returns (uint256 net, uint256 fee) {
        fee = (amount * entryFeeBps) / 1e4;
        net = amount - fee;
    }

    /// @dev just compute: returns (netAfterFee, feeAmount)
    function takeExitFee(
        uint256 amount
    ) external view returns (uint256 net, uint256 fee) {
        fee = (amount * exitFeeBps) / 1e4;
        net = amount - fee;
    }

    function computeMgmtFee(uint256 tvl) public view returns (uint256) {
        if (managementFeeBps == 0) return 0;
        uint256 dt = block.timestamp - lastFeeTimestamp;
        return (tvl * managementFeeBps * dt) / (365 days * 1e4);
    }

    function onFeesCharged() external {
        lastFeeTimestamp = block.timestamp;
    }
}
