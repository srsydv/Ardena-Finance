// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;
// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";



// /// Minimal robust mock swap router for tests.
// /// - Accepts exactInputSingle(ExactInputSingleParams)
// /// - Pulls tokenIn from caller (transferFrom(msg.sender,...)) NOT from strategy
// /// - Pays tokenOut to recipient by attempting:
// //    1) IERC20(tokenOut).transfer(recipient, amountOut) (router balance)
// //    2) if that fails, attempts IERC20(tokenOut).transferFrom(msg.sender, recipient, amountOut)
// //    3) if both fail, revert with a clear message "PAY_FAILED"

// contract MockSwapRouter {
//     event DebugPulledIn(address caller, address tokenIn, uint256 amountIn);
//     event DebugPaidOut(address recipient, address tokenOut, uint256 amountOut, uint8 method);

//     struct ExactInputSingleParams {
//         address tokenIn;
//         address tokenOut;
//         uint24 fee;
//         address recipient;
//         uint256 deadline;
//         uint256 amountIn;
//         uint256 amountOutMinimum;
//         uint160 sqrtPriceLimitX96;
//     }

//     /// @notice Simplified swap. Caller must have approved router to pull tokenIn.
//     function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
//         // 1) Pull tokenIn from caller into router
//         require(IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn), "PULL_IN_FAILED");
//         emit DebugPulledIn(msg.sender, params.tokenIn, params.amountIn);

//         // 2) Compute amountOut (naive 1:1 scaled by decimals and fee)
//         uint8 decIn = 18;
//         uint8 decOut = 18;
//         try IERC20Metadata(params.tokenIn).decimals() returns (uint8 dIn) { decIn = dIn; } catch {}
//         try IERC20Metadata(params.tokenOut).decimals() returns (uint8 dOut) { decOut = dOut; } catch {}

//         uint256 scaled = params.amountIn;
//         if (decOut > decIn) {
//             scaled = params.amountIn * (10 ** (decOut - decIn));
//         } else if (decIn > decOut) {
//             scaled = params.amountIn / (10 ** (decIn - decOut));
//         }

//         // crude fee application (param.fee * 1000 -> ppm)
//         uint256 feePPM = uint256(params.fee) * 1000;
//         if (feePPM > 1e6) feePPM = 1e6;
//         amountOut = (scaled * (1e6 - feePPM)) / 1e6;

//         // 3) Attempt to pay out tokenOut to recipient.
//         //    Try router.balance -> transfer(recipient), otherwise try transferFrom(msg.sender, recipient).
//         bool ok;

//         // Try native transfer from router's own balance first.
//         try IERC20(params.tokenOut).transfer(params.recipient, amountOut) returns (bool r) {
//             ok = r;
//             if (ok) {
//                 emit DebugPaidOut(params.recipient, params.tokenOut, amountOut, 1);
//                 return amountOut;
//             }
//         } catch {}

//         // If that failed, try to pull tokenOut FROM the caller (msg.sender) to recipient
//         try IERC20(params.tokenOut).transferFrom(msg.sender, params.recipient, amountOut) returns (bool r2) {
//             ok = r2;
//             if (ok) {
//                 emit DebugPaidOut(params.recipient, params.tokenOut, amountOut, 2);
//                 return amountOut;
//             }
//         } catch {}

//         // If neither worked, revert with clear message
//         revert("PAY_FAILED");
//     }
// }
