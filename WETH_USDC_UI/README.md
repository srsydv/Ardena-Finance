# Shrish Finance - DeFi Vault Frontend

A comprehensive web interface for managing your DeFi vault operations including deposits, withdrawals, strategy management, and harvesting.

## 🚀 Quick Start

### 1. Setup

1. **Clone/Download** the project files
2. **Install dependencies** (if using Node.js server):
   ```bash
   npm install -g http-server
   ```

### 2. Configuration

1. **Get 0x API Key**:
   - Visit [0x.org](https://0x.org/docs/api#introduction)
   - Sign up and get your API key
   - Update `config.js`:
   ```javascript
   ZEROX_API_KEY: "your_actual_api_key_here"
   ```

2. **Network Setup**:
   - Install [MetaMask](https://metamask.io/)
   - Add Sepolia testnet:
     - Network Name: `Sepolia`
     - RPC URL: `https://rpc.sepolia.org`
     - Chain ID: `11155111`
     - Currency Symbol: `ETH`
     - Block Explorer: `https://sepolia.etherscan.io`

### 3. Get Test Tokens

1. **Get Sepolia ETH**:
   - Visit [sepoliafaucet.com](https://sepoliafaucet.com)
   - Request test ETH

2. **Get Test USDC**:
   - Visit [faucet.quicknode.com](https://faucet.quicknode.com/ethereum/sepolia-faucet)
   - Request test USDC

### 4. Run the Application

**Option A: Python Server**
```bash
cd UI
python3 -m http.server 8000
```
Visit: `http://localhost:8000`

**Option B: Node.js Server**
```bash
cd UI
npx http-server -p 3000
```
Visit: `http://localhost:3000`

**Option C: VS Code Live Server**
- Install "Live Server" extension
- Right-click `index.html` → "Open with Live Server"

## 🎯 Features

### 👤 User Features
- **Deposit USDC** into the vault
- **Withdraw shares** from the vault
- **View vault information** (total assets, user shares, etc.)
- **Real-time updates** every 30 seconds

### 🎯 Manager Features
- **Invest idle funds** across strategies
- **Set strategy allocations** (Aave 60%, Uniswap 40%)
- **Configure harvest intervals**
- **Monitor strategy performance**

### ⚡ Keeper Features
- **Harvest all strategies** to collect profits
- **Monitor harvest cooldowns**
- **View fee collection status**

## 📋 Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| Vault | `0xD995048010d777185e70bBe8FD48Ca2d0eF741a0` |
| USDC | `0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8` |
| Aave Strategy | `0xCc02bC41a7AF1A35af4935346cABC7335167EdC9` |
| Uniswap Strategy | `0xA87bFB6973b92685C66D2BDc37A670Ee995a4C3B` |
| Access Controller | `0xF1faF9Cf5c7B3bf88cB844A98D110Cef903a9Df2` |

## 🔧 Technical Details

### Architecture
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Web3**: Ethers.js v5.7.2
- **Integration**: Custom VaultIntegration class
- **API**: 0x Protocol for swap quotes

### Key Components
- `index.html` - Main UI interface
- `integration.js` - Web3 integration logic
- `config.js` - Configuration settings

### Integration Features
- **Automatic role detection** (User/Manager/Keeper)
- **Real-time vault data** fetching
- **0x API integration** for swap quotes
- **Comprehensive error handling**
- **Transaction status tracking**

## 🛠 Troubleshooting

### Common Issues

1. **"MetaMask not installed"**
   - Install MetaMask browser extension
   - Refresh the page

2. **"Transaction failed"**
   - Ensure you have enough ETH for gas fees
   - Check if you're on Sepolia testnet
   - Verify contract addresses are correct

3. **"Insufficient USDC balance"**
   - Get test USDC from faucets
   - Check USDC contract address

4. **"Only managers can..."**
   - Your wallet needs manager role
   - Contact vault owner for role assignment

5. **"0x API error"**
   - Verify API key in `config.js`
   - Check network connectivity

### Debug Mode
Open browser console (F12) to see detailed logs and error messages.

## 📚 API Reference

### VaultIntegration Methods

```javascript
// Initialize connection
await vaultIntegration.initialize();

// Get vault information
const vaultInfo = await vaultIntegration.getVaultInfo();

// Deposit USDC
const result = await vaultIntegration.deposit("1000");

// Withdraw shares
const result = await vaultIntegration.withdraw("500");

// Invest idle funds (Manager only)
const result = await vaultIntegration.investIdle();

// Harvest strategies (Keeper only)
const result = await vaultIntegration.harvestAll();

// Set strategy allocation (Manager only)
const result = await vaultIntegration.setStrategy(strategyAddress, allocationBps);
```

## 🔒 Security Notes

- **Testnet Only**: This interface is configured for Sepolia testnet
- **Private Keys**: Never share your MetaMask seed phrase
- **API Keys**: Keep your 0x API key secure
- **Smart Contracts**: Verify contract addresses before use

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Verify network and contract configurations
4. Ensure you have the latest MetaMask version

## 🎉 Success!

Once everything is set up, you should be able to:
- Connect your wallet
- See your role (User/Manager/Keeper)
- Interact with the vault based on your permissions
- Monitor real-time vault performance

Happy vaulting! 🏦✨
