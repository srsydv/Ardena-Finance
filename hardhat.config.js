// require("@nomicfoundation/hardhat-toolbox");

// /** @type import('hardhat/config').HardhatUserConfig */
// module.exports = {
//   solidity: {
//     compilers: [
//       {
//         version: "0.8.24", // Your contracts
//         settings: {
//           optimizer: {
//             enabled: true,
//             runs: 200,
//           },
//           viaIR: true,   // <--- add this line
//         },
//       },
//       {
//         version: "0.7.6", // For Uniswap V3 libraries
//         settings: {
//           optimizer: {
//             enabled: true,
//             runs: 200,
//           },
//         },
//       },
//     ],
//   },
// };

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("hardhat-tracer");
require("@openzeppelin/hardhat-upgrades");

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.24", // for your contracts (Vault, AaveV3Strategy, FeeModule, etc.)
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
      {
        version: "0.7.6", // for Uniswap v3 libraries + strategy
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
    overrides: {
      // Force correct compiler for uniswap deps
      "@uniswap/v3-core/contracts/**/*.sol": {
        version: "0.7.6",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
      "@uniswap/v3-periphery/contracts/**/*.sol": {
        version: "0.7.6",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
      "contracts/interfaces/v7/**/*.sol": {
        version: "0.7.6",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
      "contracts/utils/v7/**/*.sol": {
        version: "0.7.6",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
    },
  },
  networks: {
    hardhat: {
      blockGasLimit: 1000000000,
      allowUnlimitedContractSize: true,
      forking: {
        url: process.env.ALCHEMY_ARBITRUM_URL || "https://arb-mainnet.g.alchemy.com/v2/demo",
        enabled: !!process.env.ALCHEMY_ARBITRUM_URL,
      },
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik`,
      chainId: 11155111,
      accounts: process.env.PK ? [process.env.PK] : [],
    },
  },
  etherscan: {
    apiKey: `TN3DX6Y6IU2C1H3ZCHGQJKD7MHUQZGKRMP`,
  },
};
