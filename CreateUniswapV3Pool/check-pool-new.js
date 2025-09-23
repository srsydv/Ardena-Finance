/**
 * Check if Uniswap V3 pool exists for the new token combination
 */

import hre from "hardhat";
const { ethers } = hre;

const UNIV3_FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c";
const WETH = "0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762"; // New WETH
const USDC = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
const FEE = 500;

const IUniswapV3FactoryABI = [
  "function getPool(address,address,uint24) view returns (address)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", await deployer.getAddress());

  const factory = await ethers.getContractAt(
    IUniswapV3FactoryABI,
    UNIV3_FACTORY
  );

  // Check if pool exists
  console.log("🔍 Checking if WETH/USDC pool exists...");
  console.log("WETH:", WETH);
  console.log("USDC:", USDC);
  console.log("Fee:", FEE);

  try {
    const poolAddress = await factory.getPool(WETH, USDC, FEE);
    console.log("Pool address:", poolAddress);

    if (poolAddress === "0x0000000000000000000000000000000000000000") {
      console.log("❌ Pool does not exist yet");
      console.log("💡 You need to create it, but first resolve the rate limit issue");
      console.log("");
      console.log("🔧 SOLUTIONS:");
      console.log("1. Wait 1-2 hours for Alchemy rate limit to reset");
      console.log("2. Get a new Alchemy API key");
      console.log("3. Use a different RPC provider");
      console.log("4. Try again later when network is less congested");
    } else {
      console.log("✅ Pool exists!");
      console.log("🎯 You can use this pool address in your UniswapV3Strategy:");
      console.log("   Pool:", poolAddress);
    }
  } catch (error) {
    console.log("❌ Error checking pool:", error.message);
    console.log("💡 This might be due to RPC issues or rate limits");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
