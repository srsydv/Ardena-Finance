#!/bin/bash

echo "🔍 Verifying all contracts on Sepolia..."

# Core Contracts
echo "📋 Verifying Core Contracts..."
npx hardhat verify --network sepolia 0x6EE0A849079A5b63562a723367eAae77F3f5EB21
npx hardhat verify --network sepolia 0x3873DaFa287f80792208c36AcCfC82370428b3DB
npx hardhat verify --network sepolia 0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2
npx hardhat verify --network sepolia 0xD995048010d777185e70bBe8FD48Ca2d0eF741a0
npx hardhat verify --network sepolia 0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF
npx hardhat verify --network sepolia 0x263b2a35787b3D9f8c2aca02ce2372E9f7CD438E

echo ""
echo "📋 Verifying Strategy Contracts..."
npx hardhat verify --network sepolia 0xCc02bC41a7AF1A35af4935346cABC7335167EdC9
npx hardhat verify --network sepolia 0x6B018844b6Edd87f7F6355643fEB5090Da02b209

echo ""
echo "📋 Verifying Other Contracts..."
npx hardhat verify --network sepolia 0x34C4E1883Ed95aeb100F79bdEe0291F44C214fA2
npx hardhat verify --network sepolia 0x497369979EfAD100F83c509a30F38dfF90d11585
npx hardhat verify --network sepolia 0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762

echo ""
echo "✅ All contracts verified!"


npx hardhat run check-pool-liquidity.js --network sepolia