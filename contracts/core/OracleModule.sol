// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 * Velvet-style Oracle module:
 * - Normalizes all prices to 1e18 USD
 * - Supports direct token/USD feeds
 * - Supports token/ETH * ETH/USD composition when no direct USD feed
 * - Staleness (heartbeat) checks per feed
 */

interface IOracleRouter {
    function price(address token) external view returns (uint256);       // 1 token in USD, 1e18 precision
    function isPriceStale(address token) external view returns (bool);   // true if any underlying feed is stale
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}

// Chainlink AggregatorV3 interface (minimal)
interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function decimals() external view returns (uint8);
}

contract OracleModule is IOracleRouter {
    struct FeedCfg {
        AggregatorV3Interface aggregator;  // token/USD feed (preferred)
        uint256 heartbeat;                 // max allowed staleness in seconds
        bool exists;
    }

    struct EthRouteCfg {
        AggregatorV3Interface tokenEthAgg; // token/ETH (or ETH/token, see invert flag)
        bool invert;                       // if true, price is ETH/token (needs inversion)
        uint256 heartbeat;
        bool exists;
    }

    address public immutable WETH;
    // ETH/USD (for composition path when only token/ETH feed exists)
    FeedCfg public ethUsd;

    // token => direct USD feed
    mapping(address => FeedCfg) public tokenUsd;

    // token => (token/ETH) route for composition (fallback if no direct USD feed)
    mapping(address => EthRouteCfg) public tokenEthRoute;

    address public owner;

    event OwnerUpdated(address indexed);
    event SetEthUsd(address indexed agg, uint256 heartbeat);
    event SetTokenUsd(address indexed token, address indexed agg, uint256 heartbeat);
    event SetTokenEthRoute(address indexed token, address indexed agg, bool invert, uint256 heartbeat);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(address _weth) {
        require(_weth != address(0), "BAD_WETH");
        owner = msg.sender;
        WETH = _weth;
    }

    function setOwner(address _owner) external onlyOwner {
        require(_owner != address(0), "BAD_OWNER");
        owner = _owner;
        emit OwnerUpdated(_owner);
    }

    /// @notice Configure ETH/USD feed (must be set if any token uses token/ETH composition)
    function setEthUsd(address agg, uint256 heartbeat) external onlyOwner {
        require(agg != address(0) && heartbeat > 0, "BAD_PARAMS");
        ethUsd = FeedCfg(AggregatorV3Interface(agg), heartbeat, true);
        emit SetEthUsd(agg, heartbeat);
    }

    /// @notice Configure direct token/USD feed
    function setTokenUsd(address token, address agg, uint256 heartbeat) external onlyOwner {
        require(token != address(0) && agg != address(0) && heartbeat > 0, "BAD_PARAMS");
        tokenUsd[token] = FeedCfg(AggregatorV3Interface(agg), heartbeat, true);
        emit SetTokenUsd(token, agg, heartbeat);
    }

    /// @notice Configure token/ETH route (or ETH/token if invert=true). Used when there is no direct USD feed.
    function setTokenEthRoute(address token, address agg, bool invert, uint256 heartbeat) external onlyOwner {
        require(token != address(0) && agg != address(0) && heartbeat > 0, "BAD_PARAMS");
        tokenEthRoute[token] = EthRouteCfg(AggregatorV3Interface(agg), invert, heartbeat, true);
        emit SetTokenEthRoute(token, agg, invert, heartbeat);
    }

    // ---------------- Views ----------------

    /// @notice Returns price of 1 token in USD, 1e18 precision
    function price(address token) external view override returns (uint256) {
        require(token != address(0), "BAD_TOKEN");

        // 1) WETH shortcut via ETH/USD
        if (token == WETH) {
            return _readUsd(ethUsd); // returns 1 ETH in USD (1e18)
        }

        // 2) Direct token/USD feed
        if (tokenUsd[token].exists) {
            return _readUsd(tokenUsd[token]); // 1 token in USD (1e18)
        }

        // 3) Composition: token/ETH × ETH/USD
        if (tokenEthRoute[token].exists) {
            uint256 tokenPerEth1e18 = _readTokenPerEth(tokenEthRoute[token]); // (token per ETH) scaled to 1e18
            require(ethUsd.exists, "NO_ETH_USD");
            uint256 ethUsd1e18 = _readUsd(ethUsd); // 1 ETH in USD (1e18)
            // Price(1 token) = (ETH/USD) * (1 / tokenPerETH)
            // But tokenPerEth1e18 = token per 1 ETH; so 1 token in ETH = 1e18 / tokenPerEth1e18
            // hence USD per token = ethUsd1e18 * 1e18 / tokenPerEth1e18
            return (ethUsd1e18 * 1e18) / tokenPerEth1e18;
        }

        // 4) If strictly stable like USDC with no Chainlink feed configured:
        // You can whitelist a hardcoded $1.00 if you want (optional). For safety, we return 0.
        return 0;
    }

    /// @notice True if the token’s price would rely on a stale feed
    function isPriceStale(address token) external view override returns (bool) {
        if (token == WETH) return _isStale(ethUsd);

        if (tokenUsd[token].exists) return _isStale(tokenUsd[token]);

        if (tokenEthRoute[token].exists) {
            if (_isStale(tokenEthRoute[token])) return true;
            if (!ethUsd.exists || _isStale(ethUsd)) return true;
            return false;
        }
        // Unknown token -> treat as stale (no reliable price)
        return true;
    }

    // ---------------- Internals ----------------

    // Reads a USD feed and returns 1 unit in USD at 1e18 precision
    function _readUsd(FeedCfg memory cfg) internal view returns (uint256) {
        require(cfg.exists, "NO_USD_FEED");
        (uint256 answer, uint256 updatedAt, uint8 d) = _readRaw(cfg.aggregator);
        require(!_tooOld(updatedAt, cfg.heartbeat), "USD_FEED_STALE");
        // Scale from feed decimals -> 1e18
        // answer can be <= 0 for invalid, guard:
        require(answer > 0, "BAD_USD_ANSWER");
        return _scale(answer, d, 18);
    }

    // Reads token/ETH or ETH/token, returns "token per ETH" at 1e18 precision
    function _readTokenPerEth(EthRouteCfg memory cfg) internal view returns (uint256) {
        (uint256 answer, uint256 updatedAt, uint8 d) = _readRaw(cfg.tokenEthAgg);
        require(!_tooOld(updatedAt, cfg.heartbeat), "TOKEN_ETH_STALE");
        require(answer > 0, "BAD_TOKEN_ETH_ANSWER");

        uint256 v = _scale(answer, d, 18); // scale to 1e18
        // If feed is ETH per token, invert to token per ETH
        if (cfg.invert) {
            // token per ETH = 1 / (ETH per token)
            // with fixed point: 1e18 * 1e18 / v
            return (1e36) / v;
        }
        return v;
    }

    function _readRaw(AggregatorV3Interface agg) internal view returns (uint256 answer, uint256 updatedAt, uint8 d) {
        (, int256 ans,, uint256 upd,) = agg.latestRoundData();
        require(ans > 0, "NEG_OR_ZERO");
        answer = uint256(ans);
        updatedAt = upd;
        d = agg.decimals();
    }

    function _isStale(FeedCfg memory cfg) internal view returns (bool) {
        if (!cfg.exists) return true;
        (, , , uint256 upd,) = cfg.aggregator.latestRoundData();
        return _tooOld(upd, cfg.heartbeat);
    }

    function _isStale(EthRouteCfg memory cfg) internal view returns (bool) {
        if (!cfg.exists) return true;
        (, , , uint256 upd,) = cfg.tokenEthAgg.latestRoundData();
        return _tooOld(upd, cfg.heartbeat);
    }

    function _tooOld(uint256 updatedAt, uint256 heartbeat) internal view returns (bool) {
        return updatedAt == 0 || block.timestamp > updatedAt + heartbeat;
    }

    // scale x from `fromDec` to `toDec` decimals
    function _scale(uint256 x, uint8 fromDec, uint8 toDec) internal pure returns (uint256) {
        if (fromDec == toDec) return x;
        if (fromDec < toDec) return x * 10 ** (toDec - fromDec);
        return x / 10 ** (fromDec - toDec);
    }
}
