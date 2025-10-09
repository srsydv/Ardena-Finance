// offchain-example.js
const { ethers } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

// EIP-712 Domain & types
const domain = {
  name: "Aconomy Vote",
  version: "1",
  chainId: 137, // chain id of Chain B for signing context; can be any value used by EIP-712
  verifyingContract: "0x0000000000000000000000000000000000000000" // not used for off-chain aggregator, but part of domain
};

const types = {
  Vote: [
    { name: "proposalId", type: "uint256" },
    { name: "voter", type: "address" },
    { name: "support", type: "bool" },
    { name: "ratioAave", type: "uint256" },
    { name: "ratioUni", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};

// 1) Voter signs
async function signVote(wallet, vote) {
  // wallet: ethers.Wallet instance
  // vote: object matching Vote type
  return await wallet._signTypedData(domain, types, vote);
}

// 2) Aggregator builds merkle tree of votes
function buildVotesTree(signedVotes) {
  // Each leaf MUST use the same encoding as the on-chain voteLeaf
  const leaves = signedVotes.map(v => {
    // v has fields: voter,bool support, ratioAave, ratioUni, nonce, deadline
    return keccak256(Buffer.from(
      ethers.utils.solidityPack(
        ["address","uint256","uint256","uint256","uint256","uint256"],
        [v.voter, v.support ? 1 : 0, v.ratioAave, v.ratioUni, v.nonce, v.deadline]
      ).slice(2), 'hex'
    ));
  });
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  return { tree, leaves };
}

// 3) Aggregator builds power tree: leaves = keccak(voter, power)
function buildPowerTree(powerRecords) {
  const leaves = powerRecords.map(p => keccak256(Buffer.from(
    ethers.utils.solidityPack(["address","uint256"], [p.voter, p.weight]).slice(2),
    'hex'
  )));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  return { tree, leaves };
}

// Example usage:
(async () => {
  // create temporary wallets for voters
  const w1 = ethers.Wallet.createRandom(); // voter 1
  const w2 = ethers.Wallet.createRandom(); // voter 2

  const proposalId = 42;
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + 60 * 60 * 24; // 24 hours

  // Voter 1 vote
  const vote1 = {
    proposalId,
    voter: w1.address,
    support: true,
    ratioAave: 6000, // e.g., 60.00% (use convention)
    ratioUni: 4000,
    nonce: 1,
    deadline
  };
  const sig1 = await signVote(w1, vote1);

  // Voter 2 vote
  const vote2 = {
    proposalId,
    voter: w2.address,
    support: false,
    ratioAave: 3000,
    ratioUni: 7000,
    nonce: 1,
    deadline
  };
  const sig2 = await signVote(w2, vote2);

  // Aggregator collects signed votes (including signature maybe for offchain record)
  const signedVotes = [
    { ...vote1, sig: sig1 },
    { ...vote2, sig: sig2 }
  ];

  // Build votes tree & root
  const { tree: votesTree } = buildVotesTree(signedVotes);
  const votesRoot = votesTree.getRoot().toString('hex');
  console.log("votesRoot 0x" + votesRoot);

  // Suppose governance snapshot gave powers:
  const powers = [
    { voter: w1.address, weight: 1000 },
    { voter: w2.address, weight: 500 }
  ];
  const { tree: powerTree } = buildPowerTree(powers);
  const powerRoot = powerTree.getRoot().toString('hex');
  console.log("powerRoot 0x" + powerRoot);

  // voter1: compute proofs
  const vote1Leaf = keccak256(Buffer.from(
    ethers.utils.solidityPack(
      ["address","uint256","uint256","uint256","uint256","uint256"],
      [vote1.voter, vote1.support ? 1 : 0, vote1.ratioAave, vote1.ratioUni, vote1.nonce, vote1.deadline]
    ).slice(2), 'hex'
  ));
  const vote1Proof = votesTree.getProof(vote1Leaf).map(x => '0x'+x.data.toString('hex'));

  const powerLeaf1 = keccak256(Buffer.from(
    ethers.utils.solidityPack(["address","uint256"], [powers[0].voter, powers[0].weight]).slice(2),
    'hex'
  ));
  const powerProof1 = powerTree.getProof(powerLeaf1).map(x => '0x'+x.data.toString('hex'));

  console.log({ vote1Proof, powerProof1, sig1 });

  // The aggregator publishes votesRoot and powerRoot (owner calls setProposal on-chain)
  // Then voter (or relayer) calls VoteVerifier.submitVoteWithProof(...) providing:
  // (proposalId, voter, support, ratioAave, ratioUni, nonce, deadline,
  //  sig, votesProof, powerWeight, powerProof)
})();