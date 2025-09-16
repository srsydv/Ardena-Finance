// relayer.js
// Reads swapdata.json and submits to a Vault contract method (investIdle, harvestAll, etc).
// Requires PRIVATE_KEY in .env for the signer. Minimal logic—replace with Gelato/Defender later.

require("dotenv").config();
const fs = require("fs-extra");
const { ethers } = require("ethers");

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const GAS_LIMIT = process.env.GAS_LIMIT ? Number(process.env.GAS_LIMIT) : 8_000_000;

if (!PRIVATE_KEY) {
  console.warn("Warning: PRIVATE_KEY not set in .env — relayer cannot sign txs.");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;

/**
 * Read JSON file and parse
 */
function loadJson(path) {
  if (!fs.existsSync(path)) throw new Error("file not found: " + path);
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

/**
 * Submit data to Vault.method (methodName: investIdle or harvestAll)
 * vaultAbi: array or path to abi json (if string, loads file)
 */
async function submitToVault({ vaultAddress, vaultAbi, methodName, swapdataPath }) {
  if (!wallet) throw new Error("No signer configured (set PRIVATE_KEY in .env)");
  if (!fs.existsSync(swapdataPath)) throw new Error("swapdata file not found: " + swapdataPath);

  const abi = Array.isArray(vaultAbi) ? vaultAbi : JSON.parse(fs.readFileSync(vaultAbi, "utf8"));
  const contract = new ethers.Contract(vaultAddress, abi, wallet);
  const allSwapData = loadJson(swapdataPath);

  console.log(`Submitting ${methodName} to ${vaultAddress} with signer ${wallet.address}`);
  const tx = await contract[methodName](allSwapData, { gasLimit: GAS_LIMIT });
  console.log("tx.hash", tx.hash);
  const receipt = await tx.wait();
  console.log("Mined in block", receipt.blockNumber, "gasUsed", receipt.gasUsed.toString());
  return receipt;
}

/* ----------------- CLI ----------------- */
async function mainCli() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === "help") {
    console.log("relayer.js usage:");
    console.log(" node relayer.js send <vaultAbi.json> <vaultAddress> <method> <swapdata.json>");
    console.log(" method: investIdle | harvestAll | rebalance (or any vault method that accepts bytes[][])");
    process.exit(0);
  }

  if (cmd === "send") {
    const abiPath = argv[1];
    const vaultAddr = argv[2];
    const method = argv[3];
    const swapdata = argv[4];
    if (!abiPath || !vaultAddr || !method || !swapdata) {
      console.error("Usage: node relayer.js send <vaultAbi.json> <vaultAddress> <method> <swapdata.json>");
      process.exit(1);
    }
    try {
      await submitToVault({ vaultAddress: vaultAddr, vaultAbi: abiPath, methodName: method, swapdataPath: swapdata });
      process.exit(0);
    } catch (e) {
      console.error("relayer error:", e);
      process.exit(1);
    }
  }

  console.error("Unknown command");
  process.exit(1);
}

if (require.main === module) {
  mainCli();
}

module.exports = { submitToVault };
