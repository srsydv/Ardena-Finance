// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract MockAggregatorV3 {
  int256 public answer;
  uint8 public decimals_;
  uint256 public updatedAt;
  constructor(int256 _answer, uint8 _decimals) {
    answer = _answer; decimals_ = _decimals; updatedAt = block.timestamp;
  }
  function latestRoundData() external view returns (uint80,uint256,int256,uint256,uint80) {
    return (0, uint256(answer), int256(answer), updatedAt, 0);
  }
  function decimals() external view returns (uint8) { return decimals_; }
  function setAnswer(int256 a) external { answer = a; updatedAt = block.timestamp; }
}
