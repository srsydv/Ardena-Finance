// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 * VoteVerifier.sol
 *
 * - Uses OpenZeppelin EIP712 for typed-data hashing
 * - Verifies EIP-712 signatures for Vote typed struct
 * - Verifies Merkle inclusion of the signed vote inside a submitted votesRoot
 * - Verifies Merkle inclusion of voter power inside a powerRoot (weight)
 * - Prevents double-counting
 * - Tally weighted votes and emits ProposalPassed when threshold reached
 *
 * NOTE: This contract assumes an off-chain actor (governance publisher)
 * will call setProposal(...) to register votesRoot & powerRoot for a proposal.
 */

import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract VoteVerifier is Initializable, EIP712Upgradeable, UUPSUpgradeable {
    using ECDSA for bytes32;
    using MerkleProof for bytes32[];

    struct Proposal {
        bytes32 votesRoot;    // merkle root of signed votes (leaves = keccak256(abi.encodePacked(voter, support, ratioAave, ratioUni, nonce)))
        bytes32 powerRoot;    // merkle root of voter powers (leaves = keccak256(abi.encodePacked(voter, weight)))
        uint256 yesWeight;    // accumulated weighted yes votes
        uint256 noWeight;     // accumulated weighted no votes
        bool passed;          // whether proposal passed already
        uint256 threshold;    // weight threshold to pass (e.g., simple majority or fixed threshold)
        uint256 quorum;       // optional quorum weight required (0 if unused)
        uint256 deadline;     // last timestamp when votes for this proposal accepted
    }

    // Owner address
    address public owner;

    // mapping proposalId => Proposal
    mapping(uint256 => Proposal) public proposals;

    // prevent double counting: proposalId => voter => counted
    mapping(uint256 => mapping(address => bool)) public counted;

    // EIP-712 type hash for Vote
    // Vote(uint256 proposalId, address voter, bool support, uint256 ratioAave, uint256 ratioUni, uint256 nonce, uint256 deadline)
    bytes32 private constant VOTE_TYPEHASH = keccak256(
        "Vote(uint256 proposalId,address voter,bool support,uint256 ratioAave,uint256 ratioUni,uint256 nonce,uint256 deadline)"
    );

    event ProposalSet(uint256 indexed proposalId, bytes32 votesRoot, bytes32 powerRoot, uint256 threshold, uint256 quorum, uint256 deadline);
    event VoteCounted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalPassed(uint256 indexed proposalId, bytes32 votesRoot, bytes32 powerRoot, uint256 yesWeight, uint256 noWeight);
    event OwnerUpdated(address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (replaces constructor for upgradeable contracts)
     * @param name The EIP712 domain name
     * @param version The EIP712 domain version
     */
    function initialize(string memory name, string memory version) public initializer {
        __EIP712_init(name, version);
        __UUPSUpgradeable_init();
        owner = msg.sender;
    }

    /**
     * @notice Owner publishes a proposal with the votesRoot and powerRoot and parameters.
     *         Normally this will be set by the GovernanceRootPublisher/relayer on Chain B.
     */
    function setProposal(
        uint256 proposalId,
        bytes32 votesRoot,
        bytes32 powerRoot,
        uint256 threshold,
        uint256 quorum,
        uint256 deadline
    ) external onlyOwner {
        Proposal storage p = proposals[proposalId];
        require(p.votesRoot == bytes32(0), "proposal already set");
        p.votesRoot = votesRoot;
        p.powerRoot = powerRoot;
        p.threshold = threshold;
        p.quorum = quorum;
        p.deadline = deadline;
        p.yesWeight = 0;
        p.noWeight = 0;
        p.passed = false;

        emit ProposalSet(proposalId, votesRoot, powerRoot, threshold, quorum, deadline);
    }

    /**
     * @notice Submit one vote proof+signature to be tallied.
     * @param proposalId The proposal id
     * @param voter The address that signed the vote
     * @param support bool indicating vote direction
     * @param ratioAave ratio expressed as integer (e.g., 6000 means 60.00% with implied decimals)
     * @param ratioUni same as above
     * @param nonce unique nonce in the off-chain vote message
     * @param voteDeadline deadline from the vote (must be <= proposal.deadline)
     * @param sig EIP-712 signature over the Vote struct
     * @param votesProof Merkle proof that the vote leaf is included in proposals[proposalId].votesRoot
     * @param powerWeight the voting weight claimed for voter (uint256)
     * @param powerProof Merkle proof that keccak(voter, powerWeight) is included in proposals[proposalId].powerRoot
     */
    function submitVoteWithProof(
        uint256 proposalId,
        address voter,
        bool support,
        uint256 ratioAave,
        uint256 ratioUni,
        uint256 nonce,
        uint256 voteDeadline,
        bytes calldata sig,
        bytes32[] calldata votesProof,
        uint256 powerWeight,
        bytes32[] calldata powerProof
    ) external {
        Proposal storage p = proposals[proposalId];
        require(p.votesRoot != bytes32(0), "proposal not set");
        require(block.timestamp <= p.deadline, "proposal expired");
        require(voteDeadline <= p.deadline, "vote deadline after proposal deadline");
        require(!p.passed, "already passed");
        require(!counted[proposalId][voter], "vote already counted for voter");

        // Verify signature and proofs
        _verifySignature(proposalId, voter, support, ratioAave, ratioUni, nonce, voteDeadline, sig);
        _verifyVoteProof(p.votesRoot, voter, support, ratioAave, ratioUni, nonce, voteDeadline, votesProof);
        _verifyPowerProof(p.powerRoot, voter, powerWeight, powerProof);

        // Mark as counted and tally
        counted[proposalId][voter] = true;
        if (support) {
            p.yesWeight += powerWeight;
        } else {
            p.noWeight += powerWeight;
        }

        emit VoteCounted(proposalId, voter, support, powerWeight);

        // Check passing condition
        if (p.yesWeight >= p.threshold || (p.yesWeight > p.noWeight && (p.quorum == 0 || p.yesWeight >= p.quorum))) {
            p.passed = true;
            emit ProposalPassed(proposalId, p.votesRoot, p.powerRoot, p.yesWeight, p.noWeight);
        }
    }

    function _verifySignature(
        uint256 proposalId,
        address voter,
        bool support,
        uint256 ratioAave,
        uint256 ratioUni,
        uint256 nonce,
        uint256 voteDeadline,
        bytes calldata sig
    ) internal view {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            VOTE_TYPEHASH,
            proposalId,
            voter,
            support ? uint256(1) : uint256(0),
            ratioAave,
            ratioUni,
            nonce,
            voteDeadline
        )));
        require(ECDSA.recover(digest, sig) == voter, "invalid signature");
    }

    function _verifyVoteProof(
        bytes32 votesRoot,
        address voter,
        bool support,
        uint256 ratioAave,
        uint256 ratioUni,
        uint256 nonce,
        uint256 voteDeadline,
        bytes32[] calldata votesProof
    ) internal pure {
        bytes32 voteLeaf = keccak256(abi.encodePacked(voter, support ? uint256(1) : uint256(0), ratioAave, ratioUni, nonce, voteDeadline));
        require(votesProof.verify(votesRoot, voteLeaf), "vote proof invalid");
    }

    function _verifyPowerProof(
        bytes32 powerRoot,
        address voter,
        uint256 powerWeight,
        bytes32[] calldata powerProof
    ) internal pure {
        bytes32 powerLeaf = keccak256(abi.encodePacked(voter, powerWeight));
        require(powerProof.verify(powerRoot, powerLeaf), "power proof invalid");
    }

    /**
     * @notice Transfer ownership to a new owner
     * @param newOwner The address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_ADDRESS");
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    /**
     * @notice UUPS upgrade authorization
     * @dev Only owner can authorize upgrades
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @notice Admin can update threshold/quorum/proposal deadline or cancel (not shown for simplicity).
     * Additional helper getters provided by public `proposals` mapping.
     */

    // Utility read helpers are available via the public mapping and counted mapping.
    
    /**
     * @dev Storage gap for future upgrades
     */
    uint256[50] private __gap;
}