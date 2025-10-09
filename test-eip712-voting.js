import dotenv from "dotenv";
dotenv.config();
import hre from "hardhat";
const { ethers } = hre;
import { MerkleTree } from "merkletreejs";
import keccak256Lib from "keccak256";

// EIP-712 Domain & types
// IMPORTANT: Must match VoteVerifier.sol initialize() parameters
const domain = {
  name: "Ardena Finance",
  version: "1",
  chainId: 11155111, // Sepolia
  verifyingContract: "0xf37A4CA4608c1F6A5Fb944086Ce7526D39d90657" // VoteVerifier Proxy
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
  return await wallet.signTypedData(domain, types, vote);
}

// 2) Aggregator builds merkle tree of votes
function buildVotesTree(signedVotes) {
  const leaves = signedVotes.map(v => {
    const packed = ethers.solidityPacked(
      ["address","uint256","uint256","uint256","uint256","uint256"],
      [v.voter, v.support ? 1 : 0, v.ratioAave, v.ratioUni, v.nonce, v.deadline]
    );
    return keccak256Lib(Buffer.from(packed.slice(2), 'hex'));
  });
  const tree = new MerkleTree(leaves, keccak256Lib, { sortPairs: true });
  return { tree, leaves };
}

// 3) Aggregator builds power tree
function buildPowerTree(powerRecords) {
  const leaves = powerRecords.map(p => {
    const packed = ethers.solidityPacked(["address","uint256"], [p.voter, p.weight]);
    return keccak256Lib(Buffer.from(packed.slice(2), 'hex'));
  });
  const tree = new MerkleTree(leaves, keccak256Lib, { sortPairs: true });
  return { tree, leaves };
}

async function main() {
  console.log("🗳️  Testing EIP-712 Voting System");
  console.log("=" .repeat(60));
  
  // Create test wallets
  console.log("\n👥 Creating Test Voters...");
  const w1 = ethers.Wallet.createRandom();
  const w2 = ethers.Wallet.createRandom();
  console.log("Voter 1:", w1.address);
  console.log("Voter 2:", w2.address);

  const proposalId = 1;
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + 60 * 60 * 24; // 24 hours

  console.log("\n📋 Proposal Info:");
  console.log("Proposal ID:", proposalId);
  console.log("Deadline:", new Date(deadline * 1000).toISOString());

  // Voter 1 vote (YES)
  console.log("\n✅ Voter 1 - Voting YES");
  const vote1 = {
    proposalId,
    voter: w1.address,
    support: true,
    ratioAave: 6000, // 60%
    ratioUni: 4000,  // 40%
    nonce: 1,
    deadline
  };
  const sig1 = await signVote(w1, vote1);
  console.log("Strategy: 60% Aave, 40% Uniswap");
  console.log("Signature:", sig1.substring(0, 20) + "...");

  // Voter 2 vote (NO)
  console.log("\n❌ Voter 2 - Voting NO");
  const vote2 = {
    proposalId,
    voter: w2.address,
    support: false,
    ratioAave: 3000, // 30%
    ratioUni: 7000,  // 70%
    nonce: 1,
    deadline
  };
  const sig2 = await signVote(w2, vote2);
  console.log("Strategy: 30% Aave, 70% Uniswap");
  console.log("Signature:", sig2.substring(0, 20) + "...");

  // Build merkle trees
  console.log("\n🌳 Building Merkle Trees...");
  const signedVotes = [
    { ...vote1, sig: sig1 },
    { ...vote2, sig: sig2 }
  ];
  const { tree: votesTree, leaves: voteLeaves } = buildVotesTree(signedVotes);
  const votesRoot = "0x" + votesTree.getRoot().toString('hex');
  console.log("Votes Root:", votesRoot);

  // Voting power
  const powers = [
    { voter: w1.address, weight: 1000 }, // 1000 voting power
    { voter: w2.address, weight: 500 }   // 500 voting power
  ];
  const { tree: powerTree, leaves: powerLeaves } = buildPowerTree(powers);
  const powerRoot = "0x" + powerTree.getRoot().toString('hex');
  console.log("Power Root:", powerRoot);

  // Generate proofs for voter 1
  console.log("\n🔐 Generating Proofs for Voter 1...");
  const vote1Proof = votesTree.getProof(voteLeaves[0]).map(x => '0x'+x.data.toString('hex'));
  const powerProof1 = powerTree.getProof(powerLeaves[0]).map(x => '0x'+x.data.toString('hex'));
  
  console.log("Vote Proof Length:", vote1Proof.length);
  console.log("Power Proof Length:", powerProof1.length);

  // Generate proofs for voter 2
  console.log("\n🔐 Generating Proofs for Voter 2...");
  const vote2Proof = votesTree.getProof(voteLeaves[1]).map(x => '0x'+x.data.toString('hex'));
  const powerProof2 = powerTree.getProof(powerLeaves[1]).map(x => '0x'+x.data.toString('hex'));

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Summary - Ready for On-Chain Submission");
  console.log("=" .repeat(60));
  
  console.log("\n1️⃣ Manager calls setProposal:");
  console.log("   proposalId:", proposalId);
  console.log("   votesRoot:", votesRoot);
  console.log("   powerRoot:", powerRoot);
  console.log("   threshold: 750 (50% of total power)");
  console.log("   quorum: 0 (not used)");
  console.log("   deadline:", deadline);

  console.log("\n2️⃣ Voter 1 submits vote:");
  console.log("   voter:", vote1.voter);
  console.log("   support: true");
  console.log("   ratioAave:", vote1.ratioAave);
  console.log("   ratioUni:", vote1.ratioUni);
  console.log("   nonce:", vote1.nonce);
  console.log("   deadline:", vote1.deadline);
  console.log("   signature:", sig1);
  console.log("   votesProof:", JSON.stringify(vote1Proof));
  console.log("   powerWeight:", powers[0].weight);
  console.log("   powerProof:", JSON.stringify(powerProof1));

  console.log("\n3️⃣ Voter 2 submits vote:");
  console.log("   voter:", vote2.voter);
  console.log("   support: false");
  console.log("   ratioAave:", vote2.ratioAave);
  console.log("   ratioUni:", vote2.ratioUni);
  console.log("   nonce:", vote2.nonce);
  console.log("   deadline:", vote2.deadline);
  console.log("   signature:", sig2);
  console.log("   votesProof:", JSON.stringify(vote2Proof));
  console.log("   powerWeight:", powers[1].weight);
  console.log("   powerProof:", JSON.stringify(powerProof2));

  console.log("\n📈 Expected Results:");
  console.log("   Total Voting Power: 1500");
  console.log("   YES votes: 1000 (66.7%)");
  console.log("   NO votes: 500 (33.3%)");
  console.log("   Proposal Status: ✅ PASSED (YES > threshold)");

  // Save to file for easy reference
  const output = {
    proposalId,
    votesRoot,
    powerRoot,
    threshold: 750,
    quorum: 0,
    deadline,
    voters: [
      {
        voter: vote1.voter,
        support: true,
        ratioAave: vote1.ratioAave,
        ratioUni: vote1.ratioUni,
        nonce: vote1.nonce,
        deadline: vote1.deadline,
        signature: sig1,
        votesProof: vote1Proof,
        powerWeight: powers[0].weight,
        powerProof: powerProof1
      },
      {
        voter: vote2.voter,
        support: false,
        ratioAave: vote2.ratioAave,
        ratioUni: vote2.ratioUni,
        nonce: vote2.nonce,
        deadline: vote2.deadline,
        signature: sig2,
        votesProof: vote2Proof,
        powerWeight: powers[1].weight,
        powerProof: powerProof2
      }
    ]
  };

  console.log("\n💾 Saved to voting-test-output.json");
  const fs = await import('fs');
  fs.writeFileSync('voting-test-output.json', JSON.stringify(output, null, 2));
  
  console.log("\n✅ Test Complete!");
}

main().catch(console.error);

