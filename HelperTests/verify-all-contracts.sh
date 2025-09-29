
npx hardhat verify --network sepolia 0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762


npx hardhat run check-pool-liquidity.js --network sepolia

python3 -m http.server 8001 --directory UI

npx hardhat test set-weth-oracle-price.js --network sepolia