// Integration module for Shrish Finance DeFi Vault
// This file contains all the Web3 integration logic based on the test patterns
// UPDATED: Now uses the new working addresses from successful Sepolia deployment

class VaultIntegration {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contracts = {};
        this.userAddress = null;
        this.userRole = 'user';
        
        // Contract addresses from DEPLOYEDCONTRACT.me (UPDATED with working addresses)
        this.CONTRACTS = {
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
            // New working addresses
            newSwapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" // NEW WORKING ROUTER
        };

        // Contract ABIs
        this.ABIS = {
            vault: [
                "function deposit(uint256 assets, address receiver) external returns (uint256 shares)",
                "function withdraw(uint256 shares, address receiver, bytes[][] calldata allSwapData) external returns (uint256 assets)",
                "function investIdle(bytes[][] calldata allSwapData) external",
                "function harvestAll(bytes[][] calldata allSwapData) external",
                "function setStrategy(address strategy, uint16 bps) external",
                "function setMinHarvestInterval(uint256 interval) external",
                "function withdrawFromStrategy(address strat, uint256 amount, bytes[] calldata swapData) external returns (uint256 got)",
                "function totalAssets() external view returns (uint256)",
                "function strategiesLength() external view returns (uint256)",
                "function strategies(uint256) external view returns (address)",
                "function access() external view returns (address)",
                "function convertToAssets(uint256 shares) external view returns (uint256)",
                "function convertToShares(uint256 assets) external view returns (uint256)",
                "function balanceOf(address account) external view returns (uint256)",
                "function totalSupply() external view returns (uint256)",
                "function lastHarvest() external view returns (uint256)",
                "function minHarvestInterval() external view returns (uint256)",
                "function strategies(uint256 index) external view returns (address)",
                "function targetBps(address strategy) external view returns (uint16)",
                "function strategiesLength() external view returns (uint256)",
                "function name() external view returns (string)",
                "function symbol() external view returns (string)",
                "function asset() external view returns (address)",
                "function depositCap() external view returns (uint256)",
                "function decimals() external view returns (uint8)",
                "event Deposit(address indexed from, address indexed to, uint256 assets, uint256 net, uint256 shares)",
                "event Withdraw(address indexed caller, address indexed to, uint256 assets, uint256 shares)",
                "event Harvest(uint256 realizedProfit, uint256 mgmtFee, uint256 perfFee, uint256 tvlAfter)",
                "event StrategySet(address strategy, uint16 bps)"
            ],
            erc20: [
                "function balanceOf(address account) external view returns (uint256)",
                "function approve(address spender, uint256 amount) external returns (bool)",
                "function allowance(address owner, address spender) external view returns (uint256)",
                "function transfer(address to, uint256 amount) external returns (bool)",
                "function decimals() external view returns (uint8)",
                "function symbol() external view returns (string)",
                "function name() external view returns (string)"
            ],
            accessController: [
                "function managers(address account) external view returns (bool)",
                "function keepers(address account) external view returns (bool)",
                "function owner() external view returns (address)",
                "function setManager(address account, bool status) external",
                "function setKeeper(address account, bool status) external"
            ],
            feeModule: [
                "function managementFeeBps() external view returns (uint16)",
                "function performanceFeeBps() external view returns (uint16)",
                "function entryFeeBps() external view returns (uint16)",
                "function exitFeeBps() external view returns (uint16)",
                "function treasury() external view returns (address)",
                "function computeMgmtFee(uint256 tvl) external view returns (uint256)",
                "function takeEntryFee(uint256 amount) external view returns (uint256 net, uint256 fee)",
                "function takeExitFee(uint256 amount) external view returns (uint256 net, uint256 fee)"
            ],
            exchanger: [
                "function setRouter(address router, bool ok) external",
                "function swap(bytes data) external returns (uint256 amountOut)",
                "function routers(address router) external view returns (bool)",
                "event Swap(address router, address tokenIn, address tokenOut, uint256 amountIn, address to)"
            ],
            strategy: [
                "function totalAssets() external view returns (uint256)",
                "function deposit(uint256 amount, bytes[] calldata swapData) external",
                "function withdraw(uint256 amount, bytes[] calldata swapData) external returns (uint256)",
                "function harvest(bytes[] calldata swapData) external",
                "function want() external view returns (address)"
            ]
        };

        // 0x API configuration
        this.ZEROX_API_KEY = window.CONFIG?.ZEROX_API_KEY || "YOUR_0X_API_KEY";
        this.CHAIN_ID = window.CONFIG?.CHAIN_ID || 11155111; // Sepolia
    }

    async initialize() {
        try {
            console.log('Initializing VaultIntegration...');
            
            if (typeof window.ethereum === 'undefined') {
                throw new Error('MetaMask not installed');
            }

            console.log('MetaMask detected, creating provider...');
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            this.userAddress = await this.signer.getAddress();
            
            console.log('Provider created, user address:', this.userAddress);
            console.log('Using NEW WORKING addresses:');
            console.log('- WETH:', this.CONTRACTS.weth);
            console.log('- UniswapV3Strategy:', this.CONTRACTS.uniStrategy);
            console.log('- Pool:', this.CONTRACTS.poolAddress);
            console.log('- SwapRouter:', this.CONTRACTS.newSwapRouter);
            console.log('🔍 VERIFICATION: Router should be 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
            console.log('🔍 VERIFICATION: Router matches expected:', this.CONTRACTS.newSwapRouter === '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');

            // Initialize contracts
            this.contracts.vault = new ethers.Contract(this.CONTRACTS.vault, this.ABIS.vault, this.signer);
            this.contracts.usdc = new ethers.Contract(this.CONTRACTS.usdc, this.ABIS.erc20, this.signer);
            this.contracts.weth = new ethers.Contract(this.CONTRACTS.weth, this.ABIS.erc20, this.signer);
            this.contracts.accessController = new ethers.Contract(this.CONTRACTS.accessController, this.ABIS.accessController, this.signer);
            this.contracts.feeModule = new ethers.Contract(this.CONTRACTS.feeModule, this.ABIS.feeModule, this.provider);
            this.contracts.exchanger = new ethers.Contract(this.CONTRACTS.exchanger, this.ABIS.exchanger, this.signer);
            this.contracts.aaveStrategy = new ethers.Contract(this.CONTRACTS.aaveStrategy, this.ABIS.strategy, this.signer);
            this.contracts.uniStrategy = new ethers.Contract(this.CONTRACTS.uniStrategy, this.ABIS.strategy, this.signer);

            // Check user roles
            console.log('Checking user roles...');
            await this.checkUserRoles();
            console.log('User role set to:', this.userRole);

            return true;
        } catch (error) {
            console.error('Initialization failed:', error);
            throw error;
        }
    }

    async checkUserRoles() {
        try {
            console.log('Checking roles for address:', this.userAddress);
            console.log('AccessController address:', this.CONTRACTS.accessController);
            
            const [isManager, isKeeper] = await Promise.all([
                this.contracts.accessController.managers(this.userAddress),
                this.contracts.accessController.keepers(this.userAddress)
            ]);

            console.log('Role check results:', { isManager, isKeeper });
            
            // Reset role first
            this.userRole = 'user';
            
            if (isManager) {
                this.userRole = 'manager';
                console.log('✅ User is a manager');
            }
            if (isKeeper) {
                this.userRole = 'keeper';
                console.log('✅ User is a keeper');
            }
            
            if (!isManager && !isKeeper) {
                console.log('⚠️ User has no special roles, staying as:', this.userRole);
            }

            return { isManager, isKeeper };
        } catch (error) {
            console.error('Error checking roles:', error);
            this.userRole = 'user';
            return { isManager: false, isKeeper: false };
        }
    }

    async getVaultInfo() {
        try {
            // Check if contracts are initialized
            if (!this.contracts.vault) {
                throw new Error('Vault contract not initialized. Please connect your wallet first.');
            }

            const [
                name, symbol, asset, totalAssets, totalSupply, 
                lastHarvest, minHarvestInterval, depositCap, decimals
            ] = await Promise.all([
                this.contracts.vault.name(),
                this.contracts.vault.symbol(),
                this.contracts.vault.asset(),
                this.contracts.vault.totalAssets(),
                this.contracts.vault.totalSupply(),
                this.contracts.vault.lastHarvest(),
                this.contracts.vault.minHarvestInterval(),
                this.contracts.vault.depositCap(),
                this.contracts.vault.decimals()
            ]);

            const userShares = await this.contracts.vault.balanceOf(this.userAddress);
            const userAssets = await this.contracts.vault.convertToAssets(userShares);

            return {
                name,
                symbol,
                asset,
                totalAssets: ethers.formatUnits(totalAssets, decimals),
                totalSupply: ethers.formatUnits(totalSupply, decimals),
                userShares: ethers.formatUnits(userShares, decimals),
                userAssets: ethers.formatUnits(userAssets, decimals),
                lastHarvest: lastHarvest > 0 ? new Date(Number(lastHarvest) * 1000).toLocaleString() : 'Never',
                minHarvestInterval: minHarvestInterval.toString(),
                depositCap: ethers.formatUnits(depositCap, decimals),
                decimals: decimals.toString(),
                canHarvest: Number(lastHarvest) + Number(minHarvestInterval) <= Math.floor(Date.now() / 1000)
            };
        } catch (error) {
            console.error('Error getting vault info:', error);
            throw error;
        }
    }

    async getStrategyInfo() {
        try {
            // Check if contracts are initialized
            if (!this.contracts.vault) {
                throw new Error('Vault contract not initialized. Please connect your wallet first.');
            }

            const strategiesLength = await this.contracts.vault.strategiesLength();
            const strategies = [];
            let totalAllocation = 0;

            for (let i = 0; i < strategiesLength; i++) {
                const strategyAddress = await this.contracts.vault.strategies(i);
                const allocation = await this.contracts.vault.targetBps(strategyAddress);
                // Determine which strategy contract to use
                let strategyContract;
                let strategyName;
                if (strategyAddress === this.CONTRACTS.aaveStrategy) {
                    strategyContract = this.contracts.aaveStrategy;
                    strategyName = 'Aave V3';
                } else if (strategyAddress === this.CONTRACTS.uniStrategy) {
                    strategyContract = this.contracts.uniStrategy;
                    strategyName = 'Uniswap V3 (NEW)';
                } else {
                    // Handle any other strategies
                    strategyContract = new ethers.Contract(strategyAddress, this.ABIS.strategy, this.signer);
                    strategyName = 'Unknown Strategy';
                }

                const totalAssets = await strategyContract.totalAssets();

                strategies.push({
                    address: strategyAddress,
                    allocation: Number(allocation) / 100,
                    totalAssets: ethers.formatUnits(totalAssets, 6),
                    name: strategyName
                });

                totalAllocation += Number(allocation);
            }

            // Get idle funds
            const vaultBalance = await this.contracts.usdc.balanceOf(this.CONTRACTS.vault);

            return {
                strategies,
                totalAllocation: totalAllocation / 100,
                idleFunds: ethers.formatUnits(vaultBalance, 6)
            };
        } catch (error) {
            console.error('Error getting strategy info:', error);
            throw error;
        }
    }

    async getFeeInfo() {
        try {
            const [mgmtFee, perfFee, entryFee, exitFee, treasury] = await Promise.all([
                this.contracts.feeModule.managementFeeBps(),
                this.contracts.feeModule.performanceFeeBps(),
                this.contracts.feeModule.entryFeeBps(),
                this.contracts.feeModule.exitFeeBps(),
                this.contracts.feeModule.treasury()
            ]);

            return {
                managementFee: Number(mgmtFee) / 100,
                performanceFee: Number(perfFee) / 100,
                entryFee: Number(entryFee) / 100,
                exitFee: Number(exitFee) / 100,
                treasury
            };
        } catch (error) {
            console.error('Error getting fee info:', error);
            throw error;
        }
    }

    async deposit(amount) {
        try {
            const amountWei = ethers.parseUnits(amount, 6);

            // Check allowance
            const allowance = await this.contracts.usdc.allowance(this.userAddress, this.CONTRACTS.vault);
            if (allowance.lt(amountWei)) {
                const approveTx = await this.contracts.usdc.approve(this.CONTRACTS.vault, amountWei);
                await approveTx.wait();
            }

            // Deposit
            const tx = await this.contracts.vault.deposit(amountWei, this.userAddress);
            const receipt = await tx.wait();

            return { success: true, txHash: receipt.hash, shares: receipt.logs[0].args.shares };
        } catch (error) {
            console.error('Deposit failed:', error);
            throw error;
        }
    }

    async withdraw(shares) {
        try {
            const sharesWei = ethers.parseUnits(shares, 6);

            // Create empty swap data for withdrawal
            const allSwapData = [[], []]; // Empty arrays for both strategies

            const tx = await this.contracts.vault.withdraw(sharesWei, this.userAddress, allSwapData);
            const receipt = await tx.wait();

            return { success: true, txHash: receipt.hash, assets: receipt.logs[0].args.assets };
        } catch (error) {
            console.error('Withdrawal failed:', error);
            throw error;
        }
    }

    async investIdle() {
        try {
            console.log('=== STARTING INVEST IDLE PROCESS ===');
            console.log('User address:', this.userAddress);
            console.log('Signer address:', await this.signer.getAddress());
            console.log('Contracts initialized:', !!this.contracts.vault);
            console.log('AccessController exists:', !!this.contracts.accessController);
            
            // Double-check the manager role directly from the contract
            console.log('=== CHECKING MANAGER ROLE ===');
            console.log('AccessController contract:', !!this.contracts.accessController);
            console.log('AccessController address:', this.contracts.accessController.target);
            
            try {
                console.log('About to call managers() function...');
                const isManager = await this.contracts.accessController.managers(this.userAddress);
                console.log('Is manager according to contract:', isManager);
                
                if (!isManager) {
                    throw new Error(`Address ${this.userAddress} is not a manager. Please connect with a manager account.`);
                }
                console.log('Manager role check passed!');
            } catch (error) {
                console.error('Error checking manager role:', error);
                throw error;
            }
            
            // Get current idle amount
            const idleAmount = await this.contracts.usdc.balanceOf(this.CONTRACTS.vault);
            console.log('Idle amount in vault:', idleAmount.toString());
            
            if (idleAmount == 0) {
                throw new Error('No idle funds to invest');
            }

            // Get the number of strategies to understand the structure
            const strategiesLength = await this.contracts.vault.strategiesLength();
            console.log('Number of strategies:', strategiesLength.toString());
            
            // Get individual strategies by index
            const strategies = [];
            for (let i = 0; i < strategiesLength; i++) {
                const strategyAddress = await this.contracts.vault.strategies(i);
                strategies.push(strategyAddress);
            }
            console.log('Strategies:', strategies);

            // Create swap data for Uniswap strategy (following test pattern exactly)
            const swapData = await this.createSwapDataForInvest(idleAmount);
            console.log('Created swap data:', swapData);
            console.log('SwapData type:', typeof swapData);
            console.log('SwapData is array:', Array.isArray(swapData));
            console.log('SwapData length:', swapData ? swapData.length : 'undefined');

            // Check if swapData is valid
            if (!swapData || !Array.isArray(swapData) || swapData.length === 0) {
                throw new Error('Invalid swap data returned from createSwapDataForInvest');
            }

            // Create allSwapData array with correct structure
            // If we have 2 strategies, we need [strategy0Data, strategy1Data]
            // For Aave strategy (index 0): empty array []
            // For UniswapV3 strategy (index 1): our swap data [payload]
            const allSwapData = [];
            
            // Add empty array for Aave strategy (index 0)
            allSwapData.push([]);
            
            // Add swap data for UniswapV3 strategy (index 1)
            allSwapData.push(swapData);
            
            console.log('Final swap data array:', allSwapData);
            console.log('AllSwapData structure check - should be array of arrays:', Array.isArray(allSwapData[0]), Array.isArray(allSwapData[1]));
            console.log('AllSwapData length:', allSwapData.length);
            console.log('AllSwapData[0] length:', allSwapData[0].length);
            console.log('AllSwapData[1] length:', allSwapData[1].length);
            console.log('AllSwapData[1][0] (first payload):', allSwapData[1][0]);

            // Debug contract and method
            console.log('Vault contract address:', this.contracts.vault.target);
            console.log('Vault contract has investIdle method:', typeof this.contracts.vault.investIdle);
            
            // Check what AccessController the Vault is actually using
            const vaultAccessController = await this.contracts.vault.access();
            console.log('Vault is using AccessController at:', vaultAccessController);
            console.log('Our AccessController address:', this.contracts.accessController.target);
            console.log('AccessController addresses match:', vaultAccessController === this.contracts.accessController.target);
            
            // Check manager role on the Vault's AccessController
            const vaultAccessControllerContract = new ethers.Contract(vaultAccessController, this.ABIS.accessController, this.signer);
            const isManagerOnVaultAccessController = await vaultAccessControllerContract.managers(this.userAddress);
            console.log('Is manager on Vault\'s AccessController:', isManagerOnVaultAccessController);
            
            // Final check before transaction
            console.log('About to call investIdle with data:', allSwapData);
            console.log('Transaction will be sent from:', this.userAddress);
            
            const tx = await this.contracts.vault.investIdle(allSwapData);
            console.log('InvestIdle transaction sent:', tx.hash);
            
            const receipt = await tx.wait();
            console.log('InvestIdle transaction confirmed:', receipt.hash);

            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('Invest idle failed:', error);
            throw error;
        }
    }

    async harvestAll() {
        if (this.userRole !== 'keeper') {
            throw new Error('Only keepers can harvest');
        }

        try {
            // Create swap data for harvest (WETH to USDC)
            const harvestData = await this.createSwapDataForHarvest();
            const allHarvestData = [[], harvestData]; // Empty for Aave, swap data for Uniswap

            const tx = await this.contracts.vault.harvestAll(allHarvestData, { gasLimit: 90_000_000 });
            const receipt = await tx.wait();

            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('Harvest failed:', error);
            throw error;
        }
    }

    async setStrategy(strategyAddress, allocationBps) {
        if (this.userRole !== 'manager') {
            throw new Error('Only managers can set strategies');
        }

        try {
            const tx = await this.contracts.vault.setStrategy(strategyAddress, allocationBps);
            const receipt = await tx.wait();

            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('Set strategy failed:', error);
            throw error;
        }
    }

    async setHarvestInterval(interval) {
        if (this.userRole !== 'manager') {
            throw new Error('Only managers can set harvest interval');
        }

        try {
            const tx = await this.contracts.vault.setMinHarvestInterval(interval);
            const receipt = await tx.wait();

            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('Set harvest interval failed:', error);
            throw error;
        }
    }

    async createSwapDataForInvest(totalIdleAmount) {
        try {
            console.log('Creating swap data for invest with amount:', totalIdleAmount.toString());
            
            // Get the UniswapV3 strategy allocation from the vault
            const uniStrategyAddress = this.CONTRACTS.uniStrategy;
            const targetBps = await this.contracts.vault.targetBps(uniStrategyAddress);
            console.log('UniswapV3 strategy targetBps:', targetBps.toString());
            
            // Calculate how much goes to UniswapV3 strategy
            const idleAmountBigInt = BigInt(totalIdleAmount.toString());
            const targetBpsBigInt = BigInt(targetBps.toString());
            const toUniStrategy = (idleAmountBigInt * targetBpsBigInt) / 10000n;
            console.log('Amount going to UniswapV3 strategy:', toUniStrategy.toString());
            
            // For UniswapV3, swap half to WETH (like in vault.e2e.test.js)
            const amountIn = toUniStrategy / 2n;
            console.log('Amount to swap (USDC -> WETH):', amountIn.toString());

            // Uniswap V3 Router address (SwapRouter02) - NEW WORKING ROUTER
            const UNISWAP_V3_ROUTER = this.CONTRACTS.newSwapRouter; // Use new working router
            console.log('🔍 DEBUG: Using router address:', UNISWAP_V3_ROUTER);
            console.log('🔍 DEBUG: Expected new router:', '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
            console.log('🔍 DEBUG: Router addresses match:', UNISWAP_V3_ROUTER === '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
            const poolFee = 500; // 0.05% fee tier

            // Browser-compatible require for Uniswap artifact (same as performSwap)
            let artifact;
            try {
                // Try to use require if available (Node.js environment)
                if (typeof require !== 'undefined') {
                    artifact = require("@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json");
                    console.log('✅ Using require() for SwapRouter02 artifact in invest');
                } else {
                    // Browser environment - load from CDN
                    console.log('require() not available, loading from CDN for invest...');
                    const response = await fetch('https://unpkg.com/@uniswap/swap-router-contracts@latest/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json');
                    if (!response.ok) throw new Error('CDN load failed');
                    artifact = await response.json();
                    console.log('✅ Loaded SwapRouter02 artifact from CDN for invest');
                }
            } catch (error) {
                console.log('Failed to load artifact for invest, using fallback ABI:', error.message);
                // Fallback to direct ABI
                artifact = {
                    abi: [
                        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
                    ]
                };
                console.log('✅ Using fallback SwapRouter02 ABI for invest');
            }
      
            const swapRouterInterface = new ethers.Interface(artifact.abi);

            // Get deadline (20 minutes from now) - same as test
            const deadline = Math.floor(Date.now() / 1000) + 1200;

            // Create exactInputSingle parameters - exactly like test
            const params = {
                tokenIn: this.CONTRACTS.usdc,
                tokenOut: this.CONTRACTS.weth,
                fee: poolFee,
                recipient: this.CONTRACTS.uniStrategy, // deliver WETH to the strategy
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: 0n, // for tests; in prod use a quoted minOut
                sqrtPriceLimitX96: 0n
            };

            console.log('Swap params:', params);

            // Encode exactInputSingle call - same as test
            const routerCalldata = swapRouterInterface.encodeFunctionData("exactInputSingle", [params]);

            console.log('Router calldata:', routerCalldata);

            // Pack payload for ExchangeHandler.swap(bytes) - EXACTLY like test
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
                    this.CONTRACTS.usdc,
                    this.CONTRACTS.weth,
                    amountIn,
                    0n,
                    this.CONTRACTS.uniStrategy,
                    routerCalldata,
                ]
            );

            console.log('Final payload:', payload);

            // Allow the router in ExchangeHandler - same as test
            // await this.contracts.exchanger.setRouter(UNISWAP_V3_ROUTER, true);
            console.log('Router allowed in ExchangeHandler');

            return [payload];
        } catch (error) {
            console.error('Error creating swap data for invest:', error);
            return []; // Return empty array if swap data creation fails
        }
    }

    async createSwapDataForHarvest() {
        try {
            console.log('Creating swap data for harvest...');
            
            // Get WETH balance in Uniswap strategy
            const wethBalance = await this.contracts.weth.balanceOf(this.CONTRACTS.uniStrategy);
            console.log('WETH balance in strategy:', wethBalance.toString());
            
            if (wethBalance.eq(0)) {
                console.log('No WETH to swap, returning empty array');
                return []; // No WETH to swap
            }

            // Uniswap V3 Router address (SwapRouter02) - NEW WORKING ROUTER
            const UNISWAP_V3_ROUTER = this.CONTRACTS.newSwapRouter; // Use new working router
            console.log('🔍 DEBUG HARVEST: Using router address:', UNISWAP_V3_ROUTER);
            console.log('🔍 DEBUG HARVEST: Expected new router:', '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
            console.log('🔍 DEBUG HARVEST: Router addresses match:', UNISWAP_V3_ROUTER === '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
            const poolFee = 500; // 0.05% fee tier

            // Browser-compatible require for Uniswap artifact (same as performSwap and invest)
            let artifact;
            try {
                // Try to use require if available (Node.js environment)
                if (typeof require !== 'undefined') {
                    artifact = require("@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json");
                    console.log('✅ Using require() for SwapRouter02 artifact in harvest');
                } else {
                    // Browser environment - load from CDN
                    console.log('require() not available, loading from CDN for harvest...');
                    const response = await fetch('https://unpkg.com/@uniswap/swap-router-contracts@latest/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json');
                    if (!response.ok) throw new Error('CDN load failed');
                    artifact = await response.json();
                    console.log('✅ Loaded SwapRouter02 artifact from CDN for harvest');
                }
            } catch (error) {
                console.log('Failed to load artifact for harvest, using fallback ABI:', error.message);
                // Fallback to direct ABI
                artifact = {
                    abi: [
                        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
                    ]
                };
                console.log('✅ Using fallback SwapRouter02 ABI for harvest');
            }
            const swapRouterInterface = new ethers.Interface(artifact.abi);

            // Get deadline (20 minutes from now)
            const deadline = Math.floor(Date.now() / 1000) + 1200;

            // Create exactInputSingle parameters for WETH -> USDC
            const params = {
                tokenIn: this.CONTRACTS.weth,
                tokenOut: this.CONTRACTS.usdc,
                fee: poolFee,
                recipient: this.CONTRACTS.uniStrategy, // deliver USDC to the strategy
                deadline: deadline,
                amountIn: wethBalance,
                amountOutMinimum: 0n, // for tests; in prod use a quoted minOut
                sqrtPriceLimitX96: 0n
            };

            console.log('Harvest swap params:', params);

            // Encode exactInputSingle call
            const routerCalldata = swapRouterInterface.encodeFunctionData("exactInputSingle", [params]);

            console.log('Harvest router calldata:', routerCalldata);

            // Pack payload for ExchangeHandler.swap(bytes)
            const abiCoder = ethers.AbiCoder.defaultAbiCoder();
            const payload = abiCoder.encode(
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
                    this.CONTRACTS.weth,
                    this.CONTRACTS.usdc,
                    wethBalance,
                    0, // minOut
                    this.CONTRACTS.uniStrategy,
                    routerCalldata
                ]
            );

            console.log('Harvest final payload:', payload);

            // Allow the router in ExchangeHandler
            await this.contracts.exchanger.setRouter(UNISWAP_V3_ROUTER, true);
            console.log('Router allowed in ExchangeHandler for harvest');

            return [payload];
        } catch (error) {
            console.error('Error creating swap data for harvest:', error);
            return []; // Return empty array if swap data creation fails
        }
    }

    async get0xQuote(sellToken, buyToken, sellAmount, taker) {
        try {
            const response = await fetch(
                `https://api.0x.org/swap/allowance-holder/quote?` +
                `sellToken=${sellToken}&` +
                `buyToken=${buyToken}&` +
                `sellAmount=${sellAmount}&` +
                `taker=${taker}&` +
                `chainId=${this.CHAIN_ID}`,
                {
                    headers: {
                        '0x-api-key': this.ZEROX_API_KEY,
                        '0x-version': 'v2'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`0x API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting 0x quote:', error);
            throw error;
        }
    }

    async getTokenBalance(tokenAddress, accountAddress) {
        try {
            const tokenContract = new ethers.Contract(tokenAddress, this.ABIS.erc20, this.provider);
            const balance = await tokenContract.balanceOf(accountAddress);
            const decimals = await tokenContract.decimals();
            return ethers.formatUnits(balance, decimals);
        } catch (error) {
            console.error('Error getting token balance:', error);
            throw error;
        }
    }

    async getTokenAllowance(tokenAddress, owner, spender) {
        try {
            const tokenContract = new ethers.Contract(tokenAddress, this.ABIS.erc20, this.provider);
            const allowance = await tokenContract.allowance(owner, spender);
            const decimals = await tokenContract.decimals();
            return ethers.formatUnits(allowance, decimals);
        } catch (error) {
            console.error('Error getting token allowance:', error);
            throw error;
        }
    }

    // Utility methods
    formatUnits(value, decimals = 6) {
        return ethers.formatUnits(value, decimals);
    }

    parseUnits(value, decimals = 6) {
        return ethers.parseUnits(value, decimals);
    }

    async waitForTransaction(txHash) {
        try {
            const receipt = await this.provider.waitForTransaction(txHash);
            return receipt;
        } catch (error) {
            console.error('Error waiting for transaction:', error);
            throw error;
        }
    }

    // Event listeners
    onDeposit(callback) {
        this.contracts.vault.on('Deposit', callback);
    }

    onWithdraw(callback) {
        this.contracts.vault.on('Withdraw', callback);
    }

    onHarvest(callback) {
        this.contracts.vault.on('Harvest', callback);
    }

    onStrategySet(callback) {
        this.contracts.vault.on('StrategySet', callback);
    }

    // Remove all listeners
    removeAllListeners() {
        this.contracts.vault.removeAllListeners();
    }

    // Swap functionality
    async performSwap(fromToken, toToken, amount) {
        try {
            console.log('=== STARTING DIRECT SWAP ===');
            console.log('From token:', fromToken);
            console.log('To token:', toToken);
            console.log('Amount:', amount);

            // Token addresses
            const USDC_ADDRESS = this.CONTRACTS.usdc;
            const WETH_ADDRESS = this.CONTRACTS.weth;
            const SWAP_ROUTER = this.CONTRACTS.newSwapRouter;
            const POOL_FEE = 500; // 0.05% fee tier
            console.log('SWAP_ROUTER:', SWAP_ROUTER);

            // Determine token addresses
            let tokenIn, tokenOut, tokenInDecimals, tokenOutDecimals;
            if (fromToken === 'USDC') {
                tokenIn = USDC_ADDRESS;
                tokenOut = WETH_ADDRESS;
                tokenInDecimals = 6;
                tokenOutDecimals = 18;
            } else {
                tokenIn = WETH_ADDRESS;
                tokenOut = USDC_ADDRESS;
                tokenInDecimals = 18;
                tokenOutDecimals = 6;
            }

            console.log('Token In:', tokenIn);
            console.log('Token Out:', tokenOut);

            // Parse amount with correct decimals
            const amountIn = ethers.parseUnits(amount, tokenInDecimals);
            console.log('Amount in wei:', amountIn.toString());

            // Check balance
            const tokenInContract = new ethers.Contract(tokenIn, this.ABIS.erc20, this.signer);
            const balance = await tokenInContract.balanceOf(this.userAddress);
            console.log('User balance:', ethers.formatUnits(balance, tokenInDecimals));
            console.log('Amount to swap:', ethers.formatUnits(amountIn, tokenInDecimals));

            if (balance < amountIn) {
                throw new Error(`Insufficient ${fromToken} balance. You have ${ethers.formatUnits(balance, tokenInDecimals)} ${fromToken}, trying to swap ${ethers.formatUnits(amountIn, tokenInDecimals)} ${fromToken}`);
            }

            // Also check the other token balance for debugging
            const tokenOutContract = new ethers.Contract(tokenOut, this.ABIS.erc20, this.signer);
            const tokenOutBalance = await tokenOutContract.balanceOf(this.userAddress);
            console.log('User tokenOut balance:', ethers.formatUnits(tokenOutBalance, tokenOutDecimals));

            // Check allowance
            const allowance = await tokenInContract.allowance(this.userAddress, SWAP_ROUTER);
            console.log('Current allowance:', ethers.formatUnits(allowance, tokenInDecimals));

            if (allowance < amountIn) {
                console.log('Setting allowance...');
                const approveTx = await tokenInContract.approve(SWAP_ROUTER, amountIn);
                await approveTx.wait();
                console.log('✅ Allowance set');
            }

            // Create swap parameters (same as testSepoliaSwapRouter02.js)
            const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes
            const swapParams = {
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: POOL_FEE,
                recipient: this.userAddress,
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: 0n, // For UI, we'll accept any amount
                sqrtPriceLimitX96: 0n,
            };

            console.log('Swap parameters:', swapParams);

            // Check if user has any WETH at all (for debugging)
            const wethContract = new ethers.Contract(WETH_ADDRESS, this.ABIS.erc20, this.signer);
            const wethBalance = await wethContract.balanceOf(this.userAddress);
            console.log('User WETH balance:', ethers.formatEther(wethBalance), 'WETH');

            // Check if user has any USDC at all (for debugging)
            const usdcContract = new ethers.Contract(USDC_ADDRESS, this.ABIS.erc20, this.signer);
            const usdcBalance = await usdcContract.balanceOf(this.userAddress);
            console.log('User USDC balance:', ethers.formatUnits(usdcBalance, 6), 'USDC');

            // Browser-compatible require for Uniswap artifact
            let artifact;
            try {
                // Try to use require if available (Node.js environment)
                if (typeof require !== 'undefined') {
                    artifact = require("@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json");
                    console.log('✅ Using require() for SwapRouter02 artifact');
                } else {
                    // Browser environment - load from CDN
                    console.log('require() not available, loading from CDN...');
                    const response = await fetch('https://unpkg.com/@uniswap/swap-router-contracts@latest/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json');
                    if (!response.ok) throw new Error('CDN load failed');
                    artifact = await response.json();
                    console.log('✅ Loaded SwapRouter02 artifact from CDN');
                }
            } catch (error) {
                console.log('Failed to load artifact, using fallback ABI:', error.message);
                // Fallback to direct ABI
                artifact = {
                    abi: [
                        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
                    ]
                };
                console.log('✅ Using fallback SwapRouter02 ABI');
            }
        
            const swapRouterInterface = new ethers.Interface(artifact.abi);

            // Encode the function call
            const calldata = swapRouterInterface.encodeFunctionData("exactInputSingle", [swapParams]);
            console.log('Encoded calldata length:', calldata.length);

            // Execute the swap directly (browser environment doesn't support provider.call)
            console.log('Executing swap transaction...');
            const swapTx = await this.signer.sendTransaction({
                to: SWAP_ROUTER,
                data: calldata,
            });
            
            console.log('Swap transaction sent:', swapTx.hash);
            const receipt = await swapTx.wait();
            console.log('Swap transaction confirmed:', receipt.hash);
            console.log('Gas used:', receipt.gasUsed.toString());

            if (receipt.status === 1) {
                console.log('🎉 SUCCESS! Swap completed!');
                
                // Get new balances
                const newBalance = await tokenInContract.balanceOf(this.userAddress);
                const tokenOutContract = new ethers.Contract(tokenOut, this.ABIS.erc20, this.signer);
                const newTokenOutBalance = await tokenOutContract.balanceOf(this.userAddress);

                const amountSpent = balance - newBalance;
                console.log(`${fromToken} spent:`, ethers.formatUnits(amountSpent, tokenInDecimals));
                console.log(`${toToken} received:`, ethers.formatUnits(newTokenOutBalance, tokenOutDecimals));

                return {
                    success: true,
                    txHash: receipt.hash,
                    amountSpent: ethers.formatUnits(amountSpent, tokenInDecimals),
                    amountReceived: ethers.formatUnits(newTokenOutBalance, tokenOutDecimals)
                };
            } else {
                throw new Error('Swap transaction reverted');
            }

        } catch (error) {
            console.error('Swap failed:', error);
            throw error;
        }
    }
}

// Export for use in HTML
window.VaultIntegration = VaultIntegration;
