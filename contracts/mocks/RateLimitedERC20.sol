// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Rate-limited mintable ERC20
/// @notice Any user may mint to self up to 10 tokens per 24h window. Owner may mint any amount to any address.
contract RateLimitedERC20 is ERC20, Ownable {
    // 24 hours in seconds
    uint256 public constant MINT_WINDOW = 1 days;
    // With 18 decimals, 10 ether represents 10.0 tokens
    uint256 public constant MAX_DAILY_USER_MINT = 10 ether;

    struct WindowInfo {
        uint128 mintedInWindow; // amount minted in the current 24h window
        uint64 windowStart;     // timestamp when the current window started
    }

    mapping(address => WindowInfo) private _userWindows;

    /// @dev Default decimals = 18 via OZ ERC20. Name and symbol set via ctor.
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) Ownable(msg.sender) {}

    /// @notice Mint tokens.
    /// - Owner may mint to any `to` without limits.
    /// - Non-owners may only mint to themselves, capped to 10 tokens per 24h.
    function mint(address to, uint256 amount) external {
        if (msg.sender == owner()) {
            _mint(to, amount);
            return;
        }

        // Non-owner: must mint to self and within daily limit
        require(to == msg.sender, "ONLY_SELF_MINT");

        WindowInfo storage w = _userWindows[msg.sender];
        // initialize/reset rolling 24h window
        if (block.timestamp >= uint256(w.windowStart) + MINT_WINDOW) {
            w.windowStart = uint64(block.timestamp);
            w.mintedInWindow = 0;
        }

        uint256 newMinted = uint256(w.mintedInWindow) + amount;
        require(newMinted <= MAX_DAILY_USER_MINT, "DAILY_LIMIT");

        w.mintedInWindow = uint128(newMinted);
        _mint(to, amount);
    }

    /// @notice View how much the user can still mint within the current 24h window.
    function remainingDailyMint(address account) external view returns (uint256) {
        WindowInfo memory w = _userWindows[account];
        if (block.timestamp >= uint256(w.windowStart) + MINT_WINDOW) {
            return MAX_DAILY_USER_MINT;
        }
        uint256 minted = uint256(w.mintedInWindow);
        return minted >= MAX_DAILY_USER_MINT ? 0 : (MAX_DAILY_USER_MINT - minted);
    }

    /// @notice Returns the timestamp when the user's current 24h window started; 0 if never minted.
    function mintWindowStart(address account) external view returns (uint64) {
        return _userWindows[account].windowStart;
    }
}


