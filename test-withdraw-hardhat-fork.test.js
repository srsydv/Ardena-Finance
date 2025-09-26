import hre from "hardhat";
const { ethers } = hre;

// Contract addresses from Sepolia
const CONTRACTS = {
    vault: "0x3cd0145707C03316B48f8A254c494600c30ebf8d", // AAVE VAULT
    asset: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a", // AAVE TOKEN
    weth: "0x4530fABea7444674a775aBb920924632c669466e", // NEW WETH
    uniStrategy: "0x65cDA0b70d3D09139c0a78059082F885714a0Fe7", // UNISWAPV3STRATEGY
    aaveStrategy: "0x9362c59c71321c77CaeE86f9Cf02cbBF3b64277D", // AAVEV3STRATEGY
    newSwapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    aaveWethPool: "0x0E98753e483679703c902a0f574646d3653ad9eA" // AAVE/WETH POOL
};

describe("Vault Withdrawal Test on Sepolia Fork", function () {
    let vault, aave, weth, uniStrategy, aaveStrategy;
    let user, deployer;
    let userShares, totalAssets, assetsExpected;

    before(async function () {
        console.log("=== SETTING UP SEPOLIA FORK TEST ===");
        
        // Use the address that already has vault shares
        const SHARE_HOLDER = "0xf69F75EB0c72171AfF58D79973819B6A3038f39f";
        
        // Impersonate the share holder
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [SHARE_HOLDER],
        });
        
        // Give share holder some ETH for gas
        await hre.network.provider.send("hardhat_setBalance", [
            SHARE_HOLDER,
            "0x1000000000000000000", // 1 ETH
        ]);
        
        deployer = await ethers.getSigner(SHARE_HOLDER);
        user = await ethers.getSigner(SHARE_HOLDER);
        console.log("Deployer:", deployer.address);
        console.log("User:", user.address);
        console.log("");

        // Get contracts from Sepolia
        vault = await ethers.getContractAt("Vault", CONTRACTS.vault);
        aave = await ethers.getContractAt("ERC20", CONTRACTS.asset);
        weth = await ethers.getContractAt("ERC20", CONTRACTS.weth);
        uniStrategy = await ethers.getContractAt("UniswapV3Strategy", CONTRACTS.uniStrategy);
        aaveStrategy = await ethers.getContractAt("AaveV3Strategy", CONTRACTS.aaveStrategy);

        console.log("📋 CONTRACT ADDRESSES:");
        console.log("Vault:", CONTRACTS.vault);
        console.log("AAVE Token:", CONTRACTS.asset);
        console.log("WETH Token:", CONTRACTS.weth);
        console.log("UniswapV3Strategy:", CONTRACTS.uniStrategy);
        console.log("AaveV3Strategy:", CONTRACTS.aaveStrategy);
        console.log("");

        // Check current state
        userShares = await vault.balanceOf(user.address);
        totalAssets = await vault.totalAssets();
        
        console.log("📋 CURRENT STATE:");
        console.log("User shares:", ethers.formatUnits(userShares, 18));
        console.log("Vault total assets:", ethers.formatUnits(totalAssets, 18), "AAVE");
        console.log("Vault total supply:", ethers.formatUnits(await vault.totalSupply(), 18));
        console.log("");

        // Check strategy allocations
        const strategiesLength = await vault.strategiesLength();
        console.log("Number of strategies:", strategiesLength.toString());
        
        for (let i = 0; i < strategiesLength; i++) {
            const strategy = await vault.strategies(i);
            const allocation = await vault.targetBps(strategy);
            
            console.log(`Strategy ${i}:`, strategy);
            console.log(`  Allocation:`, allocation.toString(), "bps");
            
            if (strategy.toLowerCase() === CONTRACTS.uniStrategy.toLowerCase()) {
                const uniTotalAssets = await uniStrategy.totalAssets();
                const aaveInUni = await aave.balanceOf(CONTRACTS.uniStrategy);
                const wethInUni = await weth.balanceOf(CONTRACTS.uniStrategy);
                
                console.log(`  Total assets:`, ethers.formatUnits(uniTotalAssets, 18), "AAVE");
                console.log(`  Liquid AAVE:`, ethers.formatUnits(aaveInUni, 18));
                console.log(`  Liquid WETH:`, ethers.formatEther(wethInUni));
            } else if (strategy.toLowerCase() === CONTRACTS.aaveStrategy.toLowerCase()) {
                const aaveTotalAssets = await aaveStrategy.totalAssets();
                const aaveInAave = await aave.balanceOf(CONTRACTS.aaveStrategy);
                
                console.log(`  Total assets:`, ethers.formatUnits(aaveTotalAssets, 18), "AAVE");
                console.log(`  Liquid AAVE:`, ethers.formatUnits(aaveInAave, 18));
            }
        }
        console.log("");
    });

    it("Should successfully withdraw 1 share with proper swap data", async function () {
        this.timeout(300_000);
        console.log("=== TESTING WITHDRAWAL OF 1 SHARE ===");
        
        // Check user's vault shares
        const userShares = await vault.balanceOf(user.address);
        console.log("User vault shares:", ethers.formatEther(userShares));
        
        if (userShares > 0n) {
            console.log("✅ User has vault shares, proceeding with withdrawal test");
        } else {
            console.log("❌ User has no vault shares. Test will fail.");
        }
        console.log("");
        
        const testShares = ethers.parseUnits("1", 18);
        assetsExpected = await vault.convertToAssets(testShares);
        
        console.log("Withdrawal details:");
        console.log("  Shares:", ethers.formatUnits(testShares, 18));
        console.log("  Expected assets:", ethers.formatUnits(assetsExpected, 18), "AAVE");
        console.log("");

        // Step 1: Calculate strategy contributions
        console.log("📋 STEP 1: CALCULATE STRATEGY CONTRIBUTIONS");
        console.log("------------------------------------------");
        
        const strategiesLength = await vault.strategiesLength();
        const strategyContributions = [];
        let totalStrategyShare = 0n;
        
        for (let i = 0; i < strategiesLength; i++) {
            const strategy = await vault.strategies(i);
            const allocation = await vault.targetBps(strategy);
            
            if (strategy === ethers.ZeroAddress) {
                strategyContributions.push({
                    address: strategy,
                    allocation: allocation,
                    share: 0n
                });
                continue;
            }
            
            const strategyShare = (assetsExpected * allocation) / 10000n;
            totalStrategyShare += strategyShare;
            
            strategyContributions.push({
                address: strategy,
                allocation: allocation,
                share: strategyShare
            });
            
            console.log(`Strategy ${i} (${allocation.toString()} bps):`);
            console.log(`  Share:`, ethers.formatUnits(strategyShare, 18), "AAVE");
            
            if (strategy.toLowerCase() === CONTRACTS.uniStrategy.toLowerCase()) {
                const aaveInUni = await aave.balanceOf(CONTRACTS.uniStrategy);
                const aaveDeficit = strategyShare > aaveInUni ? strategyShare - aaveInUni : 0n;
                
                console.log(`  Liquid AAVE:`, ethers.formatUnits(aaveInUni, 18));
                console.log(`  AAVE deficit:`, ethers.formatUnits(aaveDeficit, 18));
            }
        }
        
        console.log("Total strategy share:", ethers.formatUnits(totalStrategyShare, 18), "AAVE");
        console.log("Expected assets:", ethers.formatUnits(assetsExpected, 18), "AAVE");
        console.log("");

        // Step 2: Create swap data
        console.log("📋 STEP 2: CREATE SWAP DATA");
        console.log("---------------------------");
        
        // Use the same pattern as uniswapV2Router.test.js
        const artifact = await import("@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json", { with: { type: "json" } });
        const swapRouterInterface = new ethers.Interface(artifact.default.abi);
        const deadline = Math.floor(Date.now() / 1000) + 1200;
        const poolFee = 500; // 0.05% fee tier
        const UNISWAP_V3_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E"; // Sepolia SwapRouter02
        console.log('✅ Using local SwapRouter02 ABI from node_modules');
        
        // Create swap data for each strategy
        const allSwapData = [];
        
        for (let i = 0; i < strategiesLength; i++) {
            const strategy = await vault.strategies(i);
            
            if (strategy === ethers.ZeroAddress) {
                allSwapData.push([]);
                console.log(`Strategy ${i}: Zero address - empty swap data`);
                continue;
            }
            
            if (strategy.toLowerCase() === CONTRACTS.uniStrategy.toLowerCase()) {
                // UniswapV3Strategy needs swap data
                const strategyShare = strategyContributions[i].share;
                const aaveInUni = await aave.balanceOf(CONTRACTS.uniStrategy);
                const aaveDeficit = strategyShare > aaveInUni ? strategyShare - aaveInUni : 0n;
                
                console.log(`Creating swap data for UniswapV3Strategy:`);
                console.log(`  Strategy share:`, ethers.formatUnits(strategyShare, 18), "AAVE");
                console.log(`  Liquid AAVE:`, ethers.formatUnits(aaveInUni, 18));
                console.log(`  AAVE deficit:`, ethers.formatUnits(aaveDeficit, 18));
                
                if (aaveDeficit > 0n) {
                    // Use a simple fixed price for testing (1 WETH = 10 AAVE)
                    const aavePerWeth = 10; // Fixed price for testing
                    console.log(`  Using fixed price: 1 WETH =`, aavePerWeth, "AAVE");
                    
                    // Convert AAVE deficit to WETH (with buffer for slippage)
                    const aaveDeficitNum = Number(ethers.formatUnits(aaveDeficit, 18));
                    const wethNeeded = aaveDeficitNum / aavePerWeth;
                    const wethToSwap = ethers.parseEther((wethNeeded * 1.1).toString()); // 10% buffer
                    
                    console.log(`  WETH to swap:`, ethers.formatEther(wethToSwap));
                    
                    // Create swap parameters for WETH -> AAVE
                    const params = {
                        tokenIn: CONTRACTS.weth,
                        tokenOut: CONTRACTS.asset, // AAVE
                        fee: poolFee,
                        recipient: CONTRACTS.uniStrategy,
                        deadline: deadline,
                        amountIn: wethToSwap,
                        amountOutMinimum: 0n,
                        sqrtPriceLimitX96: 0n
                    };
                    
                    const routerCalldata = swapRouterInterface.encodeFunctionData("exactInputSingle", [params]);
                    
                    // Pack payload for ExchangeHandler.swap(bytes) - same pattern as uniswapV2Router.test.js
                    const payload = ethers.AbiCoder.defaultAbiCoder().encode(
                        [
                            "address",
                            "address", 
                            "address",
                            "uint256",
                            "uint256",
                            "address",
                            "bytes"
                        ],
                        [
                            UNISWAP_V3_ROUTER,
                            CONTRACTS.weth,
                            CONTRACTS.asset, // AAVE
                            wethToSwap,
                            0,
                            CONTRACTS.uniStrategy,
                            routerCalldata
                        ]
                    );
                    
                    allSwapData.push([payload]);
                    console.log(`  ✅ Swap data created`);
                } else {
                    console.log(`  ✅ No swap needed, strategy has enough liquid AAVE`);
                    allSwapData.push([]);
                }
            } else {
                // Other strategies get empty swap data
                allSwapData.push([]);
                console.log(`Strategy ${i}: Empty swap data (not UniswapV3Strategy)`);
            }
        }
        
        console.log("");

        // Step 3: Execute withdrawal
        console.log("📋 STEP 3: EXECUTE WITHDRAWAL");
        console.log("-----------------------------");
        
        const userBalanceBefore = await aave.balanceOf(user.address);
        console.log("User AAVE balance before:", ethers.formatUnits(userBalanceBefore, 18));
        
        // Simulate the withdrawal first
        console.log("Simulating withdrawal...");
        try {
            const simulatedResult = await vault.connect(user).withdraw.staticCall(testShares, user.address, allSwapData);
            console.log("✅ Simulation successful, result:", ethers.formatUnits(simulatedResult, 18), "AAVE");
        } catch (simError) {
            console.log("❌ Simulation failed:", simError.message);
            throw new Error(`Withdrawal simulation failed: ${simError.message}`);
        }
        
        // Execute the actual withdrawal
        console.log("Executing withdrawal transaction...");
        const tx = await vault.connect(user).withdraw(testShares, user.address, allSwapData);
        console.log("Transaction sent:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed!");
        console.log("Gas used:", receipt.gasUsed.toString());
        console.log("");

        // Check for Withdraw event
        const withdrawEvent = receipt.logs.find(log => {
            try {
                const parsed = vault.interface.parseLog(log);
                return parsed.name === "Withdraw";
            } catch {
                return false;
            }
        });
        
        if (withdrawEvent) {
            const parsed = vault.interface.parseLog(withdrawEvent);
            const { caller, to, assets, shares } = parsed.args;
            
            console.log("🎉 WITHDRAWAL SUCCESS!");
            console.log("Withdraw Event Details:");
            console.log("  Caller:", caller);
            console.log("  To:", to);
            console.log("  Assets (net):", ethers.formatUnits(assets, 18), "AAVE");
            console.log("  Shares:", ethers.formatUnits(shares, 18));
            console.log("");
            
            // Calculate exit fee
            const exitFee = assetsExpected - assets;
            console.log("Exit Fee Analysis:");
            console.log("  Expected assets:", ethers.formatUnits(assetsExpected, 18), "AAVE");
            console.log("  Actual assets (net):", ethers.formatUnits(assets, 18), "AAVE");
            console.log("  Exit fee:", ethers.formatUnits(exitFee, 18), "AAVE");
            console.log("  Exit fee %:", ((Number(exitFee) / Number(assetsExpected)) * 100).toFixed(4), "%");
            console.log("");
            
        } else {
            throw new Error("No Withdraw event found in transaction receipt");
        }
        
        const userBalanceAfter = await aave.balanceOf(user.address);
        const received = userBalanceAfter - userBalanceBefore;
        
        console.log("📋 FINAL RESULTS:");
        console.log("----------------");
        console.log("User AAVE balance after:", ethers.formatUnits(userBalanceAfter, 18));
        console.log("AAVE received:", ethers.formatUnits(received, 18));
        console.log("Expected:", ethers.formatUnits(assetsExpected, 18));
        
        const success = received >= assetsExpected * 95n / 100n; // Allow 5% tolerance for fees
        console.log("Withdrawal success:", success ? "✅ YES" : "❌ NO");
        
        if (!success) {
            const shortfall = assetsExpected - received;
            console.log("Shortfall:", ethers.formatUnits(shortfall, 18), "AAVE");
            console.log("Shortfall %:", ((Number(shortfall) / Number(assetsExpected)) * 100).toFixed(4), "%");
            throw new Error(`Withdrawal failed: received ${ethers.formatUnits(received, 18)} AAVE, expected ${ethers.formatUnits(assetsExpected, 18)} AAVE`);
        }
        
        console.log("🎉 SUCCESS! Withdrawal works correctly!");
        console.log("The vault and UniswapV3Strategy are working correctly!");
    });

    it("Should handle withdrawal with insufficient liquid AAVE", async function () {
        console.log("=== TESTING WITHDRAWAL WITH INSUFFICIENT LIQUID AAVE ===");
        
        // This test would check what happens when the strategy doesn't have enough liquid AAVE
        // and needs to remove liquidity from Uniswap position
        
        const testShares = ethers.parseUnits("5", 18); // Larger withdrawal
        const assetsExpected = await vault.convertToAssets(testShares);
        
        console.log("Large withdrawal test:");
        console.log("  Shares:", ethers.formatUnits(testShares, 18));
        console.log("  Expected assets:", ethers.formatUnits(assetsExpected, 18), "AAVE");
        
        // Check if this would require liquidity removal
        const aaveInUni = await aave.balanceOf(CONTRACTS.uniStrategy);
        const uniTotalAssets = await uniStrategy.totalAssets();
        
        console.log("UniswapV3Strategy state:");
        console.log("  Liquid AAVE:", ethers.formatUnits(aaveInUni, 18));
        console.log("  Total assets:", ethers.formatUnits(uniTotalAssets, 18), "AAVE");
        
        if (assetsExpected > aaveInUni) {
            console.log("✅ This test will require liquidity removal from Uniswap position");
            console.log("AAVE deficit:", ethers.formatUnits(assetsExpected - aaveInUni, 18), "AAVE");
        } else {
            console.log("ℹ️ This test can be satisfied with liquid AAVE only");
        }
        
        // Note: This test is for documentation purposes
        // The actual withdrawal test above already covers the main scenario
    });
});
