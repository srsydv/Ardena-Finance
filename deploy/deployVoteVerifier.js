import dotenv from "dotenv";
dotenv.config();
import hre from "hardhat";
const { ethers, upgrades } = hre;

async function main() {
    console.log("🚀 Deploying VoteVerifier Contract (Upgradeable)");
    console.log("=" .repeat(60));

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

    // EIP-712 Domain parameters
    const EIP712_NAME = "Ardena Finance";
    const EIP712_VERSION = "1";

    console.log("\n📋 EIP-712 Domain Parameters:");
    console.log("Name:", EIP712_NAME);
    console.log("Version:", EIP712_VERSION);

    // Deploy VoteVerifier as UUPS upgradeable proxy
    console.log("\n🔨 Deploying VoteVerifier...");
    const VoteVerifier = await ethers.getContractFactory("VoteVerifier");
    
    const voteVerifier = await upgrades.deployProxy(
        VoteVerifier,
        [EIP712_NAME, EIP712_VERSION],
        {
            initializer: 'initialize',
            kind: 'uups'
        }
    );

    await voteVerifier.waitForDeployment();
    const proxyAddress = await voteVerifier.getAddress();

    console.log("✅ VoteVerifier Proxy deployed to:", proxyAddress);

    // Get implementation address
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("📦 Implementation address:", implementationAddress);

    // Verify deployment
    console.log("\n🔍 Verifying Deployment...");
    const owner = await voteVerifier.owner();
    console.log("Owner:", owner);
    console.log("Owner matches deployer:", owner === deployer.address ? "✅ Yes" : "❌ No");

    // Save deployment info
    console.log("\n💾 Saving Deployment Info...");
    const deploymentInfo = {
        network: hre.network.name,
        chainId: (await ethers.provider.getNetwork()).chainId.toString(),
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            VoteVerifier: {
                proxy: proxyAddress,
                implementation: implementationAddress,
                eip712Domain: {
                    name: EIP712_NAME,
                    version: EIP712_VERSION
                }
            }
        }
    };

    console.log("\n" + "=".repeat(60));
    console.log("🎉 Deployment Complete!");
    console.log("=" .repeat(60));
    console.log("\n📝 Deployment Summary:");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    console.log("\n📋 Next Steps:");
    console.log("1. Update UI/bots/eip712.js with the following:");
    console.log(`   verifyingContract: "${proxyAddress}"`);
    console.log(`   chainId: ${deploymentInfo.chainId}`);
    console.log("\n2. Verify contract on Etherscan:");
    console.log(`   npx hardhat verify --network ${hre.network.name} ${implementationAddress}`);

    return deploymentInfo;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });

