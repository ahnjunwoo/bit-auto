import { NextResponse } from "next/server";

// README: Returns BTCUSDT funding rate + open interest with simple risk scoring and TTL cache.

const FUNDING_URL =
  "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT";
const OPEN_INTEREST_URL =
  "https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT";
const CACHE_TTL_MS = 5_000;

type RiskLevel = "OK" | "WARN" | "DANGER";

type CacheEntry = {
  symbol: "BTCUSDT";
  fundingRate: number;
  openInterest: number;
  risk: { level: RiskLevel; reasons: string[] };
  source: "binance" | "cache" | "stale-cache";
  ts: number;
  expiresAt: number;
  prevOpenInterest?: number;
};

const cache = new Map<string, CacheEntry>();

function nowMs() {
  return Date.now();
}

function parseNumber(value: unknown, label: string) {
  const n = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${label} value`);
  }
  return n;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Binance HTTP ${res.status}`);
  }
  return res.json();
}

function computeRisk(fundingRate: number, openInterest: number, prev?: number) {
  const reasons: string[] = [];
  const fundingWarn = Math.abs(fundingRate) >= 0.0005;
  if (fundingWarn) reasons.push("Funding rate is elevated");

  let oiWarn = false;
  if (prev && prev > 0) {
    const change = (openInterest - prev) / prev;
    oiWarn = change >= 0.1;
    if (oiWarn) reasons.push("Open interest jumped >= 10%");
  }

  const level: RiskLevel =
    fundingWarn && oiWarn ? "DANGER" : fundingWarn || oiWarn ? "WARN" : "OK";

  return { level, reasons };
}

export async function GET() {
  const key = "BTCUSDT";
  const now = nowMs();
  const cached = cache.get(key);

  if (cached && now < cached.expiresAt) {
    return NextResponse.json({
      symbol: cached.symbol,
      fundingRate: cached.fundingRate,
      openInterest: cached.openInterest,
      risk: cached.risk,
      source: "cache",
      ts: cached.ts,
    });
  }

  try {
    const [funding, oi] = await Promise.all([
      fetchJson(FUNDING_URL),
      fetchJson(OPEN_INTEREST_URL),
    ]);

    const fundingRate = parseNumber(funding?.lastFundingRate, "fundingRate");
    const openInterest = parseNumber(oi?.openInterest, "openInterest");
    const prevOpenInterest = cached?.openInterest;
    const risk = computeRisk(fundingRate, openInterest, prevOpenInterest);

    const entry: CacheEntry = {
      symbol: "BTCUSDT",
      fundingRate,
      openInterest,
      risk,
      source: "binance",
      ts: now,
      expiresAt: now + CACHE_TTL_MS,
      prevOpenInterest,
    };
    cache.set(key, entry);

    return NextResponse.json({
      symbol: entry.symbol,
      fundingRate: entry.fundingRate,
      openInterest: entry.openInterest,
      risk: entry.risk,
      source: entry.source,
      ts: entry.ts,
    });
  } catch (err) {
    if (cached) {
      return NextResponse.json({
        symbol: cached.symbol,
        fundingRate: cached.fundingRate,
        openInterest: cached.openInterest,
        risk: cached.risk,
        source: "stale-cache",
        ts: cached.ts,
        error: err instanceof Error ? err.message : "Upstream error",
      });
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upstream error" },
      { status: 502 },
    );
  }
}
