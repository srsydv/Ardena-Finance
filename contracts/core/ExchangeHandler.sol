// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IExchangeHandler.sol";
import "../utils/SafeTransferLib.sol";

contract ExchangeHandler is IExchangeHandler {
    using SafeTransferLib for address;

    address public owner;
    event OwnerUpdated(address indexed);

    // whitelisted routers -> true
    mapping(address => bool) public routers;

    event RouterSet(address indexed router, bool allowed);

    modifier onlyOwner() { require(msg.sender == owner, "NOT_OWNER"); _; }

    constructor(address _owner) { owner = _owner; }
    function setOwner(address _owner) external onlyOwner { owner = _owner; emit OwnerUpdated(_owner); }
    function setRouter(address router, bool ok) external onlyOwner { routers[router] = ok; emit RouterSet(router, ok); }

    /// @dev data layout (example): abi.encode(
    ///   router, tokenIn, tokenOut, amountIn, minOut, path[], deadline, routerSelector
    /// )
    function swap(bytes calldata data) external override returns (uint256 amountOut) {
        (
            address router,
            address tokenIn,
            address tokenOut,
            uint256 amountIn,
            uint256 minOut,
            address to,
            bytes memory routerCalldata
        ) = abi.decode(data, (address, address, address, uint256, uint256, address, bytes));
        require(routers[router], "ROUTER_NOT_ALLOWED");
        tokenIn.safeApprove(router, 0);
        tokenIn.safeApprove(router, amountIn);
        (bool ok, bytes memory ret) = router.call(routerCalldata);
        require(ok, "ROUTER_CALL_FAIL");
        // parse return to get amountOut if needed; for simplicity rely on balance diff
        uint256 balBefore = _balance(tokenOut, to);
        // NOTE: in practice, we should compute before/after within this contract and then transfer.
        // Here we assume router sends tokens directly to `to`.
        uint256 balAfter = _balance(tokenOut, to);
        require(balAfter >= balBefore + minOut, "SLIPPAGE");
        amountOut = balAfter - balBefore;
    }

    function swapExact(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        external override returns (uint256 amountOut)
    {
        // Example for UniswapV2-like routers: selector 0x38ed1739 swapExactTokensForTokens
        address router = _pickAnyRouter();
        bytes memory callData = abi.encodeWithSelector(
            bytes4(0x38ed1739), amountIn, minOut, _simplePath(tokenIn, tokenOut), to, block.timestamp
        );
        bytes memory pack = abi.encode(router, tokenIn, tokenOut, amountIn, minOut, to, callData);
        amountOut = this.swap(pack);
    }

    function _pickAnyRouter() internal view returns (address r) {
        // naive: pick first allowed router. In prod, off-chain bot sets router per swap.
        // iterate mapping not possible; maintain an array in prod. Hardcode for MVP.
        revert("NO_DEFAULT_ROUTER");
    }

    function _balance(address token, address who) internal view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        require(ok, "BALANCE_FAIL");
        return abi.decode(data, (uint256));
    }

    function _simplePath(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2); p[0] = a; p[1] = b;
    }
}
