// Integration module for Shrish Finance DeFi Vault
// This file contains all the Web3 integration logic based on the test patterns

class VaultIntegration {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contracts = {};
        this.userAddress = null;
        this.userRole = 'user';
        
        // Contract addresses from DEPLOYEDCONTRACT.me
        this.CONTRACTS = {
            vault: "0xD995048010d777185e70bBe8FD48Ca2d0eF741a0",
            usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
            weth: "0x348B7839A8847C10EAdd196566C501eBcC2ad4C0",
            aaveStrategy: "0xCc02bC41a7AF1A35af4935346cABC7335167EdC9",
            uniStrategy: "0xA87bFB6973b92685C66D2BDc37A670Ee995a4C3B",
            accessController: "0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2",
            feeModule: "0x3873DaFa287f80792208c36AcCfC82370428b3DB",
            oracle: "0x6EE0A849079A5b63562a723367eAae77F3f5EB21",
            exchanger: "0xE3148E7e861637D84dCd7156BbbDEBD8db3D36FF",
            mathAdapter: "0x263b2a35787b3D9f8c2aca02ce2372E9f7CD438E",
            poolAddress: "0xE85292C7BeDF830071cC1C8F7b5aaB5A5391B50A",
            indexSwap: "0x34C4E1883Ed95aeb100F79bdEe0291F44C214fA2",
            ethUsdAgg: "0x497369979EfAD100F83c509a30F38dfF90d11585"
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
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = await this.provider.getSigner();
            this.userAddress = await this.signer.getAddress();
            
            console.log('Provider created, user address:', this.userAddress);

            // Initialize contracts
            this.contracts.vault = new ethers.Contract(this.CONTRACTS.vault, this.ABIS.vault, this.signer);
            this.contracts.usdc = new ethers.Contract(this.CONTRACTS.usdc, this.ABIS.erc20, this.signer);
            this.contracts.weth = new ethers.Contract(this.CONTRACTS.weth, this.ABIS.erc20, this.signer);
            this.contracts.accessController = new ethers.Contract(this.CONTRACTS.accessController, this.ABIS.accessController, this.provider);
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
            const [isManager, isKeeper] = await Promise.all([
                this.contracts.accessController.managers(this.userAddress),
                this.contracts.accessController.keepers(this.userAddress)
            ]);

            if (isManager) this.userRole = 'manager';
            if (isKeeper) this.userRole = 'keeper';

            return { isManager, isKeeper };
        } catch (error) {
            console.error('Error checking roles:', error);
            return { isManager: false, isKeeper: false };
        }
    }

    async getVaultInfo() {
        try {
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
                totalAssets: ethers.utils.formatUnits(totalAssets, decimals),
                totalSupply: ethers.utils.formatUnits(totalSupply, decimals),
                userShares: ethers.utils.formatUnits(userShares, decimals),
                userAssets: ethers.utils.formatUnits(userAssets, decimals),
                lastHarvest: lastHarvest > 0 ? new Date(Number(lastHarvest) * 1000).toLocaleString() : 'Never',
                minHarvestInterval: minHarvestInterval.toString(),
                depositCap: ethers.utils.formatUnits(depositCap, decimals),
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
            const strategiesLength = await this.contracts.vault.strategiesLength();
            const strategies = [];
            let totalAllocation = 0;

            for (let i = 0; i < strategiesLength; i++) {
                const strategyAddress = await this.contracts.vault.strategies(i);
                const allocation = await this.contracts.vault.targetBps(strategyAddress);
                const totalAssets = await this.contracts[strategyAddress === this.CONTRACTS.aaveStrategy ? 'aaveStrategy' : 'uniStrategy'].totalAssets();

                strategies.push({
                    address: strategyAddress,
                    allocation: Number(allocation) / 100,
                    totalAssets: ethers.utils.formatUnits(totalAssets, 6),
                    name: strategyAddress === this.CONTRACTS.aaveStrategy ? 'Aave V3' : 'Uniswap V3'
                });

                totalAllocation += Number(allocation);
            }

            // Get idle funds
            const vaultBalance = await this.contracts.usdc.balanceOf(this.CONTRACTS.vault);

            return {
                strategies,
                totalAllocation: totalAllocation / 100,
                idleFunds: ethers.utils.formatUnits(vaultBalance, 6)
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
            const amountWei = ethers.utils.parseUnits(amount, 6);

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
            const sharesWei = ethers.utils.parseUnits(shares, 6);

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
        if (this.userRole !== 'manager') {
            throw new Error('Only managers can invest idle funds');
        }

        try {
            console.log('Starting investIdle process...');
            
            // Get current idle amount
            const idleAmount = await this.contracts.usdc.balanceOf(this.CONTRACTS.vault);
            console.log('Idle amount in vault:', idleAmount.toString());
            
            if (idleAmount.eq(0)) {
                throw new Error('No idle funds to invest');
            }

            // Get strategy count to determine how many strategies we have
            const strategyCount = await this.contracts.vault.strategyCount();
            console.log('Strategy count:', strategyCount.toString());

            // Create swap data for Uniswap strategy
            const swapData = await this.createSwapDataForInvest(idleAmount);
            console.log('Created swap data:', swapData);

            // Prepare swap data array - one entry per strategy
            let allSwapData = [];
            
            if (strategyCount.eq(1)) {
                // Only one strategy (likely Uniswap)
                allSwapData = [swapData];
            } else if (strategyCount.eq(2)) {
                // Two strategies - assume first is Aave (no swap needed), second is Uniswap
                allSwapData = [[], swapData]; // Empty for Aave, swap data for Uniswap
            } else {
                // Fallback: just use swap data for the last strategy
                allSwapData = swapData;
            }

            console.log('Final swap data array:', allSwapData);

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
            
            // Calculate amount for Uniswap strategy (40% of total)
            const uniAmount = (totalIdleAmount * 40n) / 100n;
            const swapAmount = uniAmount / 2n; // Half will be swapped to WETH by the strategy

            console.log('Uni amount (total sent to strategy):', uniAmount.toString());
            console.log('Swap amount (USDC -> WETH):', swapAmount.toString());
            console.log('Note: Strategy receives full USDC amount, then swaps half to WETH internally');

            // Uniswap V3 Router address (SwapRouter02)
            const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
            const poolFee = 500; // 0.05% fee tier

            // Create SwapRouter02 interface
            const swapRouterABI = [
                "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
            ];
            const swapRouterInterface = new ethers.utils.Interface(swapRouterABI);

            // Get deadline (20 minutes from now)
            const deadline = Math.floor(Date.now() / 1000) + 1200;

            // Create exactInputSingle parameters
            const params = {
                tokenIn: this.CONTRACTS.usdc,
                tokenOut: this.CONTRACTS.weth,
                fee: poolFee,
                recipient: this.CONTRACTS.uniStrategy, // deliver WETH to the strategy
                deadline: deadline,
                amountIn: swapAmount,
                amountOutMinimum: 0, // for tests; in prod use a quoted minOut
                sqrtPriceLimitX96: 0
            };

            console.log('Swap params:', params);

            // Encode exactInputSingle call
            const routerCalldata = swapRouterInterface.encodeFunctionData("exactInputSingle", [params]);

            console.log('Router calldata:', routerCalldata);

            // Pack payload for ExchangeHandler.swap(bytes)
            // abi.encode(address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to, bytes routerCalldata)
            const abiCoder = ethers.utils.defaultAbiCoder;
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
                    this.CONTRACTS.usdc,
                    this.CONTRACTS.weth,
                    swapAmount,
                    0, // minOut
                    this.CONTRACTS.uniStrategy,
                    routerCalldata
                ]
            );

            console.log('Final payload:', payload);

            // Allow the router in ExchangeHandler
            await this.contracts.exchanger.setRouter(UNISWAP_V3_ROUTER, true);
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

            // Uniswap V3 Router address (SwapRouter02)
            const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
            const poolFee = 500; // 0.05% fee tier

            // Create SwapRouter02 interface
            const swapRouterABI = [
                "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
            ];
            const swapRouterInterface = new ethers.utils.Interface(swapRouterABI);

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
                amountOutMinimum: 0, // for tests; in prod use a quoted minOut
                sqrtPriceLimitX96: 0
            };

            console.log('Harvest swap params:', params);

            // Encode exactInputSingle call
            const routerCalldata = swapRouterInterface.encodeFunctionData("exactInputSingle", [params]);

            console.log('Harvest router calldata:', routerCalldata);

            // Pack payload for ExchangeHandler.swap(bytes)
            const abiCoder = ethers.utils.defaultAbiCoder;
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
            return ethers.utils.formatUnits(balance, decimals);
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
            return ethers.utils.formatUnits(allowance, decimals);
        } catch (error) {
            console.error('Error getting token allowance:', error);
            throw error;
        }
    }

    // Utility methods
    formatUnits(value, decimals = 6) {
        return ethers.utils.formatUnits(value, decimals);
    }

    parseUnits(value, decimals = 6) {
        return ethers.utils.parseUnits(value, decimals);
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
}

// Export for use in HTML
window.VaultIntegration = VaultIntegration;
