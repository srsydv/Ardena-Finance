// Configuration file for Shrish Finance DeFi Vault
// Update these values as needed

const CONFIG = {
    // 0x API Configuration
    // Get your API key from: https://0x.org/docs/api#introduction
    ZEROX_API_KEY: "2a3ac61e-6530-4fcf-bad4-b92815203925", // Replace with your actual 0x API key
    
    // Network Configuration
    CHAIN_ID: 11155111, // Sepolia testnet
    
    // Contract addresses (from DEPLOYEDCONTRACT.me - UPDATED with working addresses)
    CONTRACTS: {
        vault: "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0",
        usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
        weth: "0x0Dd242dAafaEdf2F7409DCaec4e66C0D26d72762", // NEW WORKING WETH
        aaveStrategy: "0xCc02bC41a7AF1A35af4935346cABC7335167EdC9",
        uniStrategy: "0x6B018844b6Edd87f7F6355643fEB5090Da02b209", // NEW WORKING STRATEGY
        accessController: "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2",
        feeModule: "0x3873DaFa287f80792208c36AcCfC82370428b3DB",
        oracle: "0x6EE0A849079A5b63562a723367eAae77F3f5EB21",
        exchanger: "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF",
        mathAdapter: "0x263b2a35787b3D9f8c2aca02ce2372E9f7CD438E",
        poolAddress: "0xd4408d03B59aC9Be0a976e3E2F40d7e506032C39", // NEW WORKING POOL
        indexSwap: "0x34C4E1883Ed95aeb100F79bdEe0291F44C214fA2",
        ethUsdAgg: "0x497369979EfAD100F83c509a30F38dfF90d11585",
        newSwapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" // NEW WORKING ROUTER
    },
    
    // UI Configuration
    UI: {
        refreshInterval: 30000, // Refresh vault info every 30 seconds
        defaultGasLimit: 90000000, // Default gas limit for transactions
        maxRetries: 3 // Maximum retry attempts for failed transactions
    },
    
    // Fee Configuration (for display purposes)
    FEES: {
        managementFee: 2.0, // 2% annual management fee
        performanceFee: 20.0, // 20% performance fee
        entryFee: 0.1, // 0.1% entry fee
        exitFee: 0.1 // 0.1% exit fee
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}
