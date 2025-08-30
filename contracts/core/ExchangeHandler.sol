// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IExchangeHandler.sol";
import "../utils/SafeTransferLib.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);

    function approve(address, uint256) external returns (bool);
}

contract ExchangeHandler is IExchangeHandler {
    using SafeTransferLib for address;

    address public owner;
    event OwnerUpdated(address indexed);
    event RouterSet(address indexed router, bool allowed);

    // Whitelisted routers
    mapping(address => bool) public routers;

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(address _owner) {
        owner = _owner;
    }

    function setOwner(address _owner) external onlyOwner {
        owner = _owner;
        emit OwnerUpdated(_owner);
    }

    function setRouter(address router, bool ok) external onlyOwner {
        routers[router] = ok;
        emit RouterSet(router, ok);
    }

    /// @dev `data` layout = abi.encode(
    ///   router, tokenIn, tokenOut, amountIn, minOut, to, routerCalldata
    /// )
    function swap(
        bytes calldata data
    ) external override returns (uint256 amountOut) {
        (
            address router,
            address tokenIn,
            address tokenOut,
            uint256 amountIn,
            uint256 minOut,
            address to,
            bytes memory routerCalldata
        ) = abi.decode(
                data,
                (address, address, address, uint256, uint256, address, bytes)
            );

        require(routers[router], "ROUTER_NOT_ALLOWED");

        // If keeper passed 0 or max, take full balance
        if (amountIn == 0 || amountIn == type(uint256).max) {
            amountIn = IERC20(tokenIn).balanceOf(address(this));
        }
        require(amountIn > 0, "NO_BALANCE");

        // Snapshot balance of tokenOut BEFORE swap
        uint256 balBefore = IERC20(tokenOut).balanceOf(to);

        // Approve router to spend tokenIn
        tokenIn.safeApprove(router, 0);
        tokenIn.safeApprove(router, amountIn);

        // Low-level call to router
        (bool ok, ) = router.call(routerCalldata);
        require(ok, "ROUTER_CALL_FAIL");

        // Snapshot balance AFTER swap
        uint256 balAfter = IERC20(tokenOut).balanceOf(to);

        amountOut = balAfter - balBefore;
        require(amountOut >= minOut, "SLIPPAGE");
    }

    function swapExact(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address to
    ) external override returns (uint256 amountOut) {
        // Example for UniV2-like routers: selector 0x38ed1739 swapExactTokensForTokens
        address router = _pickAnyRouter();
        bytes memory callData = abi.encodeWithSelector(
            bytes4(0x38ed1739), // swapExactTokensForTokens
            amountIn,
            minOut,
            _simplePath(tokenIn, tokenOut),
            to,
            block.timestamp
        );
        bytes memory pack = abi.encode(
            router,
            tokenIn,
            tokenOut,
            amountIn,
            minOut,
            to,
            callData
        );
        amountOut = this.swap(pack);
    }

    function _pickAnyRouter() internal view returns (address r) {
        revert("NO_DEFAULT_ROUTER"); // MVP: must be specified off-chain
    }

    function _simplePath(
        address a,
        address b
    ) internal pure returns (address[] memory p) {
        p = new address;
        p[0] = a;
        p[1] = b;
    }
}
