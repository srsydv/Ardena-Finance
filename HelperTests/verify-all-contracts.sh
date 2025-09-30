
npx hardhat verify --network sepolia 0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762


npx hardhat run check-pool-liquidity.js --network sepolia

python3 -m http.server 8001 --directory UI

npx hardhat test set-weth-oracle-price.js --network sepolia

   {
    npx hardhat console --network sepolia
    
        const oracleAddr = "0x6EE0A849079A5b63562a723367eAae77F3f5EB21";
    const AAVE = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a";
    const WETH = "0x4530fABea7444674a775abb920924632c669466e";
    const oracle = await ethers.getContractAt("OracleModule", oracleAddr);
    (await oracle.price(AAVE)).toString()
    (await oracle.price(WETH)).toString()
   } 