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
      forking: {
        url: process.env.ALCHEMY_ARBITRUM_URL, // your fork
        blockNumber: 120000000, // optional
      },
    },
  },
};
