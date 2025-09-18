// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IExchangeHandler.sol";
import "../utils/SafeTransferLib.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract ExchangeHandler is Initializable, UUPSUpgradeable, IExchangeHandler {
    using SafeTransferLib for address;

    address public owner;
    event OwnerUpdated(address indexed);
    event RouterSet(address indexed router, bool allowed);
    event Swap(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address to
    );

    // Whitelisted routers
    mapping(address => bool) public routers;

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    function initialize(address _owner) public initializer {
        __UUPSUpgradeable_init();
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

        // If amountIn not provided, take caller's full balance (the strategy’s balance)
        if (amountIn == 0 || amountIn == type(uint256).max) {
            amountIn = IERC20(tokenIn).balanceOf(msg.sender);
        }
        require(amountIn > 0, "NO_BALANCE");

        // ***** NEW: pull the tokens from the strategy into the handler *****
        // Strategy must have approved this handler for at least `amountIn`
        bool okPull = IERC20(tokenIn).transferFrom(
            msg.sender,
            address(this),
            amountIn
        );
        require(okPull, "PULL_FAIL");

        // Snapshot BEFORE
        uint256 balBefore = IERC20(tokenOut).balanceOf(to);

        // Approve router to spend handler's tokens
        tokenIn.safeApprove(router, 0);
        tokenIn.safeApprove(router, amountIn);

        // Call the router with the pre-encoded calldata (swapExactTokensForTokens, etc.)
        // (bool ok, bytes memory returnData) = router.call{value: amountIn}(routerCalldata);
        (bool ok, bytes memory returnData) = router.call(routerCalldata);
        if (!ok) {
            if (returnData.length > 0) {
                assembly {
                    revert(add(returnData, 32), mload(returnData))
                }
            }
            revert("ROUTER_CALL_FAIL");
        }

        // AFTER
        uint256 balAfter = IERC20(tokenOut).balanceOf(to);
        amountOut = balAfter - balBefore;
        require(amountOut >= minOut, "SLIPPAGE");
        emit Swap(router, tokenIn, tokenOut, amountIn, to);
    }

    function swapExact(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address to
    ) external override returns (uint256 amountOut) {
        // Example for UniV2-like routers: selector 0x38ed1739 swapExactTokensForTokens
        address router = _pickAnyRouter(); // will revert until a default router policy is added
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

    function _pickAnyRouter() internal pure returns (address r) {
        r = address(0);
        assembly { revert(0, 0) } // always revert; no unreachable code warning
    }

    function _simplePath(
        address a,
        address b
    ) internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = a;
        p[1] = b;
    }

    function _authorizeUpgrade(address /*newImplementation*/) internal view override {
        require(msg.sender == owner, "NOT_OWNER");
    }

    uint256[50] private __gap;
}
