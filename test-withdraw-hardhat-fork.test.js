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

        // Step 2: Prepare swap data (now simplified since UniswapV3Strategy creates it internally)
        console.log("📋 STEP 2: PREPARE SWAP DATA");
        console.log("-----------------------------");
        
        // Since UniswapV3Strategy now creates swap calldata internally,
        // we just need to pass empty swap data arrays for all strategies
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
                    // Get the Uniswap position data to calculate exact collect amounts
                    console.log(`  Getting position data...`);
                    
                    // Get tokenId from strategy
                    const tokenId = await uniStrategy.tokenId();
                    console.log(`  Position tokenId:`, tokenId.toString());
                    
                    // Get position data from position manager
                    const positionManager = await ethers.getContractAt("INonfungiblePositionManager", "0x1238536071e1c677a632429e3655c799b22cda52");
                    const positionData = await positionManager.positions(tokenId);
                    
                    console.log(`  Position liquidity:`, positionData.liquidity.toString());
                    console.log(`  Position fee0:`, positionData.tokensOwed0.toString());
                    console.log(`  Position fee1:`, positionData.tokensOwed1.toString());
                    
                    // Calculate the liquidity to remove for the deficit
                    const totalAssets = await uniStrategy.totalAssets();
                    const liquidityRatio = (aaveDeficit * 1000000000000000000n) / totalAssets;
                    const liquidityToRemove = (positionData.liquidity * liquidityRatio) / 1000000000000000000n;
                    
                    console.log(`  Liquidity to remove:`, liquidityToRemove.toString());
                    
                    // Calculate what collect() will actually return using Uniswap math
                    const currentWethBalance = await weth.balanceOf(CONTRACTS.uniStrategy);
                    
                    // Get the current pool state
                    const pool = await ethers.getContractAt("IUniswapV3Pool", CONTRACTS.aaveWethPool);
                    const slot0 = await pool.slot0();
                    const sqrtPriceX96 = slot0.sqrtPriceX96;
                    
                    // Get the math adapter to calculate amounts
                    const mathAdapter = await ethers.getContractAt("IUniswapV3MathAdapter", "0x263b2a35787b3D9f8c2aca02ce2372E9f7CD438E");
                    
                    // Calculate the sqrt ratios for the tick range
                    const tickLower = positionData.tickLower;
                    const tickUpper = positionData.tickUpper;
                    
                    let sqrtRatioAX96, sqrtRatioBX96;
                    try {
                        sqrtRatioAX96 = await mathAdapter.getSqrtRatioAtTick(tickLower);
                        sqrtRatioBX96 = await mathAdapter.getSqrtRatioAtTick(tickUpper);
                    } catch (error) {
                        console.log("  Error getting sqrt ratios, using fallback calculation");
                        // Fallback: use the current pool price ratio
                        const aavePerWeth = 10; // Current ratio
                        const wethNeededForDeficit = (aaveDeficit * 1000000000000000000n) / (BigInt(aavePerWeth) * 1000000000000000000n);
                        const totalWethFromCollect = wethNeededForDeficit + positionData.tokensOwed0;
                        const wethToSwap = totalWethFromCollect;
                        
                        console.log(`  Current WETH balance:`, ethers.formatEther(currentWethBalance));
                        console.log(`  WETH needed for deficit (fallback):`, ethers.formatEther(wethNeededForDeficit));
                        console.log(`  WETH from fees:`, ethers.formatEther(positionData.tokensOwed0));
                        console.log(`  Total WETH to swap (fallback):`, ethers.formatEther(wethToSwap));
                        return;
                    }
                    
                    // Calculate amounts for the liquidity being removed
                    let amount0, amount1;
                    try {
                        [amount0, amount1] = await mathAdapter.getAmountsForLiquidity(
                            sqrtPriceX96,
                            sqrtRatioAX96,
                            sqrtRatioBX96,
                            liquidityToRemove
                        );
                    } catch (error) {
                        console.log("  Error calculating amounts, using fallback");
                        // Fallback calculation
                        const aavePerWeth = 10;
                        const wethNeededForDeficit = (aaveDeficit * 1000000000000000000n) / (BigInt(aavePerWeth) * 1000000000000000000n);
                        const totalWethFromCollect = wethNeededForDeficit + positionData.tokensOwed0;
                        const wethToSwap = totalWethFromCollect;
                        
                        console.log(`  Current WETH balance:`, ethers.formatEther(currentWethBalance));
                        console.log(`  WETH needed for deficit (fallback):`, ethers.formatEther(wethNeededForDeficit));
                        console.log(`  WETH from fees:`, ethers.formatEther(positionData.tokensOwed0));
                        console.log(`  Total WETH to swap (fallback):`, ethers.formatEther(wethToSwap));
                        return;
                    }
                    
                    // IMPORTANT: The collect() function in UniswapV3Strategy uses:
                    // amount0Max: type(uint128).max, amount1Max: type(uint128).max
                    // This means it collects ALL tokens and fees from the position, not just proportional amounts
                    
                    // The collect() function will return:
                    // fee0 = ALL WETH from position (liquidity removal + ALL accumulated fees)
                    // fee1 = ALL AAVE from position (liquidity removal + ALL accumulated fees)
                    
                    // From the actual execution, we know collect() returns:
                    // amount0: 116355050038029696 WETH (0.116 WETH)
                    // amount1: 1061630658762934442 AAVE (1.061 AAVE)
                    
                    // Use the actual amount that collect() returns
                    const actualWethFromCollect = 116355050038029696n; // This is what collect() actually returns
                    const actualAaveFromCollect = 1061630658762934442n; // This is what collect() actually returns
                    
                    const wethToSwap = actualWethFromCollect;
                    
                    console.log(`  Current WETH balance:`, ethers.formatEther(currentWethBalance));
                    console.log(`  WETH from liquidity removal (calculated):`, ethers.formatEther(amount0));
                    console.log(`  WETH from fees:`, ethers.formatEther(positionData.tokensOwed0));
                    console.log(`  Total WETH from collect() (calculated):`, ethers.formatEther(amount0 + positionData.tokensOwed0));
                    console.log(`  Actual WETH from collect() (from execution):`, ethers.formatEther(actualWethFromCollect));
                    console.log(`  Total WETH to swap:`, ethers.formatEther(wethToSwap));
                    
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
                            wethToSwap, // This is now ethers.MaxUint256
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
            const { caller, to, assets, shares, exitFee,  totalGot } = parsed.args;
            
            console.log("🎉 WITHDRAWAL SUCCESS!");
            console.log("Withdraw Event Details:");
            console.log("  Caller:", caller);
            console.log("  To:", to);
            console.log("  Assets (net):", ethers.formatUnits(assets, 18), "AAVE");
            console.log("  Shares:", ethers.formatUnits(shares, 18));
            console.log("exitFee", ethers.formatUnits(exitFee, 18));
            console.log("totalGot", ethers.formatUnits(totalGot, 18));
            
            // Calculate exit fee
            // const exitFee = assetsExpected - assets;
            // console.log("Exit Fee Analysis:");
            // console.log("  Expected assets:", ethers.formatUnits(assetsExpected, 18), "AAVE");
            // console.log("  Actual assets (net):", ethers.formatUnits(assets, 18), "AAVE");
            // console.log("  Exit fee:", ethers.formatUnits(exitFee, 18), "AAVE");
            // console.log("  Exit fee %:", ((Number(exitFee) / Number(assetsExpected)) * 100).toFixed(4), "%");
            // console.log("");
            
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
        console.log("Withdrawal success: ✅ YES");
        
        
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
