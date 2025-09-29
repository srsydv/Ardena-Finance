/*
  Upgrade Vault proxy at a specific address on Sepolia.

  Usage:
    npx hardhat run deploy/upgradeVaultNew.js --network sepolia

  Requirements:
    - .env with PK for the manager account
    - Deployer must be a manager in AccessController (Vault._authorizeUpgrade)
*/

import dotenv from "dotenv";
dotenv.config();
import hre from "hardhat";
const { ethers, upgrades } = hre;

// Target proxy and access controller
const VAULT_ADDRESS = "0x3cd0145707C03316B48f8A254c494600c30ebf8d";
const ACCESS_CONTROLLER_ADDRESS = "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2";

async function main() {
  console.log("=== Vault UPGRADE (Sepolia) ===");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const net = await ethers.provider.getNetwork();
  console.log("Network:", net.chainId.toString());
  if (net.chainId !== 11155111n) {
    console.warn("Warning: not on Sepolia");
  }

  // Check manager permission
  const AccessController = await ethers.getContractFactory("AccessController");
  const access = AccessController.attach(ACCESS_CONTROLLER_ADDRESS);
  const isManager = await access.managers(deployer.address);
  console.log("Is manager:", isManager);
  if (!isManager) {
    throw new Error(
      `Deployer is not a manager in AccessController ${ACCESS_CONTROLLER_ADDRESS}. Grant manager role and retry.`
    );
  }

  const currentImpl = await upgrades.erc1967.getImplementationAddress(VAULT_ADDRESS);
  console.log("Current impl:", currentImpl);

  // Perform upgrade
  const Vault = await ethers.getContractFactory("Vault");
  console.log("Deploying new Vault implementation and upgrading proxy...");
  const upgraded = await upgrades.upgradeProxy(VAULT_ADDRESS, Vault);
  await upgraded.waitForDeployment();

  const newImpl = await upgrades.erc1967.getImplementationAddress(VAULT_ADDRESS);
  console.log("New impl:", newImpl);
  console.log("✅ Upgrade complete");

  // Quick smoke checks
  const name = await upgraded.name();
  const symbol = await upgraded.symbol();
  const ta = await upgraded.totalAssets();
  console.log("Vault name:", name);
  console.log("Vault symbol:", symbol);
  console.log("Vault totalAssets:", ta.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


