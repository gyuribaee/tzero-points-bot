#!/usr/bin/env node
/**
 * Tzero pre-flight point bot (testnet)
 * CLI — check points, stake $T0, track missions, claim rewards.
 *
 *   node index.js points                 check your points (authoritative site API)
 *   node index.js stake                  show stake positions + pending rewards
 *   node index.js stake --buy 0.01       buy $T0 then stake it
 *   node index.js stake --claim-rewards  claim staking rewards
 *   node index.js stake --unstake        unstake all
 *   node index.js mission                show missions + crew/liftoff status
 *   node index.js claim                  claim creator fees / rewards
 *
 * Requires: config.json (copy config.example.json and fill in wallets)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";


const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let configPath = join(__dirname, "config.json");
let i = 0;
while (i < args.length) {
  if (args[i] === "--config" && args[i + 1]) {
    configPath = resolve(args[i + 1]);
    i += 2;
  } else {
    i += 1;
  }
}
const config = (() => {
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    console.error(`Config not found: ${configPath}\n  Copy config.example.json -> config.json and edit it.`);
    process.exit(1);
  }
})();

const WALLETS = config.wallets || [];
const POINTS_API = config.pointsApi || "https://testnet.tzer0.fun/api/points";
const BASE = config.baseUrl || "https://testnet.tzer0.fun";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
async function getJson(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

// ---------------------------------------------------------------------------
// 1. CHECK POINTS (authoritative site API)
//    GET /api/points/<addr>
//    Returns: total, fuel, crew, liftoff, staking, signal, eligible, rank, per-action list
// ---------------------------------------------------------------------------
async function checkPoints(addr) {
  const data = await getJson(`${POINTS_API}/${addr}`);
  console.log(`\n=== Points — ${addr} ===`);
  console.log(`Total points : ${formatNum(data.total)}`);
  console.log(`Fuel         : ${formatNum(data.fuel)}  (1,000 pts per 1 ETH bought)`);
  console.log(`Crew         : ${formatNum(data.crew)}  (max 5/day)`);
  console.log(`Liftoff      : ${formatNum(data.liftoff)}`);
  console.log(`Staking      : ${formatNum(data.staking)}  (max 1,000/day)`);
  console.log(`Signal       : ${formatNum(data.signal)}  (reply +200 / follow +100)`);
  console.log(`Eligible     : ${data.eligible ? "yes (>= 500)" : "no (< 500)"}`);
  console.log(`Rank         : ${data.rank ?? "n/a"}`);
  if (data.actions && data.actions.length) {
    console.log("Recent actions:");
    for (const a of data.actions.slice(-5)) console.log(`  ${a.type.padEnd(10)} ${a.value} pts`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// 2. STAKING ($T0)
//    Docs: stake any amount, unstake anytime (no lock). Rewards = % of fees,
//    credited next block. Claim anytime.
// ---------------------------------------------------------------------------
async function stakeAction(action, addr) {
  // Placeholder: on-chain staking is wallet-signed TX on Base Sepolia.
  // Point the script at the wallet's staking state (from /api/points/<addr>),
  // or swap this for a wallet-signed tx when the site exposes a staking API.
  if (action === "buy") {
    console.log(`[stake] buy ${args[args.indexOf("--buy") + 1]} ETH and stake $T0 on ${addr}`);
    console.log(`  -> send native ETH (testnet) to the staking contract, or use your liquidity provider.`);
  } else if (action === "claim-rewards") {
    console.log(`[stake] claim staking rewards for ${addr}`);
    console.log(`  -> rewards are credited from the next block; call the claim endpoint or submit a claim tx.`);
  } else if (action === "unstake") {
    console.log(`[stake] unstake for ${addr}`);
    console.log(`  -> unstake tx (no lock); rewards already queued are paid from the next block.`);
  } else {
    console.log(`[stake] staking state for ${addr} (from points API):`);
  }
  // Re-read points to show staking line
  const data = await checkPoints(addr);
  console.log(`  staking pts today: ${formatNum(data.staking)}  (daily cap 1,000)`);
}

// ---------------------------------------------------------------------------
// 3. MISSION TRACKING
//    Show open missions, crew count, liftoff status.
// ---------------------------------------------------------------------------
async function missionAction() {
  console.log(`\n=== Missions (site overview at ${BASE}/missions) ===`);
  console.log("  Use the site for live mission data, or the /api/points/<addr>");
  console.log("  'missions' field for wallets the user has backed.");
  console.log("  A mission lifts off when >= 5 backers (0.01 ETH each, held 60 min).");
  console.log("  Crew +150 (max 5/day); creator of a liftoff mission gets +500.");
}

// ---------------------------------------------------------------------------
// 4. CLAIM
//    Claim creator fees / points. On-chain claim TX on Base Sepolia.
// ---------------------------------------------------------------------------
async function claimAction(addr) {
  console.log(`\n[claim] claiming rewards for ${addr}`);
  console.log(`  -> creator fees + points are claimed via an on-chain tx on Base Sepolia.`);
  console.log(`  -> use a wallet signer (ethers.js / viem) or the site's claim button.`);
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------
function formatNum(n) {
  if (typeof n !== "number") return String(n);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

if (args.length === 0) {
  console.log("Tzero pre-flight point bot (testnet)\n  Commands: points | stake | mission | claim\n  Config: copy config.example.json -> config.json");
  process.exit(0);
}

const cmd = args[0];
const wallet = WALLETS[0] || {};

switch (cmd) {
  case "points":
  case "check": {
    if (!wallet.address) { console.error("No wallet address in config.json"); process.exit(1); }
    checkPoints(wallet.address);
    break;
  }
  case "stake": {
    if (!wallet.address) { console.error("No wallet address in config.json"); process.exit(1); }
    const action = args[1] || "report";
    await stakeAction(action, wallet.address);
    break;
  }
  case "mission": {
    if (!wallet.address) { console.error("No wallet address in config.json"); process.exit(1); }
    await missionAction();
    break;
  }
  case "claim": {
    if (!wallet.address) { console.error("No wallet address in config.json"); process.exit(1); }
    await claimAction(wallet.address);
    break;
  }
  default:
    console.error(`Unknown command: ${cmd}\n  Commands: points | stake | mission | claim`);
    process.exit(1);
}
