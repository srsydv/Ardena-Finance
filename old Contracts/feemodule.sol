// In these contracts, `want()` refers to the **underlying ERC20 token** that the strategy is designed to manage.

// ### Why it’s called `want`
// - In the DeFi vault pattern (popularized by Yearn), `want` is shorthand for *“the token you want the strategy to earn/hold.”*
// - It must match the **Vault’s base asset**.
// - Example: if the Vault is a USDC vault, then every attached strategy’s `want()` must return the USDC contract address.

// ### Purpose
// - Ensures compatibility: Vault only interacts with strategies that handle the same token.
// - Prevents misconfiguration (e.g., plugging a DAI strategy into a USDC vault).

// ### Example
// ```solidity
// // Inside AaveV3Strategy
// address public immutable wantToken; // set in constructor

// function want() external view override returns (address) {
//     return wantToken;
// }
// ```

// If the Vault is a **USDC Vault**, then `want()` for every attached strategy should return the **USDC token address**. This way:
// - Deposits from Vault into strategy are in USDC.
// - Withdrawals back to Vault are in USDC.
// - Harvest profits are reported in USDC.

// So: **`want()` is simply the Vault’s underlying token (the asset everyone deposits and withdraws).**

// // ============================================================================
// // OPTIONAL MODULE: Fee Discounts (veVELVET tiers, referrals, etc.)
// // ----------------------------------------------------------------------------
// // This section adds an opt-in discount system so certain users (e.g., veVELVET
// // lockers, referrers, partners) get lower entry/exit/management/performance fees.
// //
// // How it works:
// // 1) Vault calls FeeModule.takeEntryFeeFor(user, amount) and takeExitFeeFor(user, amount)
// //    instead of the non-user versions, passing the depositor/withdrawer.
// // 2) FeeModule consults a pluggable DiscountPolicy contract to compute effective BPS.
// // 3) Governor (multisig/DAO) can update the discount policy contract at any time.
// //
// // In production you’d implement DiscountPolicy to read veVELVET voting-escrow locks
// // (or a Merkle-based allowlist, or referral tiers). Here we provide a simple tiered
// // policy by token holdings for clarity.
// // ============================================================================

// // -------------------------------
// // interfaces/IFeeDiscountPolicy.sol
// // -------------------------------
// interface IFeeDiscountPolicy {
//     /// @notice Return the effective fee in BPS for a given user and base fee type.
//     /// @param user    The user being charged a fee.
//     /// @param baseBps The base fee (e.g., entryFeeBps) configured in FeeModule.
//     /// @param feeKind 0=ENTRY, 1=EXIT, 2=MGMT, 3=PERF
//     /// @return effBps The effective fee to apply (in BPS), after discount logic.
//     function effectiveFeeBps(address user, uint16 baseBps, uint8 feeKind) external view returns (uint16 effBps);
// }

// // ---------------------------------
// // policies/TieredDiscountPolicy.sol (example)
// // ---------------------------------
// contract TieredDiscountPolicy is IFeeDiscountPolicy {
//     /// @dev Very simple tiering: hold token `tierToken` to unlock fee reductions.
//     /// This is just an example. In production, point to veVELVET locker balance/lock duration.
//     address public immutable tierToken;

//     // thresholds and discounts in BPS (1e4 = 100%)
//     struct Tier { uint256 minBalance; uint16 discountBps; }
//     Tier[] public tiers; // sorted ascending by minBalance

//     constructor(address _tierToken, Tier[] memory _tiers) {
//         tierToken = _tierToken;
//         for (uint i; i < _tiers.length; i++) tiers.push(_tiers[i]);
//     }

//     function effectiveFeeBps(address user, uint16 baseBps, uint8 /*feeKind*/)
//         external view override returns (uint16 effBps)
//     {
//         uint256 bal = _balanceOf(tierToken, user);
//         uint16 maxDiscount;
//         for (uint i; i < tiers.length; i++) if (bal >= tiers[i].minBalance) {
//             if (tiers[i].discountBps > maxDiscount) maxDiscount = tiers[i].discountBps;
//         }
//         // clamp: eff = base * (1 - discountBps/1e4)
//         uint256 eff = (uint256(baseBps) * (1e4 - maxDiscount)) / 1e4;
//         if (eff > type(uint16).max) eff = type(uint16).max;
//         effBps = uint16(eff);
//     }

//     function _balanceOf(address token, address who) internal view returns (uint256) {
//         (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
//         require(ok, "BAL_VIEW_FAIL");
//         return abi.decode(data, (uint256));
//     }
// }

// // -----------------------
// // core/FeeModule (extension)
// // -----------------------
// contract FeeModuleWithDiscounts is FeeModule {
//     IFeeDiscountPolicy public discountPolicy; // optional, can be zero address

//     event DiscountPolicyUpdated(address indexed policy);

//     constructor(address _asset, address _treasury, address _governor)
//         FeeModule(_asset, _treasury, _governor) {}

//     function setDiscountPolicy(address policy) external onlyGovernor {
//         discountPolicy = IFeeDiscountPolicy(policy);
//         emit DiscountPolicyUpdated(policy);
//     }

//     function _eff(address user, uint16 baseBps, uint8 kind) internal view returns (uint16) {
//         if (address(discountPolicy) == address(0)) return baseBps;
//         return discountPolicy.effectiveFeeBps(user, baseBps, kind);
//     }

//     // --- User-aware entry/exit fees ---
//     function takeEntryFeeFor(address user, uint256 amount) external returns (uint256 net, uint256 fee) {
//         uint16 bps = _eff(user, managementFeeBps /* placeholder, will be replaced below */, 0);
//         // NOTE: we used managementFeeBps here only to reuse storage; we actually need entryFeeBps.
//         // Since FeeModule maintains entryFeeBps, read it via an internal getter in the base (omitted in MVP).
//         // For clarity, assume we have a public entryFeeBps in FeeModule; we’ll read it directly:
//         bps = _eff(user, entryFeeBps, 0); // 0 = ENTRY
//         fee = (amount * bps) / 1e4;
//         if (fee > 0) asset.safeTransfer(treasury, fee);
//         net = amount - fee;
//     }

//     function takeExitFeeFor(address user, uint256 amount) external returns (uint256 net, uint256 fee) {
//         uint16 bps = _eff(user, exitFeeBps, 1); // 1 = EXIT
//         fee = (amount * bps) / 1e4;
//         if (fee > 0) asset.safeTransfer(treasury, fee);
//         net = amount - fee;
//     }

//     // --- Mgmt/perf fee (keeper-time) ---
//     function computeMgmtFeeFor(address user, uint256 tvl) external view returns (uint256) {
//         uint16 bps = _eff(user, managementFeeBps, 2); // 2 = MGMT
//         if (bps == 0) return 0;
//         uint256 dt = block.timestamp - lastFeeTimestamp;
//         return (tvl * bps * dt) / (365 days * 1e4);
//     }
// }

// // -----------------------
// // core/Vault changes (diff)
// // -----------------------
// // In Vault.deposit and Vault.withdraw, call user-aware fee functions if FeeModule supports them.
// // Pseudocode replacement (keep backward compatibility by checking code size):
// /*
// function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
//     asset.safeTransferFrom(msg.sender, address(this), assets);
//     (uint256 net, ) = _takeEntry(msg.sender, assets); // UPDATED
//     shares = convertToShares(net);
//     _mint(receiver, shares);
// }

// function _takeEntry(address user, uint256 amount) internal returns (uint256 net, uint256 fee) {
//     // if fees is FeeModuleWithDiscounts, use takeEntryFeeFor; else fallback to takeEntryFee
//     if (_isDiscounts(address(fees))) {
//         (bool ok, bytes memory ret) = address(fees).call(abi.encodeWithSignature("takeEntryFeeFor(address,uint256)", user, amount));
//         if (ok) return abi.decode(ret, (uint256, uint256));
//     }
//     return fees.takeEntryFee(amount); // fallback
// }

// function withdraw(uint256 shares, address receiver) external returns (uint256 assets) {
//     assets = convertToAssets(shares);
//     _burn(msg.sender, shares);
//     if (_isDiscounts(address(fees))) {
//         (bool ok, bytes memory ret) = address(fees).call(abi.encodeWithSignature("takeExitFeeFor(address,uint256)", msg.sender, assets));
//         if (ok) {
//             (uint256 net, ) = abi.decode(ret, (uint256, uint256));
//             asset.safeTransfer(receiver, net);
//             return net;
//         }
//     }
//     (uint256 net, ) = fees.takeExitFee(assets);
//     asset.safeTransfer(receiver, net);
// }

// function _isDiscounts(address mod) internal view returns (bool) {
//     uint256 size; assembly { size := extcodesize(mod) }
//     return size > 0; // simplistic check; optionally cache an interface flag
// }
// */

// // -----------------------
// // Setup notes
// // -----------------------
// // 1) Deploy FeeModuleWithDiscounts instead of FeeModule for Vaults wanting discounts.
// // 2) Deploy TieredDiscountPolicy with your tiers, or a veVELVET-aware policy.
// // 3) Call setDiscountPolicy(policy) from the governor (multisig/DAO).
// // 4) Ensure Vault routes to the user-aware fee helpers as shown in the diff.


