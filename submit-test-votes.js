import dotenv from "dotenv";
dotenv.config();
import hre from "hardhat";
const { ethers } = hre;
import fs from 'fs';

const VOTE_VERIFIER_ADDRESS = "0xf37A4CA4608c1F6A5Fb944086Ce7526D39d90657";

async function main() {
  console.log("🗳️  Submitting Test Votes to VoteVerifier on Sepolia");
  console.log("=" .repeat(60));

  // Load test data
  const testData = JSON.parse(fs.readFileSync('voting-test-output.json', 'utf8'));
  
  const [deployer] = await ethers.getSigners();
  console.log("Manager account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Connect to VoteVerifier
  const voteVerifier = await ethers.getContractAt("VoteVerifier", VOTE_VERIFIER_ADDRESS, deployer);
  
  console.log("\n📋 Step 1: Set Proposal");
  console.log("-".repeat(50));
  console.log("Proposal ID:", testData.proposalId);
  console.log("Votes Root:", testData.votesRoot);
  console.log("Power Root:", testData.powerRoot);
  console.log("Threshold:", testData.threshold);
  console.log("Quorum:", testData.quorum);
  console.log("Deadline:", testData.deadline);

  try {
    const tx1 = await voteVerifier.setProposal(
      testData.proposalId,
      testData.votesRoot,
      testData.powerRoot,
      testData.threshold,
      testData.quorum,
      testData.deadline
    );
    console.log("\n⏳ Transaction sent:", tx1.hash);
    await tx1.wait();
    console.log("✅ Proposal set successfully!");
  } catch (error) {
    console.log("❌ Error setting proposal:", error.message);
    if (error.message.includes("proposal already set")) {
      console.log("ℹ️  Proposal already exists, continuing with vote submission...");
    } else {
      throw error;
    }
  }

  // Check proposal
  const proposal = await voteVerifier.proposals(testData.proposalId);
  console.log("\n📊 Proposal Status:");
  console.log("Votes Root:", proposal.votesRoot);
  console.log("Power Root:", proposal.powerRoot);
  console.log("Threshold:", proposal.threshold.toString());
  console.log("YES Weight:", proposal.yesWeight.toString());
  console.log("NO Weight:", proposal.noWeight.toString());
  console.log("Passed:", proposal.passed);
  console.log("Deadline:", new Date(Number(proposal.deadline) * 1000).toISOString());

  // Submit votes
  console.log("\n📋 Step 2: Submit Votes");
  console.log("-".repeat(50));

  for (let i = 0; i < testData.voters.length; i++) {
    const voter = testData.voters[i];
    console.log(`\n${i + 1}. Submitting vote from ${voter.voter.substring(0, 10)}...`);
    console.log("   Support:", voter.support ? "✅ YES" : "❌ NO");
    console.log("   Strategy:", `${voter.ratioAave / 100}% Aave, ${voter.ratioUni / 100}% Uniswap`);
    console.log("   Power:", voter.powerWeight);

    try {
      // Check if already counted
      const alreadyCounted = await voteVerifier.counted(testData.proposalId, voter.voter);
      if (alreadyCounted) {
        console.log("   ℹ️  Vote already counted, skipping...");
        continue;
      }

      const tx = await voteVerifier.submitVoteWithProof(
        testData.proposalId,
        voter.voter,
        voter.support,
        voter.ratioAave,
        voter.ratioUni,
        voter.nonce,
        voter.deadline,
        voter.signature,
        voter.votesProof,
        voter.powerWeight,
        voter.powerProof,
        { gasLimit: 500000 }
      );
      
      console.log("   ⏳ Transaction:", tx.hash);
      const receipt = await tx.wait();
      console.log("   ✅ Vote submitted! Gas used:", receipt.gasUsed.toString());

      // Check for ProposalPassed event
      const passedEvent = receipt.logs.find(log => {
        try {
          const parsed = voteVerifier.interface.parseLog(log);
          return parsed.name === 'ProposalPassed';
        } catch {
          return false;
        }
      });

      if (passedEvent) {
        console.log("   🎉 PROPOSAL PASSED!");
      }

    } catch (error) {
      console.log("   ❌ Error:", error.message);
    }
  }

  // Final status
  console.log("\n" + "=".repeat(60));
  console.log("📊 Final Proposal Status");
  console.log("=" .repeat(60));
  
  const finalProposal = await voteVerifier.proposals(testData.proposalId);
  console.log("YES Weight:", finalProposal.yesWeight.toString());
  console.log("NO Weight:", finalProposal.noWeight.toString());
  console.log("Threshold:", finalProposal.threshold.toString());
  console.log("Passed:", finalProposal.passed ? "✅ YES" : "❌ NO");

  if (finalProposal.passed) {
    console.log("\n🎉 Proposal has PASSED!");
    console.log("New Strategy Allocation:");
    console.log("- Aave V3: 60%");
    console.log("- Uniswap V3: 40%");
  }

  console.log("\n✅ Test Complete!");
  console.log("\n🔗 View on Etherscan:");
  console.log(`https://sepolia.etherscan.io/address/${VOTE_VERIFIER_ADDRESS}`);
}

main().catch(console.error);

