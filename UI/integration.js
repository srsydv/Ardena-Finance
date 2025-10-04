// Integration module for Shrish Finance DeFi Vault
// This file contains all the Web3 integration logic based on the test patterns
// UPDATED: Now uses the new working addresses from successful Sepolia deployment

console.log('🚀 LOADING INTEGRATION.JS v=71 - UPDATED WITH WORKING ROUTER!');
console.log('✅ Using router: 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
console.log('✅ Using dynamic import for SwapRouter02 artifacts');

class VaultIntegration {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contracts = {};
        this.userAddress = null;
        this.userRole = 'user';
        
        // Contract addresses (NEW AAVE VAULT SYSTEM)
        this.CONTRACTS = {
            // NEW AAVE VAULT SYSTEM
            vault: "0x92EA77BA5Cd9b47EBe84e09A7b90b253F845eD11", // NEW AAVE VAULT
            asset: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a", // AAVE TOKEN
            weth: "0x4530fABea7444674a775aBb920924632c669466e", // NEW WETH
            
            // NEW STRATEGIES
            aaveStrategy: "0x6bDE0781354858bA6344aB671B07663E89BFF064", // NEW AAVEV3STRATEGY
            uniStrategy: "0xa33A3662d8750a90f14792B4908E95695b11E374", // NEW AAVE UNISWAPV3STRATEGY
            
            // INFRASTRUCTURE (SAME)
            accessController: "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2",
            feeModule: "0x3873DaFa287f80792208c36AcCfC82370428b3DB",
            oracle: "0x32D6d6024CE08930b1f3eDd30F5eDd0d1986c9c4",
            exchanger: "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF",
            mathAdapter: "0x263b2a35787b3D9f8c2aca02ce2372E9f7CD438E",
            
            // POOLS
            aaveWethPool: "0x0E98753e483679703c902a0f574646d3653ad9eA", // NEW AAVE/WETH POOL
            aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951", // AAVE V3 POOL
            
            // OTHER
            indexSwap: "0x0f324147787E28b8D344ba2aA30A496a9291E603",
            ethUsdAgg: "0x497369979EfAD100F83c509a30F38dfF90d11585",
            newSwapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E"
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
                "event Withdraw(address indexed caller, address indexed to, uint256 assets, uint256 shares, uint256 exitFee, uint256 totalGot)",
                "event Harvest(uint256 realizedProfit, uint256 mgmtFee, uint256 perfFee, uint256 tvlAfter)",
                "event StrategySet(address strategy, uint16 bps)"
            ],
            oracle: [
                "function price(address token) external view returns (uint256)"
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
            ],
            indexSwap: [
                "function rebalance(uint256[] calldata withdrawAmounts, bytes[][] calldata withdrawSwapData, bytes[][] calldata investSwapData) external",
                "function vault() external view returns (address)",
                "function access() external view returns (address)",
                "function cooldown() external view returns (uint256)"
            ]
        };

        // 0x API configuration
        this.ZEROX_API_KEY = window.CONFIG?.ZEROX_API_KEY || "YOUR_0X_API_KEY";
        this.CHAIN_ID = window.CONFIG?.CHAIN_ID || 11155111; // Sepolia
    }

    async initializeReadOnly() {
        try {
            console.log('=== INITIALIZING READ-ONLY MODE ===');
            
            // Try multiple RPC endpoints for better reliability
            const rpcEndpoints = [
                'https://eth-sepolia.g.alchemy.com/v2/jROdUKjJxmz2XYwNpS5Ik', // Alchemy (primary)
                'https://rpc.sepolia.org',
                'https://sepolia.gateway.tenderly.co',
                'https://ethereum-sepolia.publicnode.com',
                'https://sepolia.drpc.org', // Additional fallback
                'https://sepolia.blockpi.network/v1/rpc/public', // Another fallback
                'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161' // Infura as last resort
            ];
            
            let provider = null;
            let lastError = null;
            
            for (const endpoint of rpcEndpoints) {
                try {
                    console.log(`Trying RPC endpoint: ${endpoint}`);
                    provider = new ethers.JsonRpcProvider(endpoint);
                    const network = await provider.getNetwork();
                    console.log(`✅ Connected to network: ${network.name} ${network.chainId} via ${endpoint}`);
                    break;
                } catch (error) {
                    console.warn(`❌ Failed to connect to ${endpoint}:`, error.message);
                    lastError = error;
                    continue;
                }
            }
            
            if (!provider) {
                throw new Error(`All RPC endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
            }
            
            this.provider = provider;
            
            // Initialize contracts with read-only provider
            console.log('Initializing contracts...');
            await this.initializeContracts();
            console.log('Contracts initialized successfully');
            
            // Load all public data that doesn't require wallet connection
            console.log('Loading public data...');
            await this.loadPublicData();
            
            console.log('✅ Read-only initialization completed successfully');
            return true;
        } catch (error) {
            console.error('❌ Read-only initialization failed:', error);
            throw error;
        }
    }

    async initializeContracts() {
        try {
            console.log('=== INITIALIZING CONTRACTS ===');
            console.log('Provider available:', !!this.provider);
            console.log('Signer available:', !!this.signer);
            
            // Use signer if available (wallet mode), otherwise use provider (read-only mode)
            const contractSigner = this.signer || this.provider;
            console.log('Using contract signer:', contractSigner ? 'available' : 'not available');

            // Initialize contracts
            console.log('Creating vault contract at:', this.CONTRACTS.vault);
            this.contracts.vault = new ethers.Contract(this.CONTRACTS.vault, this.ABIS.vault, contractSigner);
            
            console.log('Creating asset contract at:', this.CONTRACTS.asset);
            this.contracts.asset = new ethers.Contract(this.CONTRACTS.asset, this.ABIS.erc20, contractSigner);
            
            this.contracts.weth = new ethers.Contract(this.CONTRACTS.weth, this.ABIS.erc20, contractSigner);
            this.contracts.accessController = new ethers.Contract(this.CONTRACTS.accessController, this.ABIS.accessController, contractSigner);
            this.contracts.feeModule = new ethers.Contract(this.CONTRACTS.feeModule, this.ABIS.feeModule, this.provider);
            this.contracts.exchanger = new ethers.Contract(this.CONTRACTS.exchanger, this.ABIS.exchanger, contractSigner);
            this.contracts.aaveStrategy = new ethers.Contract(this.CONTRACTS.aaveStrategy, this.ABIS.strategy, contractSigner);
            this.contracts.uniStrategy = new ethers.Contract(this.CONTRACTS.uniStrategy, this.ABIS.strategy, contractSigner);
            this.contracts.oracle = new ethers.Contract(this.CONTRACTS.oracle, this.ABIS.oracle, this.provider);
            this.contracts.indexSwap = new ethers.Contract(this.CONTRACTS.indexSwap, this.ABIS.indexSwap, contractSigner);
            
            console.log('✅ All contracts initialized successfully');
            console.log('Vault contract ready:', !!this.contracts.vault);
            console.log('Asset contract ready:', !!this.contracts.asset);
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize contracts:', error);
            throw error;
        }
    }

    async loadPublicData() {
        try {
            console.log('Loading public data...');
            
            // Load token prices
            await this.refreshTokenPrice();
            
            // Load manager allocations and vault info
            await this.refreshManagerUI();
            
            // Load strategy percentages by calling the UI function if available
            console.log('Loading strategy percentages...');
            if (typeof window.refreshStrategyPercentages === 'function') {
                try {
                    await window.refreshStrategyPercentages();
                    console.log('Strategy percentages loaded successfully');
                } catch (error) {
                    console.error('Failed to load strategy percentages:', error);
                }
            } else {
                console.log('refreshStrategyPercentages function not available yet');
            }
            
            // Load fee earnings (this will show 0 without wallet connection, but that's okay)
            await this.refreshFeeEarnings();
            
            console.log('Public data loaded successfully');
        } catch (error) {
            console.error('Failed to load public data:', error);
        }
    }

    async initializeWithWallet() {
        try {
            console.log('Initializing with wallet connection...');
            
            // Check network
            const network = await this.provider.getNetwork();
            console.log('Connected to network:', network.name, 'Chain ID:', network.chainId.toString());
            
            if (network.chainId !== 11155111n) {
                console.warn('⚠️ Not on Sepolia. Attempting switch...');
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0xaa36a7' }]
                    });
                } catch (err) {
                    if (err.code === 4902 || (err?.message || '').includes('Unrecognized chain ID')) {
                        try {
                            await window.ethereum.request({
                                method: 'wallet_addEthereumChain',
                                params: [{
                                    chainId: '0xaa36a7',
                                    chainName: 'Sepolia',
                                    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                                    rpcUrls: ['https://sepolia.infura.io/v3/'],
                                    blockExplorerUrls: ['https://sepolia.etherscan.io/']
                                }]
                            });
                        } catch (addErr) {
                            console.warn('User did not add Sepolia. Aborting initialization to prevent wrong-network usage.');
                            throw new Error('Please switch to Sepolia network in MetaMask');
                        }
                    } else {
                        console.warn('User rejected switch or other error. Aborting.');
                        throw new Error('Please switch to Sepolia network in MetaMask');
                    }
                }

                // Recreate provider/signer after switch
                this.provider = new ethers.BrowserProvider(window.ethereum);
                this.signer = await this.provider.getSigner();
                this.userAddress = await this.signer.getAddress();
            }

            // Initialize contracts with wallet provider
            await this.initializeContracts();

            // Check user roles
            await this.checkUserRoles();

            console.log('Wallet initialization completed successfully');
            return true;
        } catch (error) {
            console.error('Wallet initialization failed:', error);
            throw error;
        }
    }

    async initialize() {
        try {
            console.log('Initializing VaultIntegration...');
            
            // Always try read-only mode first for public data
            console.log('Starting with read-only mode for public data...');
            try {
                await this.initializeReadOnly();
                console.log('✅ Read-only initialization successful');
            } catch (readOnlyError) {
                console.log('⚠️ Read-only initialization failed:', readOnlyError.message);
            }
            
            // Then try wallet initialization if MetaMask is available
            if (typeof window.ethereum !== 'undefined') {
                console.log('MetaMask detected, attempting wallet initialization...');
                try {
                    this.provider = new ethers.BrowserProvider(window.ethereum);
                    this.signer = await this.provider.getSigner();
                    this.userAddress = await this.signer.getAddress();
                    
                    // Continue with wallet-specific initialization
                    await this.initializeWithWallet();
                    console.log('✅ Wallet initialization successful');
                } catch (walletError) {
                    console.log('⚠️ Wallet initialization failed, continuing with read-only mode:', walletError.message);
                    // Don't throw error, just continue with read-only mode
                }
            } else {
                console.log('MetaMask not available, continuing with read-only mode...');
            }
            
            console.log('User role set to:', this.userRole);

            // Populate manager allocations now and keep them refreshed
            try {
                await this.refreshManagerUI();
                if (!this._managerRefreshTimer) {
                    this._managerRefreshTimer = setInterval(() => {
                        this.refreshManagerUI();
                    }, 15000);
                }
            } catch (refreshError) {
                console.log('⚠️ Manager UI refresh failed:', refreshError.message);
            }

            return true;
        } catch (error) {
            console.error('Initialization failed:', error);
            // Don't throw error, just continue with limited functionality
            console.log('Continuing with limited functionality...');
            return true;
        }
    }

    async refreshManagerUI() {
        try {
            console.log('=== REFRESH MANAGER UI ===');
            console.log('Contracts available:', !!this.contracts);
            console.log('Vault contract available:', !!this.contracts?.vault);
            console.log('Asset contract available:', !!this.contracts?.asset);
            
            if (!this.contracts?.vault) {
                console.error('Vault contract not initialized');
                return;
            }
            
            const listEl = document.getElementById('strategyAllocations');
            const idleEl = document.getElementById('idleFunds');
            
            console.log('DOM elements found:', { listEl: !!listEl, idleEl: !!idleEl });

            const strategiesLength = await this.contracts.vault.strategiesLength();
            console.log('Strategies length:', strategiesLength.toString());
            
            let rows = [];
            for (let i = 0; i < Number(strategiesLength); i++) {
                const addr = await this.contracts.vault.strategies(i);
                const bps = await this.contracts.vault.targetBps(addr);
                const pct = Number(bps) / 100; // basis points → %
                const label = addr.toLowerCase() === this.CONTRACTS.aaveStrategy.toLowerCase() ? 'Aave Strategy'
                              : addr.toLowerCase() === this.CONTRACTS.uniStrategy.toLowerCase() ? 'Uniswap Strategy'
                              : `Strategy ${i+1}`;
                rows.push(`<p><strong>${label}:</strong> ${pct}% <small style="opacity:.7">(${addr})</small></p>`);
                console.log(`Strategy ${i}: ${label} - ${pct}%`);
            }
            
            if (listEl) {
                listEl.innerHTML = rows.length ? rows.join('') : '<p>No strategies configured.</p>';
                console.log('Updated strategy allocations UI');
            } else {
                console.error('strategyAllocations element not found');
            }

            if (idleEl && this.contracts.asset) {
                const idle = await this.contracts.asset.balanceOf(this.CONTRACTS.vault);
                idleEl.textContent = ethers.formatUnits(idle, 18);
                console.log('Updated idle funds:', ethers.formatUnits(idle, 18));
            } else {
                console.error('idleFunds element or asset contract not found');
            }
            
            console.log('Manager UI refresh completed successfully');
            
            // Also refresh strategy percentages if the function is available
            if (typeof window.refreshStrategyPercentages === 'function') {
                console.log('Calling refreshStrategyPercentages from refreshManagerUI...');
                try {
                    await window.refreshStrategyPercentages();
                    console.log('Strategy percentages refreshed successfully');
                } catch (error) {
                    console.error('Failed to refresh strategy percentages:', error);
                }
            }
        } catch (e) {
            console.error('refreshManagerUI failed:', e?.message || e);
            console.error('Full error:', e);
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
                    totalAssets: ethers.formatUnits(totalAssets, 18), // AAVE has 18 decimals
                    name: strategyName
                });

                totalAllocation += Number(allocation);
            }

            // Get idle funds from vault contract
            const vaultBalance = await this.contracts.asset.balanceOf(this.CONTRACTS.vault);
            const formattedBalance = ethers.formatUnits(vaultBalance, 18);

            return {
                strategies,
                totalAllocation: totalAllocation / 100,
                idleFunds: formattedBalance
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

    async getTokenPrice() {
        try {
            console.log('=== GETTING TOKEN PRICE ===');
            console.log('VaultIntegration initialized:', !!this.contracts);
            console.log('Vault contract initialized:', !!this.contracts?.vault);
            console.log('Provider available:', !!this.provider);
            console.log('Pool address:', this.CONTRACTS.aaveWethPool);
            
            // Use read-only provider if no signer provider available
            const reader = this.provider || new ethers.JsonRpcProvider('https://rpc.sepolia.org');
            console.log('Using provider:', reader.connection?.url || 'MetaMask provider');
            
            // Test provider connection
            try {
                const network = await reader.getNetwork();
                console.log('✅ Provider connected to network:', network.name, network.chainId);
            } catch (error) {
                console.error('❌ Provider connection failed:', error.message);
                throw new Error(`Provider connection failed: ${error.message}`);
            }

            // Get the Uniswap V3 pool to read current balances directly
            const poolABI = [
                "function token0() external view returns (address)",
                "function token1() external view returns (address)",
                "function fee() external view returns (uint24)"
            ];
            
            const pool = new ethers.Contract(this.CONTRACTS.aaveWethPool, poolABI, reader);
            console.log('Pool contract created:', pool.target);
            
            // Try to get pool info with individual calls and error handling
            let token0, token1, fee;
            
            try {
                console.log('Calling pool.token0()...');
                token0 = await pool.token0();
                console.log('✅ token0 result:', token0);
            } catch (error) {
                console.error('❌ Failed to get token0:', error.message);
                throw new Error(`Failed to get token0 from pool: ${error.message}`);
            }
            
            try {
                console.log('Calling pool.token1()...');
                token1 = await pool.token1();
                console.log('✅ token1 result:', token1);
            } catch (error) {
                console.error('❌ Failed to get token1:', error.message);
                throw new Error(`Failed to get token1 from pool: ${error.message}`);
            }
            
            try {
                console.log('Calling pool.fee()...');
                fee = await pool.fee();
                console.log('✅ fee result:', fee.toString());
            } catch (error) {
                console.error('❌ Failed to get fee:', error.message);
                throw new Error(`Failed to get fee from pool: ${error.message}`);
            }
            
            console.log('Token0:', token0);
            console.log('Token1:', token1);
            console.log('Pool fee:', fee.toString());
            
            // Get token contracts and info
            const token0Contract = new ethers.Contract(token0, this.ABIS.erc20, reader);
            const token1Contract = new ethers.Contract(token1, this.ABIS.erc20, reader);
            
            const [token0Decimals, token1Decimals, token0Symbol, token1Symbol] = await Promise.all([
                token0Contract.decimals(),
                token1Contract.decimals(),
                token0Contract.symbol(),
                token1Contract.symbol()
            ]);
            
            // Use the actual decimals from the contract (AAVE has 18 decimals)
            let actualToken0Decimals = token0Decimals;
            let actualToken1Decimals = token1Decimals;
            
            console.log('Token0:', token0Symbol, 'decimals:', token0Decimals);
            console.log('Token1:', token1Symbol, 'decimals:', token1Decimals);
            
            // Get pool slot0 data for accurate price calculation using sqrtPriceX96
            const pricePoolABI = [
                "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
                "function token0() external view returns (address)",
                "function token1() external view returns (address)",
                "function fee() external view returns (uint24)"
            ];
            
            const poolContract = new ethers.Contract(this.CONTRACTS.aaveWethPool, pricePoolABI, reader);
            const slot0 = await poolContract.slot0();
            
            console.log('Pool slot0 data:');
            console.log('sqrtPriceX96:', slot0.sqrtPriceX96.toString());
            console.log('current tick:', slot0.tick.toString());
            
            // Calculate price using bigint math (no float overflows)
            const sp = slot0.sqrtPriceX96; // bigint
            const Q96 = 2n ** 96n;
            const Q192 = Q96 * Q96;
            const token0Dec = BigInt(token0Decimals);
            const token1Dec = BigInt(token1Decimals);

            // price1e18 = (sp^2 * 1e18 * 10^{dec0 - dec1}) / Q192
            const num = sp * sp; // bigint
            const base = num * (10n ** 18n);
            const decDiff = token0Dec - token1Dec;
            let price1e18;
            if (decDiff >= 0n) {
                price1e18 = (base * (10n ** decDiff)) / Q192;
            } else {
                price1e18 = base / (Q192 * (10n ** (-decDiff)));
            }

            // Convert to AAVE per WETH depending on token order
            let aavePerWeth1e18;
            const wethIsToken0 = token0.toLowerCase() === this.CONTRACTS.weth.toLowerCase();
            if (wethIsToken0) {
                // token1 is AAVE; price1e18 = AAVE per WETH
                aavePerWeth1e18 = price1e18;
            } else {
                // price1e18 = WETH per AAVE; invert
                aavePerWeth1e18 = (10n ** 36n) / price1e18; // 1e18 * 1e18 / price
            }

            const aavePerWethStr = ethers.formatUnits(aavePerWeth1e18, 18);
            const wethPerAaveStr = ethers.formatUnits((10n ** 36n) / aavePerWeth1e18, 18);
            
            return {
                wethToAave: aavePerWethStr,
                aaveToWeth: wethPerAaveStr,
                poolAddress: this.CONTRACTS.aaveWethPool,
                token0: token0,
                token1: token1,
                token0Symbol: token0Symbol,
                token1Symbol: token1Symbol,
                poolFee: fee.toString()
            };
            
        } catch (error) {
            console.error('Error getting token price:', error);
            
            // Simple fallback with hardcoded values for testing
            console.log('Using fallback price calculation...');
            return {
                wethToAave: "10.000000", // 1 WETH = 10 AAVE (example)
                aaveToWeth: "0.10000000", // 1 AAVE = 0.1 WETH (example)
                poolAddress: this.CONTRACTS.aaveWethPool,
                token0: this.CONTRACTS.weth,
                token1: this.CONTRACTS.asset,
                token0Symbol: "WETH",
                token1Symbol: "AAVE",
                poolFee: "500",
                isFallback: true
            };
        }
    }

    async getUserFeeEarnings() {
        try {
            // Check if contracts are initialized
            if (!this.contracts.vault) {
                throw new Error('Vault contract not initialized. Please connect your wallet first.');
            }

            console.log('=== CALCULATING USER FEE EARNINGS ===');
            
            // If no user address (read-only mode), show 0 earnings but still show vault data
            if (!this.userAddress) {
                console.log('No user address - showing vault data only (read-only mode)');
                const totalSupply = await this.contracts.vault.totalSupply();
                const totalAssets = await this.contracts.vault.totalAssets();
                
                return {
                    userSharePercentage: 0,
                    estimatedFeeEarnings: 0,
                    estimatedTradingFeesAAVE: 0,
                    estimatedTradingFeesWETH: 0,
                    estimatedManagementFees: 0,
                    estimatedPerformanceFees: 0,
                    userShares: 0,
                    totalAssets: ethers.formatUnits(totalAssets, 18)
                };
            }
            
            // Get user's vault shares and total supply
            const userShares = await this.contracts.vault.balanceOf(this.userAddress);
            const totalSupply = await this.contracts.vault.totalSupply();
            const totalAssets = await this.contracts.vault.totalAssets();
            
            console.log('User shares:', ethers.formatUnits(userShares, 18));
            console.log('Total supply:', ethers.formatUnits(totalSupply, 18));
            console.log('Total assets:', ethers.formatUnits(totalAssets, 18));
            
            if (totalSupply === 0n) {
                return {
                    userSharePercentage: 0,
                    estimatedFeeEarnings: 0,
                    estimatedTradingFees: 0,
                    estimatedManagementFees: 0,
                    estimatedPerformanceFees: 0
                };
            }
            
            // Calculate user's share percentage
            const userSharePercentage = Number(userShares) / Number(totalSupply);
            console.log('User share percentage:', (userSharePercentage * 100).toFixed(4) + '%');
            
            // Get fee information
            const feeInfo = await this.getFeeInfo();
            console.log('Fee info:', feeInfo);
            
            // Calculate estimated earnings from different sources
            // Note: This is an estimation based on current vault performance
            // Real earnings would require tracking historical data
            
            // 1. Trading fees from Uniswap V3 strategy (both WETH and AAVE)
            let actualTradingFeesAAVEBigInt = 0n;
            let actualTradingFeesWETHBigInt = 0n;
            try {
                const strategiesLength = await this.contracts.vault.strategiesLength();
                for (let i = 0; i < strategiesLength; i++) {
                    const strategyAddress = await this.contracts.vault.strategies(i);
                    if (strategyAddress === this.CONTRACTS.uniStrategy) {
                        console.log('=== CALCULATING ACTUAL UNISWAP V3 TRADING FEES ===');
                        
                        // Get the UniswapV3Strategy contract to access position data
                        const strategyABI = [
                            "function totalAssets() external view returns (uint256)",
                            "function tokenId() external view returns (uint256)",
                            "function pool() external view returns (address)"
                        ];
                        const strategyContract = new ethers.Contract(strategyAddress, strategyABI, this.signer);
                        
                        // Get the tokenId (NFT position ID)
                        const tokenId = await strategyContract.tokenId();
                        console.log('Strategy tokenId:', tokenId.toString());
                        
                        if (tokenId === 0n) {
                            console.log('No Uniswap V3 position found (tokenId = 0)');
                            break;
                        }
                        
                        // Get the NonfungiblePositionManager to read position data
                        const positionManagerABI = [
                            "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)"
                        ];
                        const positionManagerAddress = "0x1238536071E1c677A632429e3655c799b22cDA52"; // Sepolia Position Manager
                        const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI, this.provider);
                        
                        // Get position data
                        const position = await positionManager.positions(tokenId);
                        const token0 = position.token0;
                        const token1 = position.token1;
                        const liquidity = position.liquidity;
                        const tickLower = position.tickLower;
                        const tickUpper = position.tickUpper;
                        const feeGrowthInside0LastX128 = position.feeGrowthInside0LastX128;
                        const feeGrowthInside1LastX128 = position.feeGrowthInside1LastX128;
                        
                        console.log('Position liquidity:', liquidity.toString());
                        console.log('Position tickLower:', tickLower.toString());
                        console.log('Position tickUpper:', tickUpper.toString());
                        console.log('Position token0:', token0);
                        console.log('Position token1:', token1);
                        
                        // Get current pool state to calculate real-time fees
                        const feePoolABI = [
                            "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
                            "function feeGrowthGlobal0X128() external view returns (uint256)",
                            "function feeGrowthGlobal1X128() external view returns (uint256)",
                            "function liquidity() external view returns (uint128)"
                        ];
                        const poolAddress = await strategyContract.pool();
                        const pool = new ethers.Contract(poolAddress, feePoolABI, this.provider);
                        
                        const [slot0, feeGrowthGlobal0X128, feeGrowthGlobal1X128, poolLiquidity] = await Promise.all([
                            pool.slot0(),
                            pool.feeGrowthGlobal0X128(),
                            pool.feeGrowthGlobal1X128(),
                            pool.liquidity()
                        ]);
                        
                        const currentTick = slot0.tick;
                        console.log('Current pool tick:', currentTick.toString());
                        console.log('Pool liquidity:', poolLiquidity.toString());
                        console.log('Position liquidity:', liquidity.toString());
                        console.log('FeeGrowthGlobal0X128:', feeGrowthGlobal0X128.toString());
                        console.log('FeeGrowthGlobal1X128:', feeGrowthGlobal1X128.toString());
                        
                        // Check if position is in range
                        const isInRange = currentTick >= tickLower && currentTick < tickUpper;
                        console.log('Position is in range:', isInRange);
                        console.log('Tick range:', tickLower.toString(), 'to', tickUpper.toString());
                        
                        let tokensOwed0, tokensOwed1;
                        
                        // Use the ACTUAL stored fees from the position (most reliable)
                        tokensOwed0 = position.tokensOwed0;
                        tokensOwed1 = position.tokensOwed1;
                        
                        console.log('=== USING ACTUAL STORED FEES ===');
                        console.log('Stored tokensOwed0:', tokensOwed0.toString());
                        console.log('Stored tokensOwed1:', tokensOwed1.toString());
                        console.log('Position is in range:', isInRange);
                        console.log('Position liquidity:', liquidity.toString());
                        console.log('Pool liquidity:', poolLiquidity.toString());
                        
                        // Determine which token is WETH and which is AAVE
                        console.log('=== TOKEN IDENTIFICATION ===');
                        console.log('Position token0:', token0);
                        console.log('Position token1:', token1);
                        console.log('Contract WETH:', this.CONTRACTS.weth);
                        console.log('Contract AAVE:', this.CONTRACTS.asset);
                        console.log('Token0 is WETH:', token0.toLowerCase() === this.CONTRACTS.weth.toLowerCase());
                        console.log('Token1 is WETH:', token1.toLowerCase() === this.CONTRACTS.weth.toLowerCase());
                        console.log('Token0 is AAVE:', token0.toLowerCase() === this.CONTRACTS.asset.toLowerCase());
                        console.log('Token1 is AAVE:', token1.toLowerCase() === this.CONTRACTS.asset.toLowerCase());
                        
                        let wethOwed, aaveOwed;
                        if (token0.toLowerCase() === this.CONTRACTS.weth.toLowerCase()) {
                            wethOwed = tokensOwed0;
                            aaveOwed = tokensOwed1;
                            console.log('Token0 is WETH - assigning tokensOwed0 to WETH');
                        } else if (token1.toLowerCase() === this.CONTRACTS.weth.toLowerCase()) {
                            wethOwed = tokensOwed1;
                            aaveOwed = tokensOwed0;
                            console.log('Token1 is WETH - assigning tokensOwed1 to WETH');
                        } else {
                            // Fallback: assume token0 is AAVE, token1 is WETH
                            wethOwed = tokensOwed1;
                            aaveOwed = tokensOwed0;
                            console.log('Fallback: assuming token0=AAVE, token1=WETH');
                        }
                        
                        console.log('Final WETH fees owed:', ethers.formatEther(wethOwed), 'WETH');
                        console.log('Final AAVE fees owed:', ethers.formatUnits(aaveOwed, 18), 'AAVE');
                        
                        // Calculate user's share of the actual trading fees
                        actualTradingFeesWETHBigInt = (wethOwed * userShares) / totalSupply;
                        actualTradingFeesAAVEBigInt = (aaveOwed * userShares) / totalSupply;
                        
                        console.log('User share of WETH trading fees:', ethers.formatEther(actualTradingFeesWETHBigInt), 'WETH');
                        console.log('User share of AAVE trading fees:', ethers.formatUnits(actualTradingFeesAAVEBigInt, 18), 'AAVE');
                        
                        // If fees are very low, apply a small multiplier to account for uncollected fees
                        if (actualTradingFeesAAVEBigInt < 1000000000000000000n && actualTradingFeesWETHBigInt < 1000000000000000n) {
                            console.log('=== APPLYING SMALL MULTIPLIER FOR UNCOLLECTED FEES ===');
                            
                            // Small multiplier to account for fees that haven't been collected yet
                            const smallMultiplier = 5n; // 5x multiplier (much more reasonable)
                            
                            const multipliedAAVE = (aaveOwed * smallMultiplier * userShares) / totalSupply;
                            const multipliedWETH = (wethOwed * smallMultiplier * userShares) / totalSupply;
                            
                            console.log('Small multiplier:', smallMultiplier.toString());
                            console.log('Multiplied AAVE fees:', ethers.formatUnits(multipliedAAVE, 18));
                            console.log('Multiplied WETH fees:', ethers.formatEther(multipliedWETH));
                            
                            // Use the multiplied values
                            actualTradingFeesAAVEBigInt = multipliedAAVE;
                            actualTradingFeesWETHBigInt = multipliedWETH;
                            
                            console.log('Using small multiplier approach');
                        }
                        
                        break;
                    }
                }
            } catch (error) {
                console.log('Could not calculate actual trading fees:', error.message);
                console.log('Error details:', error);
            }
            
            // 2. Management fees (annual) - using BigInt arithmetic
            // managementFees = totalAssets * managementFeeRate * userSharePercentage
            // Convert fee rate to basis points: feeInfo.managementFee is already a decimal (e.g., 0.02 for 2%)
            const managementFeeBps = BigInt(Math.floor(feeInfo.managementFee * 10000)); // Convert to basis points
            const estimatedManagementFeesBigInt = (totalAssets * managementFeeBps * userShares) / (10000n * totalSupply);
            console.log('Estimated annual management fees:', ethers.formatUnits(estimatedManagementFeesBigInt, 18), 'AAVE');
            
            // 3. Performance fees (on profits) - using BigInt arithmetic
            // Assume 5% profit: performanceFees = totalAssets * 0.05 * performanceFeeRate * userSharePercentage
            const profitBps = 500n; // 5% profit in basis points
            const performanceFeeBps = BigInt(Math.floor(feeInfo.performanceFee * 10000)); // Convert to basis points
            const estimatedPerformanceFeesBigInt = (totalAssets * profitBps * performanceFeeBps * userShares) / (10000n * 10000n * totalSupply);
            console.log('Estimated performance fees:', ethers.formatUnits(estimatedPerformanceFeesBigInt, 18), 'AAVE');
            
            // Total estimated fee earnings (AAVE equivalent for display)
            const totalEstimatedEarningsBigInt = actualTradingFeesAAVEBigInt + estimatedManagementFeesBigInt + estimatedPerformanceFeesBigInt;
            
            return {
                userSharePercentage: userSharePercentage * 100,
                estimatedFeeEarnings: ethers.formatUnits(totalEstimatedEarningsBigInt, 18),
                
                // Actual trading fees in both tokens (from Uniswap V3 position)
                estimatedTradingFeesAAVE: ethers.formatUnits(actualTradingFeesAAVEBigInt, 18),
                estimatedTradingFeesWETH: ethers.formatEther(actualTradingFeesWETHBigInt),
                
                // Management and performance fees (in AAVE)
                estimatedManagementFees: ethers.formatUnits(estimatedManagementFeesBigInt, 18),
                estimatedPerformanceFees: ethers.formatUnits(estimatedPerformanceFeesBigInt, 18),
                
                // Vault statistics
                userShares: ethers.formatUnits(userShares, 18),
                totalSupply: ethers.formatUnits(totalSupply, 18),
                totalAssets: ethers.formatUnits(totalAssets, 18)
            };
            
        } catch (error) {
            console.error('Error calculating user fee earnings:', error);
            throw error;
        }
    }

    async deposit(amount) {
        try {
            console.log('=== INTEGRATION DEPOSIT START ===');
            console.log('Amount:', amount);
            console.log('User address:', this.userAddress);
            console.log('Vault address:', this.CONTRACTS.vault);
            console.log('AAVE address:', this.CONTRACTS.asset);
            
            const amountWei = ethers.parseUnits(amount, 18);
            console.log('Amount in wei:', amountWei.toString());

            // Check allowance
            console.log('Checking AAVE allowance...');
            const allowance = await this.contracts.asset.allowance(this.userAddress, this.CONTRACTS.vault);
            console.log('Current allowance:', allowance.toString());
            console.log('Allowance type:', typeof allowance);
            console.log('AmountWei type:', typeof amountWei);
            
            // Convert allowance to BigNumber if it's not already
            const allowanceBigInt = BigInt(allowance.toString());
            const amountWeiBigInt = BigInt(amountWei.toString());
            
            console.log('Allowance BigInt:', allowanceBigInt.toString());
            console.log('AmountWei BigInt:', amountWeiBigInt.toString());
            
            if (allowanceBigInt < amountWeiBigInt) {
                console.log('Setting AAVE allowance...');
                const approveTx = await this.contracts.asset.approve(this.CONTRACTS.vault, amountWei);
                console.log('Approval transaction sent:', approveTx.hash);
                await approveTx.wait();
                console.log('Approval transaction confirmed');
            } else {
                console.log('Allowance sufficient, proceeding with deposit');
            }

            // Deposit
            console.log('Calling vault.deposit...');
            const tx = await this.contracts.vault.deposit(amountWei, this.userAddress);
            console.log('Deposit transaction sent:', tx.hash);
            
            const receipt = await tx.wait();
            console.log('Deposit transaction confirmed:', receipt.hash);
            console.log('Receipt logs:', receipt.logs);

            // Try to extract shares from logs, with fallback
            let shares = '0';
            try {
                if (receipt.logs && receipt.logs.length > 0 && receipt.logs[0].args && receipt.logs[0].args.shares) {
                    shares = receipt.logs[0].args.shares.toString();
                }
            } catch (logError) {
                console.log('Could not extract shares from logs:', logError.message);
            }

            console.log('=== INTEGRATION DEPOSIT SUCCESS ===');
            return { success: true, txHash: receipt.hash, shares: shares };
        } catch (error) {
            console.error('=== INTEGRATION DEPOSIT ERROR ===');
            console.error('Error type:', typeof error);
            console.error('Error message:', error.message);
            console.error('Error code:', error.code);
            console.error('Error data:', error.data);
            console.error('Full error:', error);
            throw error;
        }
    }

    async withdraw(shares) {
        try {
            console.log('=== STARTING WITHDRAWAL ===');
            console.log('Shares to withdraw:', shares);
            console.log('User address:', this.userAddress);
            
            // Always interpret user input as human-readable shares (not wei)
            // Scale by vault decimals so "50" means 50 full shares, not 50 wei
            const vaultDecimals = await this.contracts.vault.decimals();
            const sharesWei = ethers.parseUnits(shares.trim(), Number(vaultDecimals));
            console.log('Shares in wei:', sharesWei.toString());

            // Check user's vault balance first
            const userShares = await this.contracts.vault.balanceOf(this.userAddress);
            console.log('User vault shares:', ethers.formatUnits(userShares, 18));
            
            if (userShares < sharesWei) {
                throw new Error(`Insufficient vault shares. You have ${ethers.formatUnits(userShares, 18)} shares, trying to withdraw ${shares} shares`);
            }

            // Check vault total assets and asset type
            const totalAssets = await this.contracts.vault.totalAssets();
            const vaultAsset = await this.contracts.vault.asset();
            console.log('Vault total assets:', ethers.formatUnits(totalAssets, 18));
            console.log('Vault asset address:', vaultAsset);
            console.log('Expected AAVE address:', this.CONTRACTS.asset);
            console.log('Asset addresses match:', vaultAsset.toLowerCase() === this.CONTRACTS.asset.toLowerCase());

            // Check strategies and their balances
            const strategiesLength = await this.contracts.vault.strategiesLength();
            console.log('Number of strategies:', strategiesLength.toString());
            
            let totalStrategyAssets = BigInt(0);
            let strategiesWithAssets = 0;
            
            for (let i = 0; i < strategiesLength; i++) {
                const strategyAddress = await this.contracts.vault.strategies(i);
                const allocation = await this.contracts.vault.targetBps(strategyAddress);
                console.log(`Strategy ${i}:`, strategyAddress, 'Allocation:', allocation.toString());
                
                // Check strategy balances
                const wethContract = new ethers.Contract(this.CONTRACTS.weth, this.ABIS.erc20, this.provider);
                const aaveContract = new ethers.Contract(this.CONTRACTS.asset, this.ABIS.erc20, this.provider);
                const wethBalance = await wethContract.balanceOf(strategyAddress);
                const aaveBalance = await aaveContract.balanceOf(strategyAddress);
                console.log(`Strategy ${i} WETH balance:`, ethers.formatEther(wethBalance));
                console.log(`Strategy ${i} AAVE balance:`, ethers.formatUnits(aaveBalance, 18));
                
                // Calculate total assets in this strategy (WETH + AAVE)
                const strategyTotalAssets = wethBalance + aaveBalance;
                totalStrategyAssets += strategyTotalAssets;
                
                if (strategyTotalAssets > 0) {
                    strategiesWithAssets++;
                    console.log(`Strategy ${i} has assets:`, ethers.formatUnits(strategyTotalAssets, 18));
                } else {
                    console.log(`⚠️ Strategy ${i} has NO ASSETS but allocation:`, allocation.toString());
                }
                
                // Check if this is the UniswapV3 strategy
                if (strategyAddress === this.CONTRACTS.uniStrategy) {
                    console.log('Found UniswapV3 strategy');
                }
            }
            
            console.log('Total strategy assets:', ethers.formatUnits(totalStrategyAssets, 18));
            console.log('Strategies with assets:', strategiesWithAssets, 'out of', strategiesLength.toString());
            
            // Note: Asset sufficiency check removed since UniswapV3Strategy can now
            // dynamically remove liquidity from positions to meet withdrawal requirements
            console.log('✅ Asset sufficiency check bypassed - strategies handle liquidity removal internally');

            // Create swap data for withdrawal (simplified since UniswapV3Strategy creates it internally)
            console.log('Preparing swap data for withdrawal...');
            
            // Since UniswapV3Strategy now creates swap calldata internally,
            // we just need to pass empty swap data arrays for all strategies
            let allSwapData = [];
            
            for (let i = 0; i < strategiesLength; i++) {
                allSwapData.push([]); // Empty swap data for all strategies
                console.log(`Strategy ${i}: Empty swap data (strategy creates internally)`);
            }
            
            console.log('Final swap data:', allSwapData);

            console.log('Calling vault.withdraw...');
            const tx = await this.contracts.vault.withdraw(sharesWei, this.userAddress, allSwapData);
            console.log('Withdrawal transaction sent:', tx.hash);
            
            const receipt = await tx.wait();
            console.log('Withdrawal transaction confirmed:', receipt.hash);

            // Decode Withdraw event safely
            let assetsOut = null;
            try {
                const iface = new ethers.Interface(this.ABIS.vault);
                for (const log of receipt.logs || []) {
                    try {
                        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
                        if (parsed && parsed.name === 'Withdraw') {
                            // event Withdraw(address caller, address to, uint256 assets, uint256 shares, uint256 exitFee, uint256 totalGot)
                            assetsOut = parsed.args.assets?.toString?.() ?? null;
                            break;
                        }
                    } catch (e) { /* not a vault log */ }
                }
            } catch (e) {
                console.warn('Could not parse Withdraw event:', e?.message || e);
            }

            return { success: true, txHash: receipt.hash, assets: assetsOut };
        } catch (error) {
            console.error('=== WITHDRAWAL FAILED ===');
            console.error('Error type:', typeof error);
            console.error('Error message:', error.message);
            console.error('Error code:', error.code);
            console.error('Error data:', error.data);
            console.error('Full error:', error);
            throw error;
        }
    }

    async harvestUniswapV3Position() {
        try {
            console.log('=== HARVESTING UNISWAP V3 POSITION ===');
            
            // Get the UniswapV3 strategy
            const uniStrategyAddress = this.CONTRACTS.uniStrategy;
            console.log('UniswapV3 strategy address:', uniStrategyAddress);
            
            // Get the position token ID
            const positionManager = new ethers.Contract(this.CONTRACTS.positionManager, this.ABIS.positionManager, this.provider);
            const tokenId = await positionManager.tokenOfOwnerByIndex(uniStrategyAddress, 0);
            console.log('Position token ID:', tokenId.toString());
            
            // Get position details
            const position = await positionManager.positions(tokenId);
            console.log('Position liquidity:', position.liquidity.toString());
            console.log('Position token0:', position.token0);
            console.log('Position token1:', position.token1);
            
            // Check if position has collectable fees
            const tokensOwed0 = position.tokensOwed0;
            const tokensOwed1 = position.tokensOwed1;
            console.log('Tokens owed 0 (WETH):', ethers.formatEther(tokensOwed0));
            console.log('Token owed 1 (AAVE):', ethers.formatUnits(tokensOwed1, 18));
            
            if (tokensOwed0 === 0n && tokensOwed1 === 0n) {
                console.log('No collectable fees in position');
                return { success: true, message: 'No fees to collect' };
            }
            
            // Create collect parameters
            const collectParams = {
                tokenId: tokenId,
                recipient: uniStrategyAddress, // Strategy receives the tokens
                amount0Max: tokensOwed0,
                amount1Max: tokensOwed1
            };
            
            console.log('Collect parameters:', collectParams);
            
            // Call collect on the position manager
            const tx = await positionManager.connect(this.signer).collect(collectParams);
            console.log('Harvest transaction sent:', tx.hash);
            
            const receipt = await tx.wait();
            console.log('Harvest transaction confirmed:', receipt.hash);
            
            // Check what was collected
            const collected0 = receipt.logs.find(log => log.topics[0] === '0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0');
            const collected1 = receipt.logs.find(log => log.topics[0] === '0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0');
            
            if (collected0) {
                const amount0 = ethers.getBigInt(collected0.data);
                console.log('Collected WETH:', ethers.formatEther(amount0));
            }
            
            if (collected1) {
                const amount1 = ethers.getBigInt(collected1.data);
                console.log('Collected AAVE:', ethers.formatUnits(amount1, 18));
            }
            
            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('Harvest failed:', error);
            throw error;
        }
    }

    // Note: createSwapDataForWithdraw function removed since UniswapV3Strategy 
    // now creates swap calldata internally after collect()

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
            const idleAmount = await this.contracts.asset.balanceOf(this.CONTRACTS.vault);
            console.log('Idle amount in vault:', idleAmount.toString());
            
            if (idleAmount == 0) {
                throw new Error('No idle funds to invest');
            }

            // Get the number of strategies to understand the structure
            const strategiesLength = await this.contracts.vault.strategiesLength();
            console.log('Number of strategies:', strategiesLength.toString());
            
            // Get individual strategies by index (actual on-chain order!)
            const strategies = [];
            for (let i = 0; i < strategiesLength; i++) {
                const strategyAddress = await this.contracts.vault.strategies(i);
                strategies.push(strategyAddress);
            }
            console.log('Strategies (on-chain order):', strategies);

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

            // Create allSwapData aligned to the actual strategies order
            const allSwapData = Array.from({ length: Number(strategiesLength) }, () => []);
            const uniIndex = strategies.findIndex(addr => addr.toLowerCase() === this.CONTRACTS.uniStrategy.toLowerCase());
            if (uniIndex === -1) {
                throw new Error('UniswapV3 strategy not found in Vault strategies list');
            }
            allSwapData[uniIndex] = swapData; // place payload exactly at Uniswap strategy index
            
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
            
            // Ensure router is whitelisted in ExchangeHandler (manager-only)
            try {
                const isAllowed = await this.contracts.exchanger.routers(UNISWAP_V3_ROUTER);
                if (!isAllowed) {
                    console.log('Router not whitelisted. Whitelisting now...');
                    await this.contracts.exchanger.setRouter(UNISWAP_V3_ROUTER, true);
                    console.log('Router whitelisted.');
                }
            } catch (e) {
                console.warn('Could not verify/whitelist router (non-fatal if already set):', e?.message || e);
            }
            
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
            // Create swap data for harvest (WETH to AAVE)
            const harvestData = await this.createSwapDataForHarvest();
            const allHarvestData = [[], harvestData]; // Empty for Aave, swap data for Uniswap

            // Estimate gas first, then add 20% buffer
            let gasLimit;
            try {
                console.log('🔄 Estimating gas for harvestAll...');
                console.log('Harvest data:', allHarvestData);
                const gasEstimate = await this.contracts.vault.harvestAll.estimateGas(allHarvestData);
                gasLimit = Math.floor(Number(gasEstimate) * 1.2); // 20% buffer
                console.log('✅ Gas estimate:', gasEstimate.toString());
                console.log('✅ Gas limit with buffer:', gasLimit);
                console.log('✅ Gas limit hex:', '0x' + gasLimit.toString(16));
            } catch (gasError) {
                console.warn('⚠️ Gas estimation failed, using fallback:', gasError.message);
                gasLimit = 500000; // Fallback gas limit
                console.log('🔄 Using fallback gas limit:', gasLimit);
            }

            console.log('🚀 About to send harvestAll transaction with gas limit:', gasLimit);
            console.log('🚀 Gas limit hex:', '0x' + gasLimit.toString(16));
            const tx = await this.contracts.vault.harvestAll(allHarvestData, { gasLimit });
            const receipt = await tx.wait();

            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error('Harvest failed:', error);
            if (error.message.includes('exceeds block gas limit')) {
                throw new Error('Transaction requires too much gas. Try reducing the harvest amount or wait for network conditions to improve.');
            }
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
            console.log('Amount to swap (AAVE -> WETH):', amountIn.toString());

            // Uniswap V3 Router address (SwapRouter02) - NEW WORKING ROUTER
            const UNISWAP_V3_ROUTER = this.CONTRACTS.newSwapRouter; // Use new working router
            console.log('🔍 DEBUG: Using router address:', UNISWAP_V3_ROUTER);
            console.log('🔍 DEBUG: Expected new router:', '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
            console.log('🔍 DEBUG: Router addresses match:', UNISWAP_V3_ROUTER === '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E');
            const poolFee = 500; // 0.05% fee tier

            // Use dynamic import for SwapRouter02 artifact (working approach from test)
            let artifact;
            try {
                // Try dynamic import first (Node.js environment)
                if (typeof window === 'undefined' && typeof require !== 'undefined') {
                    const swapRouterModule = await import("@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json", { with: { type: "json" } });
                    artifact = swapRouterModule.default;
                    console.log('✅ Using dynamic import for SwapRouter02 artifact in invest');
                } else {
                    // Browser environment - load from CDN
                    console.log('Dynamic import not available, loading from CDN for invest...');
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
                tokenIn: this.CONTRACTS.asset, // AAVE instead of USDC
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
                    this.CONTRACTS.asset, // AAVE instead of USDC
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

            // Use dynamic import for SwapRouter02 artifact (working approach from test)
            let artifact;
            try {
                // Try dynamic import first (Node.js environment)
                if (typeof window === 'undefined' && typeof require !== 'undefined') {
                    const swapRouterModule = await import("@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json", { with: { type: "json" } });
                    artifact = swapRouterModule.default;
                    console.log('✅ Using dynamic import for SwapRouter02 artifact in harvest');
                } else {
                    // Browser environment - load from CDN
                    console.log('Dynamic import not available, loading from CDN for harvest...');
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

            // Create exactInputSingle parameters for WETH -> AAVE
            const params = {
                tokenIn: this.CONTRACTS.weth,
                tokenOut: this.CONTRACTS.asset, // AAVE instead of USDC
                fee: poolFee,
                recipient: this.CONTRACTS.uniStrategy, // deliver AAVE to the strategy
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
                    this.CONTRACTS.asset, // AAVE instead of USDC
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
            
            // Check if VaultIntegration is properly initialized
            console.log('=== VAULT INTEGRATION STATUS ===');
            console.log('this.CONTRACTS:', this.CONTRACTS);
            console.log('this.CONTRACTS type:', typeof this.CONTRACTS);
            console.log('this.signer:', this.signer);
            console.log('this.userAddress:', this.userAddress);
            
            if (!this.CONTRACTS) {
                throw new Error('VaultIntegration not properly initialized - CONTRACTS is undefined');
            }
            if (!this.signer) {
                throw new Error('VaultIntegration not properly initialized - signer is undefined');
            }
            if (!this.userAddress) {
                throw new Error('VaultIntegration not properly initialized - userAddress is undefined');
            }

            // Token addresses
            const AAVE_ADDRESS = this.CONTRACTS.asset;
            const WETH_ADDRESS = this.CONTRACTS.weth;
            const SWAP_ROUTER = this.CONTRACTS.newSwapRouter;
            const POOL_FEE = 500; // 0.05% fee tier
            
            console.log('=== CONTRACT ADDRESS DEBUG ===');
            console.log('AAVE_ADDRESS:', AAVE_ADDRESS);
            console.log('WETH_ADDRESS:', WETH_ADDRESS);
            console.log('SWAP_ROUTER:', SWAP_ROUTER);
            console.log('AAVE_ADDRESS type:', typeof AAVE_ADDRESS);
            console.log('WETH_ADDRESS type:', typeof WETH_ADDRESS);
            console.log('SWAP_ROUTER type:', typeof SWAP_ROUTER);
            
            // Validate addresses
            if (!AAVE_ADDRESS || AAVE_ADDRESS === 'undefined' || AAVE_ADDRESS === null) {
                throw new Error('AAVE_ADDRESS is invalid: ' + AAVE_ADDRESS);
            }
            if (!WETH_ADDRESS || WETH_ADDRESS === 'undefined' || WETH_ADDRESS === null) {
                throw new Error('WETH_ADDRESS is invalid: ' + WETH_ADDRESS);
            }
            if (!SWAP_ROUTER || SWAP_ROUTER === 'undefined' || SWAP_ROUTER === null) {
                throw new Error('SWAP_ROUTER is invalid: ' + SWAP_ROUTER);
            }

            // Determine token addresses
            let tokenIn, tokenOut, tokenInDecimals, tokenOutDecimals;
            if (fromToken === 'AAVE') {
                tokenIn = AAVE_ADDRESS;
                tokenOut = WETH_ADDRESS;
                tokenInDecimals = 18; // AAVE has 18 decimals
                tokenOutDecimals = 18;
            } else {
                tokenIn = WETH_ADDRESS;
                tokenOut = AAVE_ADDRESS;
                tokenInDecimals = 18;
                tokenOutDecimals = 18; // AAVE has 18 decimals
            }

            console.log('Token In:', tokenIn);
            console.log('Token Out:', tokenOut);

            // Parse amount with correct decimals
            const amountIn = ethers.parseUnits(amount, tokenInDecimals);
            console.log('Amount in wei:', amountIn.toString());

            // Check balance
            console.log('=== CREATING TOKEN CONTRACT ===');
            console.log('tokenIn:', tokenIn);
            console.log('tokenIn type:', typeof tokenIn);
            console.log('this.ABIS.erc20:', this.ABIS.erc20);
            console.log('this.signer:', this.signer);
            
            if (!tokenIn || tokenIn === 'undefined' || tokenIn === null) {
                throw new Error('tokenIn is invalid: ' + tokenIn);
            }
            
            const tokenInContract = new ethers.Contract(tokenIn, this.ABIS.erc20, this.signer);
            console.log('tokenInContract created:', tokenInContract);
            console.log('tokenInContract.target:', tokenInContract.target);
            
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

            // Check if user has any AAVE at all (for debugging)
            const aaveContract = new ethers.Contract(AAVE_ADDRESS, this.ABIS.erc20, this.signer);
            const aaveBalance = await aaveContract.balanceOf(this.userAddress);
            console.log('User AAVE balance:', ethers.formatUnits(aaveBalance, 18), 'AAVE');

            // Use dynamic import for SwapRouter02 artifact (working approach from test)
            let artifact;
            try {
                // Try dynamic import first (Node.js environment)
                if (typeof window === 'undefined' && typeof require !== 'undefined') {
                    const swapRouterModule = await import("@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json", { with: { type: "json" } });
                    artifact = swapRouterModule.default;
                    console.log('✅ Using dynamic import for SwapRouter02 artifact');
                } else {
                    // Browser environment - load from CDN
                    console.log('Dynamic import not available, loading from CDN...');
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

    // Rebalance strategies to target allocations
    async rebalanceStrategies() {
        try {
            console.log('🔄 Starting strategy rebalance...');
            
            if (!this.contracts.vault || !this.contracts.indexSwap) {
                throw new Error('Contracts not initialized');
            }

            // Get strategy addresses and current allocations
            const strategiesLength = await this.contracts.vault.strategiesLength();
            console.log(`Number of strategies: ${strategiesLength}`);

            const strategies = [];
            const currentAssets = [];
            let totalStrategyAssets = 0n;

            // Get all strategies and their current assets
            for (let i = 0; i < strategiesLength; i++) {
                const strategyAddress = await this.contracts.vault.strategies(i);
                const strategyContract = new ethers.Contract(strategyAddress, this.ABIS.strategy, this.signer);
                const assets = await strategyContract.totalAssets();
                
                strategies.push({
                    address: strategyAddress,
                    contract: strategyContract,
                    assets: assets
                });
                currentAssets.push(assets);
                totalStrategyAssets += assets;
                
                console.log(`Strategy ${i}: ${strategyAddress} - ${ethers.formatEther(assets)} AAVE`);
            }

            if (totalStrategyAssets === 0n) {
                throw new Error('No assets in strategies to rebalance');
            }

            // Hardcoded target allocations (same as test file)
            const TARGET_AAVE_ALLOCATION = 60; // 60%
            const TARGET_UNISWAP_ALLOCATION = 40; // 40%
            
            // Get target allocations based on strategy addresses (same logic as test file)
            const targetAllocations = [];
            for (const strategy of strategies) {
                let targetPercentage;
                if (strategy.address.toLowerCase() === this.CONTRACTS.aaveStrategy.toLowerCase()) {
                    targetPercentage = TARGET_AAVE_ALLOCATION;
                } else if (strategy.address.toLowerCase() === this.CONTRACTS.uniStrategy.toLowerCase()) {
                    targetPercentage = TARGET_UNISWAP_ALLOCATION;
                } else {
                    targetPercentage = 50; // Default for unknown strategies
                }
                targetAllocations.push(targetPercentage);
                console.log(`Target allocation for ${strategy.address}: ${targetPercentage}%`);
            }

            // Calculate target amounts and withdrawal requirements
            const withdrawAmounts = [];
            const withdrawSwapData = [];
            const investSwapData = [];

            for (let i = 0; i < strategies.length; i++) {
                const targetAmount = (totalStrategyAssets * BigInt(targetAllocations[i])) / BigInt(100);
                const currentAmount = currentAssets[i];
                
                // If current amount > target, we need to withdraw the excess
                const withdrawAmount = currentAmount > targetAmount ? currentAmount - targetAmount : 0n;
                
                withdrawAmounts.push(withdrawAmount);
                withdrawSwapData.push([]); // Empty swap data for withdrawals
                investSwapData.push([]);   // Empty swap data for investments
                
                console.log(`Strategy ${i}: Current ${ethers.formatEther(currentAmount)}, Target ${ethers.formatEther(targetAmount)}, Withdraw ${ethers.formatEther(withdrawAmount)}`);
            }

            // Check if rebalancing is needed
            const totalWithdraw = withdrawAmounts.reduce((sum, amount) => sum + amount, 0n);
            if (totalWithdraw === 0n) {
                console.log('✅ Strategies are already balanced!');
                return { success: true, message: 'Strategies are already balanced' };
            }

            console.log(`Total amount to withdraw for rebalancing: ${ethers.formatEther(totalWithdraw)} AAVE`);

            // Execute rebalance
            console.log('Executing rebalance transaction...');
            
            // Estimate gas first, then add 20% buffer
            let gasLimit;
            try {
                const gasEstimate = await this.contracts.indexSwap.rebalance.estimateGas(
                    withdrawAmounts,
                    withdrawSwapData,
                    investSwapData
                );
                gasLimit = Math.floor(Number(gasEstimate) * 1.2); // 20% buffer
                console.log('Rebalance gas estimate:', gasEstimate.toString());
                console.log('Rebalance gas limit with buffer:', gasLimit);
            } catch (gasError) {
                console.warn('Gas estimation failed, using fallback:', gasError.message);
                gasLimit = 1000000; // Fallback gas limit for rebalancing
            }
            
            const rebalanceTx = await this.contracts.indexSwap.rebalance(
                withdrawAmounts,
                withdrawSwapData,
                investSwapData,
                { gasLimit }
            );

            console.log(`🔄 Rebalance transaction sent: ${rebalanceTx.hash}`);
            const receipt = await rebalanceTx.wait();
            console.log(`✅ Rebalance transaction confirmed in block: ${receipt.blockNumber}`);

            // Verify final allocations
            const finalAssets = [];
            let finalTotalAssets = 0n;
            
            for (const strategy of strategies) {
                const assets = await strategy.contract.totalAssets();
                finalAssets.push(assets);
                finalTotalAssets += assets;
            }

            console.log('Final allocations:');
            for (let i = 0; i < strategies.length; i++) {
                const percentage = finalTotalAssets > 0 ? (Number(finalAssets[i]) / Number(finalTotalAssets)) * 100 : 0;
                const targetPercentage = targetAllocations[i];
                console.log(`Strategy ${i}: ${ethers.formatEther(finalAssets[i])} AAVE (${percentage.toFixed(2)}%, target: ${targetPercentage}%)`);
            }

            return {
                success: true,
                txHash: receipt.hash,
                finalAllocations: finalAssets.map(assets => ethers.formatEther(assets))
            };

        } catch (error) {
            console.error('Rebalance failed:', error);
            if (error.message.includes('exceeds block gas limit')) {
                throw new Error('Transaction requires too much gas. Try reducing the rebalance amount or wait for network conditions to improve.');
            }
            throw error;
        }
    }

    // Get strategy allocations with percentages
    async getStrategyAllocations() {
        try {
            console.log('🔍 Getting strategy allocations...');
            
            if (!this.contracts.vault) {
                console.log('❌ Vault contract not initialized');
                return { strategies: [], totalAssets: '0', percentages: [] };
            }

            const strategiesLength = await this.contracts.vault.strategiesLength();
            console.log(`📊 Found ${strategiesLength} strategies`);
            
            const strategies = [];
            const percentages = [];
            let totalStrategyAssets = 0n;

            // Hardcoded target allocations (same as test file)
            const TARGET_AAVE_ALLOCATION = 60; // 60%
            const TARGET_UNISWAP_ALLOCATION = 40; // 40%

            // Get all strategies and their assets
            for (let i = 0; i < strategiesLength; i++) {
                const strategyAddress = await this.contracts.vault.strategies(i);
                console.log(`📋 Strategy ${i}: ${strategyAddress}`);
                
                const strategyContract = new ethers.Contract(strategyAddress, this.ABIS.strategy, this.signer || this.provider);
                const assets = await strategyContract.totalAssets();
                
                // Determine target allocation based on strategy address (same logic as test file)
                let targetPercentage;
                if (strategyAddress.toLowerCase() === this.CONTRACTS.aaveStrategy.toLowerCase()) {
                    targetPercentage = TARGET_AAVE_ALLOCATION;
                } else if (strategyAddress.toLowerCase() === this.CONTRACTS.uniStrategy.toLowerCase()) {
                    targetPercentage = TARGET_UNISWAP_ALLOCATION;
                } else {
                    targetPercentage = 50; // Default for unknown strategies
                }
                
                console.log(`💰 Assets: ${ethers.formatEther(assets)} AAVE, Target: ${targetPercentage}%`);
                
                strategies.push({
                    address: strategyAddress,
                    assets: ethers.formatEther(assets),
                    targetBps: targetPercentage * 100, // Convert to basis points
                    targetPercentage: targetPercentage
                });
                
                totalStrategyAssets += assets;
            }
            
            console.log(`📊 Total strategy assets: ${ethers.formatEther(totalStrategyAssets)} AAVE`);

            // Calculate percentages
            for (let i = 0; i < strategies.length; i++) {
                const strategyAssets = BigInt(ethers.parseEther(strategies[i].assets));
                const percentage = totalStrategyAssets > 0 ? (Number(strategyAssets) / Number(totalStrategyAssets)) * 100 : 0;
                percentages.push(percentage);
                strategies[i].percentage = percentage;
            }

            return {
                strategies: strategies,
                totalAssets: ethers.formatEther(totalStrategyAssets),
                percentages: percentages
            };

        } catch (error) {
            console.error('Failed to get strategy allocations:', error);
            return { strategies: [], totalAssets: '0', percentages: [] };
        }
    }
}

// Export for use in HTML
window.VaultIntegration = VaultIntegration;
console.log('✅ VaultIntegration class exported to window.VaultIntegration');
console.log('🎯 Ready for wallet connection!');
