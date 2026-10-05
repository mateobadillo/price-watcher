// Price watcher: every 30 min from 06:00 to 22:00 (Bogotá), push each watched coin's price vs your buy price to ntfy.
// No dependencies: Node 20 fetch. Prices from DexScreener (keyless). Run by .github/workflows/watch.yml.
//
//   node watch.mjs              normal run (skips outside the hours)
//   DRY_RUN=1 node watch.mjs    print the message instead of sending it
//   FORCE=1 node watch.mjs      ignore the hours (manual test)
import { readFile } from "node:fs/promises";

const TZ = process.env.WATCH_TZ || "America/Bogota";
const START_H = 6; // 06:00
const END_H = 22; // up to and including 22:00
const TOPIC = process.env.NTFY_TOPIC;
const DRY = process.env.DRY_RUN === "1";
const FORCE = process.env.FORCE === "1";

/** local time in TZ as minutes since midnight */
function localMinutes(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour").value);
  const m = Number(parts.find((p) => p.type === "minute").value);
  return h * 60 + m;
}

/** most liquid DexScreener pair for the token: price, 1h and 24h change */
async function price(chain, address) {
  const r = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${address}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`DexScreener HTTP ${r.status}`);
  const pairs = await r.json();
  if (!Array.isArray(pairs) || !pairs.length) throw new Error("no trading pair found");
  const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  return { price: Number(best.priceUsd), h1: best.priceChange?.h1 ?? null, h24: best.priceChange?.h24 ?? null, liq: best.liquidity?.usd ?? null };
}

const fmtP = (p) => (p >= 1 ? p.toFixed(3) : p.toPrecision(4));
const pct = (x) => (x === null || x === undefined ? "–" : `${x >= 0 ? "+" : ""}${Number(x).toFixed(1)}%`);

async function main() {
  const mins = localMinutes();
  if (!FORCE && (mins < START_H * 60 || mins > END_H * 60)) {
    console.log(`Outside ${START_H}:00–${END_H}:00 ${TZ} (now ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}), nothing sent.`);
    return;
  }
  const list = JSON.parse(await readFile(new URL("./watchlist.json", import.meta.url), "utf8")).filter((c) => c.active !== false);
  if (!list.length) {
    console.log("watchlist.json has no active coins, nothing sent.");
    return;
  }

  const lines = [];
  let urgent = false;
  for (const c of list) {
    try {
      const q = await price(c.chain, c.address);
      const vs = c.buyPrice ? (q.price / c.buyPrice - 1) * 100 : null;
      if (vs !== null && (vs >= 100 || vs <= -50)) urgent = true;
      const value = c.investedUsd && c.buyPrice ? ` · ≈$${Math.round((c.investedUsd * q.price) / c.buyPrice)}` : "";
      lines.push(`${c.symbol} $${fmtP(q.price)} · ${pct(vs)} vs buy $${fmtP(c.buyPrice)}${value} · 1h ${pct(q.h1)} · 24h ${pct(q.h24)}`);
    } catch (e) {
      lines.push(`${c.symbol}: price unavailable (${e.message})`);
    }
  }

  const body = lines.join("\n");
  const title = `Price watch · ${list.length} coin${list.length > 1 ? "s" : ""}`;
  if (DRY || !TOPIC) {
    console.log(`${DRY ? "DRY RUN" : "NTFY_TOPIC not set"}, would send:\n${title}\n${body}`);
    return;
  }
  const r = await fetch(`https://ntfy.sh/${TOPIC}`, {
    method: "POST",
    body,
    // +100% or −50% vs your buy price gets a louder notification
    headers: { Title: title, Priority: urgent ? "high" : "default", Tags: urgent ? "rotating_light" : "chart_with_upwards_trend" },
  });
  if (!r.ok) throw new Error(`ntfy HTTP ${r.status}`);
  console.log(`Sent:\n${body}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
