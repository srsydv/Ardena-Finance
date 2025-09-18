// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../utils/SafeTransferLib.sol";
import "../interfaces/IStrategy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

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
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
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

    function increaseLiquidity(
        IncreaseLiquidityParams calldata params
    )
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1);

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

    function fee() external view returns (uint24);

    function tickSpacing() external view returns (int24);
}

interface IUniswapV3MathAdapter {
    function getSqrtRatioAtTick(int24 tick) external pure returns (uint160);
    function getAmountsForLiquidity(
        uint160 sqrtPriceX96,
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity
    ) external pure returns (uint256 amount0, uint256 amount1);
}

/// @notice Strategy assumes `want` is either token0 or token1.
/// Manager/keeper should prepare amounts (swap via ExchangeHandler) before calling deposit here.
contract UniswapV3Strategy is Initializable, UUPSUpgradeable, IStrategy {
    using SafeTransferLib for address;

    address public vault;
    address public wantToken; // e.g., USDC
    INonfungiblePositionManager public pm; // Uniswap's position manager
    IUniswapV3Pool public pool; // pool for (token0, token1, fee)
    IExchangeHandler public exchanger;
    IOracleRouter public oracle; // for valuation to `want`
    IUniswapV3MathAdapter public math; // math adapter (0.7.6 Uniswap libs)

    uint256 public tokenId; // LP NFT id held by this strategy


    event totalAsset(uint256 WETH, uint256 WANT, uint256 Fee0, uint256 Fee1);

    modifier onlyVault() {
        require(msg.sender == vault, "NOT_VAULT");
        _;
    }

    

    function initialize(
        address _vault,
        address _want,
        address _pm,
        address _pool,
        address _exchanger,
        address _oracle,
        address _math
    ) public initializer {
        __UUPSUpgradeable_init();
        require(
            _vault != address(0) &&
                _want != address(0) &&
                _pm != address(0) &&
                _pool != address(0) &&
                _exchanger != address(0) &&
                _oracle != address(0) &&
                _math != address(0),
            "BAD_ADDR"
        );
        vault = _vault;
        wantToken = _want;
        pm = INonfungiblePositionManager(_pm);
        pool = IUniswapV3Pool(_pool);
        exchanger = IExchangeHandler(_exchanger);
        oracle = IOracleRouter(_oracle);
        math = IUniswapV3MathAdapter(_math);
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
        // Use Uniswap math libs to convert liquidity → token amounts
        (uint256 amt0, uint256 amt1) = math.getAmountsForLiquidity(
            sqrtPriceX96,
            math.getSqrtRatioAtTick(tickLower),
            math.getSqrtRatioAtTick(tickUpper),
            liquidity
        );
        // For MVP, we conservatively value **only** uncollected fees + idle want to avoid complex math:
        // Add uncollected fees
        amt0 += fees0;
        amt1 += fees1;

        // Convert token0/token1 to `want` using oracle prices.
        uint256 valueInWant = _convertToWant(token0, amt0) +
            _convertToWant(token1, amt1);

        // Add idle want in the contract (e.g., dust from mint/collect)
        valueInWant += IERC20(wantToken).balanceOf(address(this));

        // emit totalAsset(amt0, amt1, fees0, fees1);
        return valueInWant;
        
    }

    function knowYourAssets() public  returns (uint256){
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
        // Use Uniswap math libs to convert liquidity → token amounts
        (uint256 amt0, uint256 amt1) = math.getAmountsForLiquidity(
            sqrtPriceX96,
            math.getSqrtRatioAtTick(tickLower),
            math.getSqrtRatioAtTick(tickUpper),
            liquidity
        );
        // For MVP, we conservatively value **only** uncollected fees + idle want to avoid complex math:
        // Add uncollected fees
        amt0 += fees0;
        amt1 += fees1;

        // Convert token0/token1 to `want` using oracle prices.
        uint256 valueInWant = _convertToWant(token0, amt0) +
            _convertToWant(token1, amt1);

        // Add idle want in the contract (e.g., dust from mint/collect)
        valueInWant += IERC20(wantToken).balanceOf(address(this));

        emit totalAsset(amt0, amt1, fees0, fees1);
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
        uint24 poolFee = pool.fee();
        int24 spacing = pool.tickSpacing();
        uint256 bal0 = IERC20(t0).balanceOf(address(this));
        uint256 bal1 = IERC20(t1).balanceOf(address(this));
        require(bal0 > 0 || bal1 > 0, "NO_FUNDS");

        t0.safeApprove(address(pm), 0);
        t0.safeApprove(address(pm), bal0);
        t1.safeApprove(address(pm), 0);
        t1.safeApprove(address(pm), bal1);

        if (tokenId == 0) {

            /*

int24 spacing = pool.tickSpacing();
(, int24 tick,,, , ,) = pool.slot0();

// floor-align for negatives
int24 base = (tick / spacing) * spacing;
if (tick < 0 && (tick % spacing) != 0) {
    base -= spacing;
}

// choose width (e.g., 100 spacings)
int24 k = 100;
int24 lower = base - k * spacing;
int24 upper = base + k * spacing;

// clamp to legal, spacing-aligned extrema
int24 minTick = (-887272 / spacing) * spacing; // MIN_TICK for v3
int24 maxTick = ( 887272 / spacing) * spacing; // MAX_TICK for v3
if (lower < minTick) lower = minTick;
if (upper > maxTick) upper = maxTick;

// sanity
require(lower < upper, "TLU");

            */
            // First deposit → mint a new position
            (, int24 currentTick, , , , , ) = pool.slot0();
            // int24 tickSpacing = 60;
            int24 lower = (currentTick / spacing - 100) * spacing;
            int24 upper = (currentTick / spacing + 100) * spacing;

            (uint256 _tokenId, , , ) = pm.mint(
                INonfungiblePositionManager.MintParams({
                    token0: t0,
                    token1: t1,
                    fee: poolFee,
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

    function withdraw(
        uint256 amountWant,
        bytes[] calldata swapData
    ) external override onlyVault returns (uint256 withdrawn) {
        require(tokenId != 0, "NO_POS");
        if (amountWant == 0) return 0;

        // 1. Calculate how much liquidity to remove for `amountWant`
        uint128 liqToPull = _calcLiquidityForAmount(amountWant);

        if (liqToPull == 0) return 0;

        // 2. Decrease proportional liquidity
        (uint256 out0, uint256 out1) = pm.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liqToPull,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );

        // 3. Collect fees + tokens from position
        (uint256 fee0, uint256 fee1) = pm.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // 4. Swap everything to `want` (USDC) using keeper-provided calldata
        uint256 before = IERC20(wantToken).balanceOf(address(this));
        _executeSwaps(swapData); // keeper prepared calldata
        uint256 afterBal = IERC20(wantToken).balanceOf(address(this));

        withdrawn = afterBal > before ? afterBal - before : 0;

        // 5. Send to Vault
        if (withdrawn > 0) {
            wantToken.safeTransfer(vault, withdrawn);
        }

        return withdrawn;
    }

    function _calcLiquidityForAmount(
        uint256 amountWant
    ) internal view returns (uint128) {
        (, , , , , , , uint128 totalLiq, , , , ) = pm.positions(tokenId);
        uint256 totalValue = totalAssets();
        if (totalValue == 0) return 0;

        uint256 ratio = (amountWant * 1e18) / totalValue;
        return uint128((uint256(totalLiq) * ratio) / 1e18);
    }

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
    function harvest(
        bytes[] calldata swapData
    ) external override onlyVault returns (uint256 profit) {
        if (tokenId == 0) return 0;

        // Step 1: Collect all pending fees from Uniswap v3 position
        (uint256 fee0, uint256 fee1) = pm.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // Step 2: Snapshot balance of want before swaps
        uint256 before = IERC20(wantToken).balanceOf(address(this));

        // Step 3: Swap all balances of token0/token1 → want using keeper-provided calldata
        _executeSwaps(swapData);

        // Step 4: Snapshot balance after swaps
        uint256 afterBal = IERC20(wantToken).balanceOf(address(this));

        // Step 5: Profit = net increase in want
        profit = afterBal > before ? afterBal - before : 0;

        // Step 6: Send realized profit to Vault
        if (profit > 0) wantToken.safeTransfer(vault, profit);
    }

    // ---------------- Internals ----------------

    function _convertToWant(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        if (amount == 0) return 0;
        if (token == wantToken) return amount;

        //Find the decimals
        uint8 tokenDec = IERC20Metadata(token).decimals();
        uint8 wantDec = IERC20Metadata(wantToken).decimals();

        // convert token amount to 18 decimals
        uint256 amt18 = _scaleDecimals(amount, tokenDec, 18);

        // Convert via USD as numeraire using oracle and get prices (both 1e18)
        uint256 pToken = oracle.price(token); // 1e18
        uint256 pWant = oracle.price(wantToken); // 1e18
        if (pToken == 0 || pWant == 0) return 0;

        // value in want (scaled to 18 decimals)
        uint256 value18 = (amt18 * pToken) / pWant;
        // value_in_want = amount * pToken / pWant (adjust for token decimals if needed)
        return _scaleDecimals(value18, 18, wantDec);
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
            (address router, address tokenIn, , uint256 amountIn, , , ) = abi
                .decode(
                    swapCalldatas[i],
                    (
                        address,
                        address,
                        address,
                        uint256,
                        uint256,
                        address,
                        bytes
                    )
                );

            // Approve ExchangeHandler to pull tokens from THIS strategy
            if (amountIn == 0 || amountIn == type(uint256).max) {
                amountIn = IERC20(tokenIn).balanceOf(address(this));
            }
            if (amountIn > 0) {
                IERC20(tokenIn).approve(address(exchanger), 0);
                IERC20(tokenIn).approve(address(exchanger), amountIn);
            }

            // Call the exchanger
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

    function _authorizeUpgrade(address /*newImplementation*/) internal view override {
        require(msg.sender == vault, "NOT_VAULT");
    }

    uint256[50] private __gap;
}
