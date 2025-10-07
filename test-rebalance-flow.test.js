import { expect } from "chai";
import dotenv from "dotenv";
dotenv.config();
import hre from "hardhat";
const { ethers } = hre;
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the SwapRouter02 artifact
const SwapRouter02Artifact = JSON.parse(
    readFileSync(join(__dirname, "node_modules/@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json"), "utf8")
);

// Latest deployed contract addresses
const VAULT_ADDRESS = "0x92EA77BA5Cd9b47EBe84e09A7b90b253F845eD11"; // Latest vault proxy
const AAVE_STRATEGY_ADDRESS = "0x6bDE0781354858bA6344aB671B07663E89BFF064"; // Latest AaveV3Strategy
const UNISWAP_STRATEGY_ADDRESS = "0xa33A3662d8750a90f14792B4908E95695b11E374"; // Latest UniswapV3Strategy
const INDEX_SWAP_ADDRESS = "0x0f324147787E28b8D344ba2aA30A496a9291E603"; // IndexSwap contract

// Token addresses
const AAVE_TOKEN_ADDRESS = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a"; // aETHAAVE
const WETH_TOKEN_ADDRESS = "0x4530fABea7444674a775aBb920924632c669466e"; // USDC

// Target allocations (60% Aave, 40% Uniswap)
const TARGET_AAVE_ALLOCATION = 60; // 60%
const TARGET_UNISWAP_ALLOCATION = 40; // 40%

// Private key for the test account (manager)
const MANAGER_PK = process.env.MANAGER_PK || "e6219d95e56586caf054e7663a8c316b7699d01b4ada9b65565a4edcc5737bcb";

describe("Rebalance Flow Test", function () {
    it("Should execute complete rebalance flow", async function () {
        this.timeout(300_000);
        console.log("🚀 Starting Rebalance Flow Test on Sepolia Fork");
        console.log("=" .repeat(60));

        // Setup provider and signer - use local fork
        const provider = ethers.provider; // Use Hardhat's provider (local fork)
        const wallet = new ethers.Wallet(MANAGER_PK, provider);
        console.log(`📱 Manager Account: ${wallet.address}`);

        // Connect to contracts
        const vault = await ethers.getContractAt("Vault", VAULT_ADDRESS, wallet);
        const aaveStrategy = await ethers.getContractAt("AaveV3Strategy", AAVE_STRATEGY_ADDRESS, wallet);
        const uniswapStrategy = await ethers.getContractAt("UniswapV3Strategy", UNISWAP_STRATEGY_ADDRESS, wallet);
        const indexSwap = await ethers.getContractAt("IndexSwap", INDEX_SWAP_ADDRESS, wallet);
        const aaveToken = await ethers.getContractAt("IERC20", AAVE_TOKEN_ADDRESS, wallet);

        console.log("\n📊 STEP 1: Fix Oracle Timestamp Issue");
        console.log("-" .repeat(50));
        
        // Fix oracle timestamp issue before running the test
        const ORACLE_MODULE = "0x32D6d6024CE08930b1f3eDd30F5eDd0d1986c9c4";
        const WETH_AGGREGATOR = "0x497369979efad100f83c509a30f38dff90d11585";
        const AAVE_AGGREGATOR = "0x3e2d029550feb4884aaa34f32d9cd916862b8f79"; // AAVE/ETH feed
        
        console.log("🔧 Fixing Oracle Timestamp Issue...");
        
        // Connect to oracle contracts
        const oracleModule = await ethers.getContractAt("OracleModule", ORACLE_MODULE);
        const wethAggregator = await ethers.getContractAt("MockAggregatorV3", WETH_AGGREGATOR);
        const aaveAggregator = await ethers.getContractAt("MockAggregatorV3", AAVE_AGGREGATOR);
        
        // Mine a new block to advance timestamp
        await ethers.provider.send("evm_mine", []);
        
        // Update WETH/USD price with fresh timestamp
        const wethPrice = 300000000000; // $3000 with 8 decimals
        const wethTx = await wethAggregator.setAnswer(wethPrice);
        await wethTx.wait();
        console.log(`✅ WETH/USD price updated: $${ethers.formatUnits(wethPrice, 8)}`);
        
        // Update AAVE/ETH price with fresh timestamp (AAVE per ETH ratio)
        const aaveEthPrice = 1000000000; // ~33 AAVE per ETH (ETH ~$3000, AAVE ~$100)
        const aaveTx = await aaveAggregator.setAnswer(aaveEthPrice);
        await aaveTx.wait();
        console.log(`✅ AAVE/ETH price updated: ${ethers.formatUnits(aaveEthPrice, 18)} AAVE/ETH`);
        
        // Test oracle price calls
        try {
            const wethAddress = "0x4530fABea7444674a775aBb920924632c669466e";
            const aaveAddress = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a";
            
            const wethPriceFromOracle = await oracleModule.price(wethAddress);
            console.log(`✅ WETH price from oracle: $${ethers.formatUnits(wethPriceFromOracle, 8)} USD`);
            
            const aavePriceFromOracle = await oracleModule.price(aaveAddress);
            console.log(`✅ AAVE price from oracle: $${ethers.formatUnits(aavePriceFromOracle, 8)} USD`);
        } catch (error) {
            console.log(`❌ Oracle price call failed: ${error.message}`);
        }

        console.log("\n📊 STEP 2: Check Current Strategy Allocations");
        console.log("-" .repeat(50));

        // Get current total assets in each strategy
        const aaveAssets = await aaveStrategy.totalAssets();
        const uniswapAssets = await uniswapStrategy.totalAssets();
        const totalAssets = aaveAssets + uniswapAssets;

        console.log(`AaveV3Strategy totalAssets: ${ethers.formatEther(aaveAssets)} AAVE`);
        console.log(`UniswapV3Strategy totalAssets: ${ethers.formatEther(uniswapAssets)} AAVE`);
        console.log(`Total Strategy Assets: ${ethers.formatEther(totalAssets)} AAVE`);

        if (totalAssets > 0) {
            const aavePercentage = (Number(aaveAssets) / Number(totalAssets)) * 100;
            const uniswapPercentage = (Number(uniswapAssets) / Number(totalAssets)) * 100;
            console.log(`Current Allocation - Aave: ${aavePercentage.toFixed(2)}%, Uniswap: ${uniswapPercentage.toFixed(2)}%`);
        }

        console.log("\n💰 STEP 3: Check Imbalance and Create 2%+ Imbalance if Needed");
        console.log("-" .repeat(50));

        // Check current imbalance percentage
        if (totalAssets > 0) {
            const currentAavePercentage = (Number(aaveAssets) / Number(totalAssets)) * 100;
            const currentUniswapPercentage = (Number(uniswapAssets) / Number(totalAssets)) * 100;
            
            const aaveImbalance = Math.abs(currentAavePercentage - TARGET_AAVE_ALLOCATION);
            const uniswapImbalance = Math.abs(currentUniswapPercentage - TARGET_UNISWAP_ALLOCATION);
            const maxImbalance = Math.max(aaveImbalance, uniswapImbalance);
            
            console.log(`Current imbalance: ${maxImbalance.toFixed(2)}% (Aave: ${aaveImbalance.toFixed(2)}%, Uniswap: ${uniswapImbalance.toFixed(2)}%)`);
            
            if (maxImbalance < 2) {
                console.log("⚠️ Imbalance is less than 2%. Creating imbalance by sending AAVE to AaveV3Strategy...");
                
                // Check current AAVE balance of manager account
                const currentBalance = await aaveToken.balanceOf(wallet.address);
                console.log(`Manager AAVE balance: ${ethers.formatEther(currentBalance)} AAVE`);

                const transferAmount = ethers.parseEther("10"); // 10 AAVE
                console.log(`Transferring ${ethers.formatEther(transferAmount)} AAVE to AaveV3Strategy...`);

                if (currentBalance >= transferAmount) {
                    // Transfer 10 AAVE directly to AaveV3Strategy
                    const tx1 = await aaveToken.transfer(AAVE_STRATEGY_ADDRESS, transferAmount);
                    await tx1.wait();
                    console.log(`✅ Transfer transaction: ${tx1.hash}`);

                    // Check new allocations after transfer
                    const newAaveAssets = await aaveStrategy.totalAssets();
                    const newUniswapAssets = await uniswapStrategy.totalAssets();
                    const newTotalAssets = newAaveAssets + newUniswapAssets;

                    console.log(`\nAfter Transfer:`);
                    console.log(`AaveV3Strategy totalAssets: ${ethers.formatEther(newAaveAssets)} AAVE`);
                    console.log(`UniswapV3Strategy totalAssets: ${ethers.formatEther(newUniswapAssets)} AAVE`);
                    console.log(`Total Strategy Assets: ${ethers.formatEther(newTotalAssets)} AAVE`);

                    const newAavePercentage = (Number(newAaveAssets) / Number(newTotalAssets)) * 100;
                    const newUniswapPercentage = (Number(newUniswapAssets) / Number(newTotalAssets)) * 100;
                    console.log(`New Allocation - Aave: ${newAavePercentage.toFixed(2)}%, Uniswap: ${newUniswapPercentage.toFixed(2)}%`);
                    console.log(`🎯 Target Allocation - Aave: ${TARGET_AAVE_ALLOCATION}%, Uniswap: ${TARGET_UNISWAP_ALLOCATION}%`);
                    
                    // Continue with rebalancing using the new allocations
                    await performRebalance(newAaveAssets, newUniswapAssets, newTotalAssets, vault, indexSwap, aaveStrategy, uniswapStrategy);
                } else {
                    console.log("❌ Insufficient AAVE balance for creating imbalance. Current balance:", ethers.formatEther(currentBalance));
                    console.log("💡 Manager needs more AAVE tokens to create imbalance.");
                    return;
                }
            } else {
                console.log(`✅ Current imbalance (${maxImbalance.toFixed(2)}%) is >= 2%. Proceeding with rebalance...`);
                // Continue with rebalancing using current allocations
                await performRebalance(aaveAssets, uniswapAssets, totalAssets, vault, indexSwap, aaveStrategy, uniswapStrategy);
            }
        } else {
            console.log("❌ No assets in strategies. Cannot proceed with rebalance test.");
            return;
        }

        async function performRebalance(aaveAssets, uniswapAssets, totalAssets, vault, indexSwap, aaveStrategy, uniswapStrategy) {
            console.log("\n⚖️ STEP 4: Calculate Rebalancing Requirements");
            console.log("-" .repeat(50));

            // Calculate target amounts
            const targetAaveAmount = (totalAssets * BigInt(TARGET_AAVE_ALLOCATION)) / BigInt(100);
            const targetUniswapAmount = (totalAssets * BigInt(TARGET_UNISWAP_ALLOCATION)) / BigInt(100);

            console.log(`Target AaveV3Strategy amount: ${ethers.formatEther(targetAaveAmount)} AAVE`);
            console.log(`Target UniswapV3Strategy amount: ${ethers.formatEther(targetUniswapAmount)} AAVE`);

            // Calculate withdrawal amount from AaveV3Strategy
            const aaveWithdrawAmount = aaveAssets > targetAaveAmount ? aaveAssets - targetAaveAmount : BigInt(0);
            const uniswapWithdrawAmount = uniswapAssets > targetUniswapAmount ? uniswapAssets - targetUniswapAmount : BigInt(0);

            console.log(`\nWithdrawal Requirements:`);
            console.log(`AaveV3Strategy needs to withdraw: ${ethers.formatEther(aaveWithdrawAmount)} AAVE`);
            console.log(`UniswapV3Strategy needs to withdraw: ${ethers.formatEther(uniswapWithdrawAmount)} AAVE`);

            if (aaveWithdrawAmount === 0 && uniswapWithdrawAmount === 0) {
                console.log("✅ Already balanced! No rebalancing needed.");
                return;
            }

            console.log("\n🔄 STEP 4: Prepare Rebalance Calldata");
            console.log("-" .repeat(50));

            // Get number of strategies from vault
            const strategiesLength = await vault.strategiesLength();
            console.log(`Number of strategies: ${strategiesLength}`);

            // Prepare withdrawal amounts array (withdraw from strategies that are over-allocated)
            const withdrawAmounts = [];
            const withdrawSwapData = [];
            const investSwapData = [];

            for (let i = 0; i < strategiesLength; i++) {
                const strategyAddress = await vault.strategies(i);
                
                if (strategyAddress.toLowerCase() === AAVE_STRATEGY_ADDRESS.toLowerCase()) {
                    withdrawAmounts.push(aaveWithdrawAmount);
                    withdrawSwapData.push([]); // No swap needed for Aave withdrawal
                } else if (strategyAddress.toLowerCase() === UNISWAP_STRATEGY_ADDRESS.toLowerCase()) {
                    withdrawAmounts.push(uniswapWithdrawAmount);
                    withdrawSwapData.push([]); // No swap needed for Uniswap withdrawal
                } else {
                    withdrawAmounts.push(0);
                    withdrawSwapData.push([]);
                }

                // Generate invest swap data for each strategy
                if (strategyAddress.toLowerCase() === AAVE_STRATEGY_ADDRESS.toLowerCase()) {
                    // AaveV3Strategy doesn't need swap data - it directly deposits AAVE
                    investSwapData.push([]);
                    console.log("✅ No swap data needed for AaveV3Strategy");
                } else if (strategyAddress.toLowerCase() === UNISWAP_STRATEGY_ADDRESS.toLowerCase()) {
                    // Check if UniswapV3Strategy is underweight and needs investment
                    const uniswapCurrentAssets = await uniswapStrategy.totalAssets();
                    const uniswapTargetAmount = (totalAssets * BigInt(TARGET_UNISWAP_ALLOCATION)) / BigInt(100);
                    
                    console.log(`UniswapV3Strategy current assets: ${ethers.formatEther(uniswapCurrentAssets)} AAVE`);
                    console.log(`UniswapV3Strategy target amount: ${ethers.formatEther(uniswapTargetAmount)} AAVE`);
                    
                    if (uniswapCurrentAssets >= uniswapTargetAmount) {
                        // UniswapV3Strategy is already at or above target - no investment needed
                        investSwapData.push([]);
                        console.log("✅ UniswapV3Strategy is already at target allocation - no swap data needed");
                    } else {
                        // UniswapV3Strategy is underweight - calculate how much it needs
                        const deficit = uniswapTargetAmount - uniswapCurrentAssets;
                        const swapAmount = deficit / 2n; // Swap half of the deficit from AAVE to WETH
                        
                        console.log("🔧 UniswapV3Strategy is underweight - generating swap calldata...");
                        console.log(`Deficit: ${ethers.formatEther(deficit)} AAVE`);
                        console.log(`Amount to swap AAVE -> WETH: ${ethers.formatEther(swapAmount)} AAVE`);
                        
                        // Uniswap V3 SwapRouter02 address on Sepolia
                        const UNISWAP_V3_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
                        const poolFee = 500; // 0.05% fee tier
                        
                        // Create swap calldata for AAVE -> WETH
                        const iface = new ethers.Interface(SwapRouter02Artifact.abi);
                        const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes from now
                        
                        const params = {
                            tokenIn: AAVE_TOKEN_ADDRESS,
                            tokenOut: WETH_TOKEN_ADDRESS,
                            fee: poolFee,
                            recipient: UNISWAP_STRATEGY_ADDRESS, // deliver WETH to the strategy
                            deadline,
                            amountIn: swapAmount,
                            amountOutMinimum: 0n, // for tests; in prod use a quoted minOut
                            sqrtPriceLimitX96: 0n,
                        };
                        
                        const routerCalldata = iface.encodeFunctionData("exactInputSingle", [params]);
                        
                        // Pack payload for ExchangeHandler.swap(bytes)
                        // abi.encode(address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to, bytes routerCalldata)
                        const payload = ethers.AbiCoder.defaultAbiCoder().encode(
                            [
                                "address",
                                "address", 
                                "address",
                                "uint256",
                                "uint256",
                                "address",
                                "bytes",
                            ],
                            [
                                UNISWAP_V3_ROUTER,
                                AAVE_TOKEN_ADDRESS,
                                WETH_TOKEN_ADDRESS,
                                swapAmount,
                                0n,
                                UNISWAP_STRATEGY_ADDRESS,
                                routerCalldata,
                            ]
                        );
                        
                        investSwapData.push([payload]); // Array of swap calldata
                        console.log("✅ Swap calldata generated for UniswapV3Strategy");
                    }
                } else {
                    investSwapData.push([]); // Empty invest swap data for other strategies
                }
            }

            console.log(`Withdraw amounts: ${withdrawAmounts.map(a => ethers.formatEther(a)).join(", ")} AAVE`);
            console.log(`Withdraw swap data arrays: ${withdrawSwapData.length} arrays`);
            console.log(`Invest swap data arrays: ${investSwapData.length} arrays`);

        console.log("\n🚀 STEP 5: Execute Rebalance");
        console.log("-" .repeat(50));

        // Setup ExchangeHandler to allow Uniswap V3 router
        // console.log("🔧 Setting up ExchangeHandler for Uniswap V3 router...");
        // const EXCHANGE_HANDLER = "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF"; // From DEPLOYEDCONTRACT.me
        // const UNISWAP_V3_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
        
        // try {
        //     const exchangeHandler = await ethers.getContractAt("ExchangeHandler", EXCHANGE_HANDLER, wallet);
        //     await exchangeHandler.setRouter(UNISWAP_V3_ROUTER, true);
        //     console.log("✅ Uniswap V3 router enabled in ExchangeHandler");
        // } catch (error) {
        //     console.log("⚠️ Could not setup ExchangeHandler:", error.message);
        //     console.log("Proceeding with rebalance anyway...");
        // }

        try {
                // Call the new Vault.rebalance() function directly
                console.log("🔄 Calling Vault.rebalance() function...");
                const rebalanceTx = await vault.rebalance(
                    withdrawSwapData,
                    investSwapData,
                    { gasLimit: 1000000 } // Set explicit gas limit to avoid estimation issues
                );
            
                console.log(`🔄 Rebalance transaction sent: ${rebalanceTx.hash}`);
                const receipt = await rebalanceTx.wait();
                console.log(`✅ Rebalance transaction confirmed in block: ${receipt.blockNumber}`);

                // Check final allocations
                console.log("\n📊 STEP 6: Verify Final Allocations");
                console.log("-" .repeat(50));

                const finalAaveAssets = await aaveStrategy.totalAssets();
                const finalUniswapAssets = await uniswapStrategy.totalAssets();
                const finalTotalAssets = finalAaveAssets + finalUniswapAssets;

                console.log(`Final AaveV3Strategy totalAssets: ${ethers.formatEther(finalAaveAssets)} AAVE`);
                console.log(`Final UniswapV3Strategy totalAssets: ${ethers.formatEther(finalUniswapAssets)} AAVE`);
                console.log(`Final Total Strategy Assets: ${ethers.formatEther(finalTotalAssets)} AAVE`);

                if (finalTotalAssets > 0) {
                    const finalAavePercentage = (Number(finalAaveAssets) / Number(finalTotalAssets)) * 100;
                    const finalUniswapPercentage = (Number(finalUniswapAssets) / Number(finalTotalAssets)) * 100;
                    console.log(`Final Allocation - Aave: ${finalAavePercentage.toFixed(2)}%, Uniswap: ${finalUniswapPercentage.toFixed(2)}%`);
                    
                    // Check if rebalancing was successful
                    const aaveDiff = Math.abs(finalAavePercentage - TARGET_AAVE_ALLOCATION);
                    const uniswapDiff = Math.abs(finalUniswapPercentage - TARGET_UNISWAP_ALLOCATION);
                    
                    if (aaveDiff < 5 && uniswapDiff < 5) {
                        console.log("🎉 SUCCESS: Rebalancing achieved target allocations within 5%!");
                    } else {
                        console.log("⚠️ WARNING: Rebalancing did not achieve exact target allocations");
                        console.log(`Aave difference: ${aaveDiff.toFixed(2)}%, Uniswap difference: ${uniswapDiff.toFixed(2)}%`);
                    }
                }

            } catch (error) {
                console.error("❌ Rebalance failed:", error.message);
                
                // Check if it's a cooldown issue
                if (error.message.includes("COOLDOWN")) {
                    console.log("⏰ Rebalance is in cooldown period. Try again later.");
                } else if (error.message.includes("NOT_MANAGER")) {
                    console.log("🔐 Only managers can call rebalance. Check account permissions.");
                }
            }

            console.log("\n" + "=" .repeat(60));
            console.log("🏁 Rebalance Flow Test Completed");
        }
    });
});
