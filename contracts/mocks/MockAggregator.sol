// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// contract MockAggregator {
//     int256 private _answer;
//     uint8 private _decimals;
//     uint256 private _updatedAt;

//     constructor(int256 initialAnswer, uint8 decimals_) {
//         _answer = initialAnswer;
//         _decimals = decimals_;
//         _updatedAt = block.timestamp;
//     }

//     function latestRoundData()
//         external
//         view
//         returns (
//             uint80 roundId,
//             int256 answer,
//             uint256 startedAt,
//             uint256 updatedAt,
//             uint80 answeredInRound
//         )
//     {
//         return (0, _answer, 0, _updatedAt, 0);
//     }

//     function decimals() external view returns (uint8) {
//         return _decimals;
//     }

//     // Test utilities
//     function setAnswer(int256 a) external {
//         _answer = a;
//         _updatedAt = block.timestamp;
//     }

//     function setUpdatedAt(uint256 t) external {
//         _updatedAt = t;
//     }
// }
