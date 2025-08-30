// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../utils/SafeTransferLib.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);

    function approve(address, uint256) external returns (bool);

    function transfer(address, uint256) external returns (bool);

    function decimals() external view returns (uint8);
}

interface IExchangeHandler {
    // Implemented in your repo; routes swaps through whitelisted routers
    function swap(bytes calldata data) external returns (uint256 amountOut);
}

interface IOracleRouter {
    // Returns price of token in USD with 1e18 precision (or a common numeraire)
    function price(address token) external view returns (uint256);

    function isPriceStale(address token) external view returns (bool);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0; // First token in the pair (e.g., ETH)
        address token1; // Second token in the pair (e.g., USDC)
        uint24 fee; // Pool fee tier (500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
        int24 tickLower; // Lower price boundary
        int24 tickUpper; // Upper price boundary
        uint256 amount0Desired; // How much of token0 you want to provide
        uint256 amount1Desired; // How much of token1 you want to provide
        uint256 amount0Min; // Minimum amount0 you'll accept
        uint256 amount1Min; // Minimum amount1 you'll accept
        address recipient; // Who gets the position NFT
        uint256 deadline; // When this transaction expires
    }
    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }
    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(
        MintParams calldata params
    )
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

    function decreaseLiquidity(
        DecreaseLiquidityParams calldata params
    ) external payable returns (uint256 amount0, uint256 amount1);

    function collect(
        CollectParams calldata params
    ) external payable returns (uint256 amount0, uint256 amount1);

    function positions(
        uint256 tokenId
    )
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
}

interface IUniswapV3Pool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    function token0() external view returns (address);

    function token1() external view returns (address);
}

// If you installed Uniswap libraries, uncomment these and use them.
// import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
// import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";

interface IStrategy {
    function want() external view returns (address);

    function totalAssets() external view returns (uint256);

    function deposit(uint256 amountWant) external;

    function withdraw(uint256 amountWant) external returns (uint256);

    function withdrawAll() external returns (uint256);

    function harvest() external returns (uint256);
}

/// @notice Strategy assumes `want` is either token0 or token1.
/// Manager/keeper should prepare amounts (swap via ExchangeHandler) before calling deposit here.
contract UniswapV3Strategy is IStrategy {
    using SafeTransferLib for address;

    address public immutable vault;
    address public immutable wantToken; // e.g., USDC
    INonfungiblePositionManager public immutable pm; // Uniswap's position manager
    IUniswapV3Pool public immutable pool; // pool for (token0, token1, fee)
    IExchangeHandler public immutable exchanger;
    IOracleRouter public immutable oracle; // for valuation to `want`

    uint256 public tokenId; // LP NFT id held by this strategy

    modifier onlyVault() {
        require(msg.sender == vault, "NOT_VAULT");
        _;
    }

    constructor(
        address _vault,
        address _want,
        address _pm,
        address _pool,
        address _exchanger,
        address _oracle
    ) {
        require(
            _vault != address(0) &&
                _want != address(0) &&
                _pm != address(0) &&
                _pool != address(0) &&
                _exchanger != address(0) &&
                _oracle != address(0),
            "BAD_ADDR"
        );
        vault = _vault;
        wantToken = _want;
        pm = INonfungiblePositionManager(_pm);
        pool = IUniswapV3Pool(_pool);
        exchanger = IExchangeHandler(_exchanger);
        oracle = IOracleRouter(_oracle);
    }

    // ---------------- Views ----------------

    function want() external view override returns (address) {
        return wantToken;
    }

    function totalAssets() public view override returns (uint256) {
        // Value = current liquidity amounts + uncollected fees + idle want, all converted to `want`
        if (tokenId == 0) {
            return IERC20(wantToken).balanceOf(address(this));
        }

        (
            ,
            ,
            address token0,
            address token1,
            ,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            ,
            ,
            uint128 fees0,
            uint128 fees1
        ) = pm.positions(tokenId);

        if (liquidity == 0 && fees0 == 0 && fees1 == 0) {
            return IERC20(wantToken).balanceOf(address(this));
        }

        // Get current price
        (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();

        // Estimate amounts for liquidity.
        // NOTE: for production, use Uniswap's LiquidityAmounts.getAmountsForLiquidity:
        // (uint256 amt0, uint256 amt1) = LiquidityAmounts.getAmountsForLiquidity(
        //     sqrtPriceX96,
        //     TickMath.getSqrtRatioAtTick(tickLower),
        //     TickMath.getSqrtRatioAtTick(tickUpper),
        //     liquidity
        // );
        // For MVP, we conservatively value **only** uncollected fees + idle want to avoid complex math:
        uint256 amt0 = uint256(fees0);
        uint256 amt1 = uint256(fees1);

        // Convert token0/token1 to `want` using oracle prices.
        uint256 valueInWant = _convertToWant(token0, amt0) +
            _convertToWant(token1, amt1);

        // Add idle want in the contract (e.g., dust from mint/collect)
        valueInWant += IERC20(wantToken).balanceOf(address(this));

        return valueInWant;
    }

    // ---------------- Vault calls ----------------

    /// @notice Expects manager to have swapped into appropriate token0/token1 proportions beforehand.
    ///         Here we just mint a position using whatever balances we hold.
    function deposit(
        uint256 amountWant,
        bytes[] calldata swaps
    ) external override onlyVault {
        if (amountWant > 0) {
            IERC20(wantToken).transferFrom(vault, address(this), amountWant);
        }

        _executeSwaps(swaps);

        address t0 = pool.token0();
        address t1 = pool.token1();
        uint256 bal0 = IERC20(t0).balanceOf(address(this));
        uint256 bal1 = IERC20(t1).balanceOf(address(this));
        require(bal0 > 0 || bal1 > 0, "NO_FUNDS");

        t0.safeApprove(address(pm), 0);
        t0.safeApprove(address(pm), bal0);
        t1.safeApprove(address(pm), 0);
        t1.safeApprove(address(pm), bal1);

        if (tokenId == 0) {
            // First deposit → mint a new position
            (, int24 currentTick, , , , , ) = pool.slot0();
            int24 tickSpacing = 60;
            int24 lower = (currentTick / tickSpacing - 100) * tickSpacing;
            int24 upper = (currentTick / tickSpacing + 100) * tickSpacing;

            (uint256 _tokenId, , , ) = pm.mint(
                INonfungiblePositionManager.MintParams({
                    token0: t0,
                    token1: t1,
                    fee: _poolFeeGuess(),
                    tickLower: lower,
                    tickUpper: upper,
                    amount0Desired: bal0,
                    amount1Desired: bal1,
                    amount0Min: 0,
                    amount1Min: 0,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );
            tokenId = _tokenId;
        } else {
            // Subsequent deposits → increase liquidity in the same position
            pm.increaseLiquidity(
                INonfungiblePositionManager.IncreaseLiquidityParams({
                    tokenId: tokenId,
                    amount0Desired: bal0,
                    amount1Desired: bal1,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                })
            );
        }
    }

    /// @notice Withdraws by decreasing liquidity proportionally to get `amountWant` worth of tokens,
    ///         then swaps to `want` and sends to Vault. This is a simplified MVP.
    //     function withdraw(
    //         uint256 amountWant
    //     ) external override onlyVault returns (uint256 withdrawn) {
    //         require(tokenId != 0, "NO_POS");

    //         // For MVP we pull a small portion of liquidity, collect, then swap proceeds to want.
    //         // In production, compute required liquidity share using valuation math.
    //         uint128 liqToPull = _calculateLiquidityForAmount(amountWant); // pull ~1% per call (example)
    //         (uint256 out0, uint256 out1) = pm.decreaseLiquidity(
    //             INonfungiblePositionManager.DecreaseLiquidityParams({
    //                 tokenId: tokenId,
    //                 liquidity: liqToPull,
    //                 amount0Min: 0,
    //                 amount1Min: 0,
    //                 deadline: block.timestamp
    //             })
    //         );

    //         (uint256 fee0, uint256 fee1) = pm.collect(
    //             INonfungiblePositionManager.CollectParams({
    //                 tokenId: tokenId,
    //                 recipient: address(this),
    //                 amount0Max: type(uint128).max,
    //                 amount1Max: type(uint128).max
    //             })
    //         );

    //         address t0 = IUniswapV3Pool(pool).token0();
    //         address t1 = IUniswapV3Pool(pool).token1();

    //         uint256 amt0 = out0 + fee0 + IERC20(t0).balanceOf(address(this));
    //         uint256 amt1 = out1 + fee1 + IERC20(t1).balanceOf(address(this));

    //         // Swap non-want tokens to want via ExchangeHandler. Build calldata off-chain for best routes.
    //         withdrawn = _liquidateToWant(t0, t1, amt0, amt1, vault);
    //     }

    //     function _calculateLiquidityForAmount(uint256 amountWant) internal view returns (uint128) {
    //     // This is the complex part - calculate how much liquidity to remove
    //     // to get approximately amountWant worth of tokens

    //     // For now, let's use a simple approach:
    //     uint256 totalPositionValue = _getPositionValue();
    //     uint256 liquidityRatio = amountWant * 1e18 / totalPositionValue;

    //     // Get total liquidity of position
    //     (, , , , , , , uint128 totalLiquidity, , , , ) = pm.positions(tokenId);

    //     return uint128((totalLiquidity * liquidityRatio) / 1e18);
    // }

    // at top of file:

    function withdraw(
        uint256 amountWant
    ) external override onlyVault returns (uint256 withdrawn) {
        require(tokenId != 0, "NO_POS");
        if (amountWant == 0) return 0;

        // 0) Use idle want first
        uint256 idle = IERC20(wantToken).balanceOf(address(this));
        if (idle >= amountWant) {
            wantToken.safeTransfer(vault, amountWant);
            return amountWant;
        }
        uint256 needed = amountWant - idle;

        // 1) Read position
        (, , , , , int24 tickLower, int24 tickUpper, uint128 liq, , , , ) = pm
            .positions(tokenId);
        if (liq == 0) {
            // nothing staked; just send idle and exit
            if (idle > 0) {
                wantToken.safeTransfer(vault, idle);
                return idle;
            }
            return 0;
        }

        // 2) Value the FULL position at current price
        (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();
        uint160 sqrtRatioA = TickMath.getSqrtRatioAtTick(tickLower);
        uint160 sqrtRatioB = TickMath.getSqrtRatioAtTick(tickUpper);

        (uint256 amt0Full, uint256 amt1Full) = LiquidityAmounts
            .getAmountsForLiquidity(sqrtPriceX96, sqrtRatioA, sqrtRatioB, liq);

        // 3) Convert both legs to `want`
        address t0 = IUniswapV3Pool(pool).token0();
        address t1 = IUniswapV3Pool(pool).token1();

        uint256 valueFullInWant = 0;
        valueFullInWant += (t0 == wantToken)
            ? amt0Full
            : _quoteToWant(t0, amt0Full);
        valueFullInWant += (t1 == wantToken)
            ? amt1Full
            : _quoteToWant(t1, amt1Full);

        // Guard: if somehow zero (e.g., bad oracle), bail early with idle
        if (valueFullInWant == 0) {
            if (idle > 0) {
                wantToken.safeTransfer(vault, idle);
                return idle;
            }
            return 0;
        }

        // 4) Fraction of liquidity to pull to cover `needed` (ceil slightly)
        uint256 liqToPullU256 = (uint256(liq) * (needed + 1)) / valueFullInWant;
        if (liqToPullU256 == 0) liqToPullU256 = 1; // ensure progress
        if (liqToPullU256 > liq) liqToPullU256 = liq; // cap
        uint128 liqToPull = uint128(liqToPullU256);

        // 5) Decrease liquidity & collect
        (uint256 out0, uint256 out1) = pm.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liqToPull,
                amount0Min: 0, // set slippage in production
                amount1Min: 0,
                deadline: block.timestamp
            })
        );

        (uint256 fee0, uint256 fee1) = pm.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // 6) Sum balances & swap to `want`
        uint256 bal0 = out0 + fee0 + IERC20(t0).balanceOf(address(this));
        uint256 bal1 = out1 + fee1 + IERC20(t1).balanceOf(address(this));

        // swap non-want legs to want and send to vault
        withdrawn = _liquidateToWant(t0, t1, bal0, bal1, vault);

        // Optionally: if withdrawn < amountWant, you can loop once more here,
        // but your Vault already loops across strategies / second calls are OK.
    }

    function _quoteToWant(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        if (amount == 0 || token == wantToken) return amount;
        uint256 pTok = oracle.price(token); // 1e18
        uint256 pWant = oracle.price(wantToken); // 1e18
        if (pTok == 0 || pWant == 0) return 0;

        // Adjust for decimals if your amounts are raw token units
        uint8 dTok = IERC20(token).decimals();
        uint8 dWant = IERC20(wantToken).decimals();

        // Normalize to 1e18, then back to want decimals
        uint256 amt18 = (amount * 10 ** (18 - dTok));
        uint256 val18 = (amt18 * pTok) / pWant;
        return (val18 / 10 ** (18 - dWant));
    }

    // function withdraw(uint256 amountWant) external override onlyVault returns (uint256 withdrawn) {
    //     require(tokenId != 0, "NO_POS");
    //     if (amountWant == 0) return 0;

    //     address t0 = IUniswapV3Pool(pool).token0();
    //     address t1 = IUniswapV3Pool(pool).token1();

    //     // 1) If we already have enough `want` idle, just transfer it.
    //     uint256 idleWant = IERC20(wantToken).balanceOf(address(this));
    //     if (idleWant >= amountWant) {
    //         wantToken.safeTransfer(vault, amountWant);
    //         return amountWant;
    //     }
    //     uint256 needed = amountWant - idleWant;

    //     // 2) Read position state
    //     (
    //         , , , , , int24 tickLower, int24 tickUpper, uint128 liquidity, , , ,
    //     ) = pm.positions(tokenId);

    //     // 3) Value a *unit* of liquidity at current price using Uniswap lib
    //     (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();
    //     uint160 sqrtRatioA = TickMath.getSqrtRatioAtTick(tickLower);
    //     uint160 sqrtRatioB = TickMath.getSqrtRatioAtTick(tickUpper);

    //     // amounts for *all* liquidity:
    //     (uint256 amt0Full, uint256 amt1Full) =
    //         LiquidityAmounts.getAmountsForLiquidity(
    //             sqrtPriceX96, sqrtRatioA, sqrtRatioB, liquidity
    //         );

    //     // 4) Convert those to `want` units (approx); oracle or spot conversions
    //     //    If want == t0 or t1, this is simpler:
    //     uint256 valueFullInWant = 0;
    //     if (t0 == wantToken) valueFullInWant += amt0Full;
    //     else valueFullInWant += _quoteToWant(t0, amt0Full);
    //     if (t1 == wantToken) valueFullInWant += amt1Full;
    //     else valueFullInWant += _quoteToWant(t1, amt1Full);

    //     // Guard: if position has zero value, nothing to pull
    //     if (valueFullInWant == 0) return 0;

    //     // 5) Fraction of liquidity to pull to meet `needed` (ceil a bit to cover fees/slippage)
    //     //    liqToPull = liquidity * needed / valueFullInWant
    //     uint256 liqToPullU256 = (uint256(liquidity) * (needed + 1)) / valueFullInWant;
    //     if (liqToPullU256 == 0) liqToPullU256 = 1; // pull at least something
    //     if (liqToPullU256 > liquidity) liqToPullU256 = liquidity;
    //     uint128 liqToPull = uint128(liqToPullU256);

    //     // 6) Decrease liquidity and collect owed amounts
    //     (uint256 out0, uint256 out1) = pm.decreaseLiquidity(
    //         INonfungiblePositionManager.DecreaseLiquidityParams({
    //             tokenId: tokenId,
    //             liquidity: liqToPull,
    //             amount0Min: 0, // set slippage in prod
    //             amount1Min: 0,
    //             deadline: block.timestamp
    //         })
    //     );

    //     (uint256 fee0, uint256 fee1) = pm.collect(
    //         INonfungiblePositionManager.CollectParams({
    //             tokenId: tokenId,
    //             recipient: address(this),
    //             amount0Max: type(uint128).max,
    //             amount1Max: type(uint128).max
    //         })
    //     );

    //     // 7) Sum totals we now hold
    //     uint256 amt0 = out0 + fee0 + IERC20(t0).balanceOf(address(this));
    //     uint256 amt1 = out1 + fee1 + IERC20(t1).balanceOf(address(this));

    //     // 8) Swap everything non-want to want, transfer to Vault, return actual amount sent
    //     withdrawn = _liquidateToWant(t0, t1, amt0, amt1, vault);

    //     // If we overshot (withdrew > amountWant), that's fine for MVP. For tighter control,
    //     // you could keep some want locally by sending exactly `amountWant` and leaving the rest here.
    // }

    function withdrawAll()
        external
        override
        onlyVault
        returns (uint256 withdrawn)
    {
        require(tokenId != 0, "NO_POS");

        // Pull all liquidity
        (, , , , , , , uint128 liquidity, , , , ) = pm.positions(tokenId);
        (uint256 out0, uint256 out1) = pm.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );

        (uint256 fee0, uint256 fee1) = pm.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        address t0 = IUniswapV3Pool(pool).token0();
        address t1 = IUniswapV3Pool(pool).token1();

        uint256 amt0 = out0 + fee0 + IERC20(t0).balanceOf(address(this));
        uint256 amt1 = out1 + fee1 + IERC20(t1).balanceOf(address(this));

        withdrawn = _liquidateToWant(t0, t1, amt0, amt1, vault);
    }

    /// @notice Collect fees and convert to want (realize PnL). Returns realized profit amount in `want`.
    function harvest() external override onlyVault returns (uint256 profit) {
        if (tokenId == 0) return 0;

        (uint256 fee0, uint256 fee1) = pm.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        address t0 = IUniswapV3Pool(pool).token0();
        address t1 = IUniswapV3Pool(pool).token1();

        uint256 amt0 = fee0;
        uint256 amt1 = fee1;

        // Convert fees to want and send to Vault
        profit = _liquidateToWant(t0, t1, amt0, amt1, vault);
    }

    // ---------------- Internals ----------------

    function _poolFeeGuess() internal view returns (uint24) {
        // TODO: set to actual pool fee tier (e.g., 500, 3000, or 10000).
        return 3000;
    }

    function _convertToWant(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        if (amount == 0) return 0;
        if (token == wantToken) return amount;

        // Convert via USD as numeraire using oracle
        uint256 pToken = oracle.price(token); // 1e18
        uint256 pWant = oracle.price(wantToken); // 1e18
        if (pToken == 0 || pWant == 0) return 0;
        // value_in_want = amount * pToken / pWant (adjust for token decimals if needed)
        return (amount * pToken) / pWant;
    }

    /// @dev Swap non-want balances to `want` and transfer to `to`.
    ///      Off-chain bots should prepare best-route `exchanger.swap(data)` calls.
    function _liquidateToWant(
        address t0,
        address t1,
        uint256 amt0,
        uint256 amt1,
        address to
    ) internal returns (uint256 outWant) {
        // If token0 is not want and amt0>0, swap -> want
        if (t0 != wantToken && amt0 > 0) {
            // Build router calldata off-chain; here we assume router sends proceeds back to this strategy
            bytes memory data0 = _buildSwapData(
                t0,
                wantToken,
                amt0,
                address(this)
            );
            outWant += exchanger.swap(data0);
        } else if (t0 == wantToken) {
            outWant += amt0;
        }

        // token1
        if (t1 != wantToken && amt1 > 0) {
            bytes memory data1 = _buildSwapData(
                t1,
                wantToken,
                amt1,
                address(this)
            );
            outWant += exchanger.swap(data1);
        } else if (t1 == wantToken) {
            outWant += amt1;
        }

        // transfer want to destination (Vault)
        if (outWant > 0) {
            wantToken.safeTransfer(to, outWant);
        }
        return outWant;
    }

    function _executeSwaps(
        bytes[] calldata swapCalldatas
    ) internal returns (uint256 totalOut) {
        for (uint i; i < swapCalldatas.length; i++) {
            // Each swapCalldata is ABI-encoded (router, tokenIn, tokenOut, amountIn, minOut, to, routerCalldata)
            // ExchangeHandler enforces router allow-list and pulls `amountIn` from *this* strategy balance.
            uint256 out = exchanger.swap(swapCalldatas[i]);
            totalOut += out;
        }
    }

    function _buildSwapData(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address recipient
    ) internal pure returns (bytes memory) {
        // This packs a placeholder; your keeper should construct the *real* calldata for the chosen router.
        // struct: (router, tokenIn, tokenOut, amountIn, minOut, to, routerCalldata)
        // Use your off-chain bot to set minOut & routerCalldata from a DEX aggregator quote.
        return
            abi.encode(
                address(0), // router to be filled by keeper
                tokenIn,
                tokenOut,
                amountIn,
                0, // minOut (set by keeper)
                recipient,
                bytes("") // routerCalldata (set by keeper)
            );
    }
}
