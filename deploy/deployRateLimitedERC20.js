/*
  Deploy RateLimitedERC20 to Ethereum Sepolia

  Usage examples:
  - npx hardhat run deploy/deployRateLimitedERC20.js --network sepolia

  Optional env vars (dotenv supported):
  - NAME:   token name (default: RateLimitedToken)
  - SYMBOL: token symbol (default: RLMT)
  - NEW_OWNER: address to transfer ownership to after deploy (default: none)
  - VERIFY: set to "true" to run Etherscan verify
  - WAIT_BLOCKS: confirmations to wait before verify (default: 2)
*/

require("dotenv/config");
const hre = require("hardhat");
const { ethers } = hre;

function env(name, def) {
  const v = process.env[name];
  return v === undefined || v === "" ? def : v;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  const NAME = env("NAME", "WETH");
  const SYMBOL = env("SYMBOL", "WETH");
  const NEW_OWNER = env("NEW_OWNER", "");
  const DO_VERIFY = env("VERIFY", "false").toLowerCase() === "true";
  const WAIT_BLOCKS = Number(env("WAIT_BLOCKS", "2"));

  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network:  chainId=${network.chainId}`);
  console.log(`Params:   NAME=${NAME}, SYMBOL=${SYMBOL}`);

  const Factory = await ethers.getContractFactory("RateLimitedERC20");
  const token = await Factory.deploy(NAME, SYMBOL);
  const tx = await token.deploymentTransaction().wait(1);
  await token.waitForDeployment();
  const addr = await token.getAddress();

  console.log(`Deployed RateLimitedERC20 at: ${addr}`);

  // Optional: transfer ownership
//   const currentOwner = await token.owner();
//   if (NEW_OWNER && NEW_OWNER.toLowerCase() !== currentOwner.toLowerCase()) {
//     console.log(`Transferring ownership to ${NEW_OWNER}...`);
//     const txo = await token.transferOwnership(NEW_OWNER);
//     await txo.wait();
//     console.log(`Ownership transferred. New owner: ${await token.owner()}`);
//   } else {
//     console.log(`Owner remains: ${currentOwner}`);
//   }

  // Optional: verify on Etherscan (requires ETHERSCAN_API_KEY configured)
  if (DO_VERIFY) {
    console.log(`Waiting for ${WAIT_BLOCKS} confirmation(s) before verify...`);
    await token.deploymentTransaction().wait(WAIT_BLOCKS);
    try {
      await hre.run("verify:verify", {
        address: addr,
        constructorArguments: [NAME, SYMBOL],
      });
      console.log("Verified on Etherscan");
    } catch (err) {
      console.warn("Verify failed:", err.message || err);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});


