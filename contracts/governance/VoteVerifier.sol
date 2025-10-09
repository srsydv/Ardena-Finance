// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

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

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VoteVerifier is EIP712, Ownable {
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

    constructor(string memory name, string memory version) EIP712(name, version) {}

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

        // 1) Verify EIP-712 signature (signature must be by voter)
        bytes32 structHash = keccak256(abi.encode(
            VOTE_TYPEHASH,
            proposalId,
            voter,
            support ? uint256(1) : uint256(0),
            ratioAave,
            ratioUni,
            nonce,
            voteDeadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, sig);
        require(signer == voter, "invalid signature");

        // 2) Verify the vote leaf is included in the votesRoot (prevent arbitrary forged signatures)
        //    The off-chain aggregator should build leaves in identical format:
        //    leaf = keccak256(abi.encodePacked(voter, support ? 1 : 0, ratioAave, ratioUni, nonce, voteDeadline))
        bytes32 voteLeaf = keccak256(abi.encodePacked(voter, support ? uint256(1) : uint256(0), ratioAave, ratioUni, nonce, voteDeadline));
        require(votesProof.verify(p.votesRoot, voteLeaf), "vote proof invalid");

        // 3) Verify the voter's weight via powerRoot (leaf = keccak256(abi.encodePacked(voter, powerWeight)))
        bytes32 powerLeaf = keccak256(abi.encodePacked(voter, powerWeight));
        require(powerProof.verify(p.powerRoot, powerLeaf), "power proof invalid");

        // 4) Mark as counted and tally
        counted[proposalId][voter] = true;
        if (support) {
            p.yesWeight += powerWeight;
        } else {
            p.noWeight += powerWeight;
        }

        emit VoteCounted(proposalId, voter, support, powerWeight);

        // 5) Optional: check passing condition. If yes, mark passed and emit event
        // For simplicity, we define pass if yesWeight >= threshold OR (yesWeight > noWeight && yesWeight >= quorum)
        if (p.yesWeight >= p.threshold || (p.yesWeight > p.noWeight && (p.quorum == 0 || p.yesWeight >= p.quorum))) {
            p.passed = true;
            emit ProposalPassed(proposalId, p.votesRoot, p.powerRoot, p.yesWeight, p.noWeight);
        }
    }

    /**
     * @notice Admin can update threshold/quorum/proposal deadline or cancel (not shown for simplicity).
     * Additional helper getters provided by public `proposals` mapping.
     */

    // Utility read helpers are available via the public mapping and counted mapping.
}