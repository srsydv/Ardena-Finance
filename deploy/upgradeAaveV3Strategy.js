import dotenv from "dotenv";
dotenv.config();
import hre from "hardhat";

const { ethers, upgrades } = hre;

async function main() {
  console.log("=== UPGRADE AaveV3Strategy (UUPS) ===");

  // Proxy to upgrade (provided by you)
  const PROXY_ADDRESS = "0x9362c59c71321c77CaeE86f9Cf02cbBF3b64277D";

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Strategy proxy:", PROXY_ADDRESS);

  // Sanity: read current owner to ensure we have permissions
  const Current = await ethers.getContractAt("AaveV3Strategy", PROXY_ADDRESS);
  const owner = await Current.owner();
  console.log("Current owner:", owner);
  console.log("Am I owner:", owner.toLowerCase() === deployer.address.toLowerCase());

  // Perform upgrade
  const Strategy = await ethers.getContractFactory("AaveV3Strategy");
  console.log("Upgrading proxy...");
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, Strategy);
  await upgraded.waitForDeployment();

  const impl = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("✅ Upgrade complete. New implementation:", impl);

  // Quick smoke check
  const want = await upgraded.want();
  console.log("want():", want);
}

main().catch((err) => {
  console.error("Upgrade failed:", err);
  process.exit(1);
});


