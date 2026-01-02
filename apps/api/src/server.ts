import Fastify from "fastify";
import cors from "@fastify/cors";

const app = Fastify({ logger: true });

app.register(cors, { origin: true });

const CACHE_TTL_MS = 5000;
const PRICE_ENDPOINT =
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";
const FUNDING_ENDPOINT =
  "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT";
const OPEN_INTEREST_ENDPOINT =
  "https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT";
const UPBIT_ENDPOINT = "https://api.upbit.com/v1/ticker?markets=KRW-BTC";
const COINBASE_ENDPOINT = "https://api.coinbase.com/v2/prices/spot?currency=USD";
const FX_ENDPOINTS = [
  "https://api.exchangerate.host/latest?base=USD&symbols=KRW",
  "https://open.er-api.com/v6/latest/USD",
  "https://api.exchangerate-api.com/v4/latest/USD",
];

type PricePayload = {
  symbol: "BTC";
  currency: "USDT";
  price: number;
  source: "binance";
  cached: boolean;
  stale: boolean;
  fetchedAt: number;
};

type CacheState = {
  value: Omit<PricePayload, "cached" | "stale"> | null;
  fetchedAt: number;
  expiresAt: number;
};

const cache: CacheState = {
  value: null,
  fetchedAt: 0,
  expiresAt: 0,
};

type RiskLevel = "OK" | "WARN" | "DANGER";

type RiskPayload = {
  symbol: "BTCUSDT";
  fundingRate: number;
  openInterest: number;
  risk: { level: RiskLevel; reasons: string[] };
  source: "binance" | "cache" | "stale-cache";
  ts: number;
};

type RiskCacheState = {
  value: Omit<RiskPayload, "source" | "ts"> | null;
  fetchedAt: number;
  expiresAt: number;
  prevOpenInterest?: number;
};

const riskCache: RiskCacheState = {
  value: null,
  fetchedAt: 0,
  expiresAt: 0,
};

type PremiumPayload = {
  symbol: "BTC";
  kimchiPremium: number;
  coinbasePremium: number;
  source: "binance+upbit+coinbase";
  ts: number;
  cached: boolean;
  stale: boolean;
};

type PremiumCacheState = {
  value: Omit<PremiumPayload, "cached" | "stale" | "ts"> | null;
  fetchedAt: number;
  expiresAt: number;
};

const premiumCache: PremiumCacheState = {
  value: null,
  fetchedAt: 0,
  expiresAt: 0,
};

function parseNumber(value: unknown, label: string) {
  const n = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${label} value`);
  }
  return n;
}

function computeRisk(fundingRate: number, openInterest: number, prev?: number) {
  const reasons: string[] = [];
  const fundingWarn = Math.abs(fundingRate) >= 0.0005;
  if (fundingWarn) reasons.push("Funding rate is elevated");

  let oiWarn = false;
  if (typeof prev === "number" && prev > 0) {
    const change = (openInterest - prev) / prev;
    oiWarn = change >= 0.1;
    if (oiWarn) reasons.push("Open interest jumped >= 10%");
  }

  const level: RiskLevel =
    fundingWarn && oiWarn ? "DANGER" : fundingWarn || oiWarn ? "WARN" : "OK";

  return { level, reasons };
}

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upstream error ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchFxRate(): Promise<number> {
  let lastError: unknown = null;

  for (const url of FX_ENDPOINTS) {
    try {
      const json = await fetchJson(url);
      const rate = parseNumber(
        (json?.rates?.KRW ?? json?.rates?.krw) as unknown,
        "fx rate",
      );
      return rate;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("FX rate unavailable");
}

async function fetchBtcPrice(): Promise<PricePayload> {
  const now = Date.now();
  if (cache.value && now < cache.expiresAt) {
    return {
      ...cache.value,
      cached: true,
      stale: false,
      fetchedAt: cache.fetchedAt,
    };
  }

  try {
    const json: { price?: string } = await fetchJson(PRICE_ENDPOINT);
    const price = json.price ? Number(json.price) : NaN;

    if (!Number.isFinite(price)) {
      throw new Error("Unexpected upstream payload");
    }

    const fetchedAt = Date.now();
    const value = {
      symbol: "BTC" as const,
      currency: "USDT" as const,
      price,
      source: "binance" as const,
      fetchedAt,
    };

    cache.value = value;
    cache.fetchedAt = fetchedAt;
    cache.expiresAt = fetchedAt + CACHE_TTL_MS;

    return { ...value, cached: false, stale: false };
  } catch (error) {
    if (cache.value) {
      return {
        ...cache.value,
        cached: true,
        stale: true,
        fetchedAt: cache.fetchedAt,
      };
    }
    throw error;
  }
}

app.get("/api/btc", async (_request, reply) => {
  try {
    return await fetchBtcPrice();
  } catch (error) {
    app.log.error(error, "failed to fetch btc price");
    reply.code(502);
    return { error: "upstream_unavailable" };
  }
});

app.get("/api/market/btc-risk", async (_request, reply) => {
  const now = Date.now();
  if (riskCache.value && now < riskCache.expiresAt) {
    return {
      ...riskCache.value,
      source: "cache" as const,
      ts: riskCache.fetchedAt,
    };
  }

  try {
    const [fundingJson, oiJson] = await Promise.all([
      fetchJson(FUNDING_ENDPOINT),
      fetchJson(OPEN_INTEREST_ENDPOINT),
    ]);

    const fundingRate = parseNumber(fundingJson.lastFundingRate, "fundingRate");
    const openInterest = parseNumber(oiJson.openInterest, "openInterest");
    const prevOpenInterest = riskCache.value?.openInterest;
    const risk = computeRisk(fundingRate, openInterest, prevOpenInterest);

    const fetchedAt = Date.now();
    const value: Omit<RiskPayload, "source" | "ts"> = {
      symbol: "BTCUSDT",
      fundingRate,
      openInterest,
      risk,
    };

    riskCache.value = value;
    riskCache.fetchedAt = fetchedAt;
    riskCache.expiresAt = fetchedAt + CACHE_TTL_MS;
    riskCache.prevOpenInterest = prevOpenInterest;

    return { ...value, source: "binance" as const, ts: fetchedAt };
  } catch (error) {
    if (riskCache.value) {
      return {
        ...riskCache.value,
        source: "stale-cache" as const,
        ts: riskCache.fetchedAt,
      };
    }
    app.log.error(error, "failed to fetch btc risk");
    reply.code(502);
    return { error: "upstream_unavailable" };
  }
});

app.get("/api/market/premium", async (_request, reply) => {
  const now = Date.now();
  if (premiumCache.value && now < premiumCache.expiresAt) {
    return {
      ...premiumCache.value,
      cached: true,
      stale: false,
      ts: premiumCache.fetchedAt,
    };
  }

  try {
    const [upbitJson, binanceJson, coinbaseJson, usdKrw] = await Promise.all([
      fetchJson(UPBIT_ENDPOINT),
      fetchJson(PRICE_ENDPOINT),
      fetchJson(COINBASE_ENDPOINT),
      fetchFxRate(),
    ]);

    const upbitKrw = parseNumber(upbitJson?.[0]?.trade_price, "upbit price");
    const binanceUsd = parseNumber(binanceJson.price, "binance price");
    const coinbaseUsd = parseNumber(coinbaseJson.data?.amount, "coinbase price");

    const kimchiPremium = upbitKrw / (binanceUsd * usdKrw) - 1;
    const coinbasePremium = coinbaseUsd / binanceUsd - 1;

    const fetchedAt = Date.now();
    const value: Omit<PremiumPayload, "cached" | "stale" | "ts"> = {
      symbol: "BTC",
      kimchiPremium,
      coinbasePremium,
      source: "binance+upbit+coinbase",
    };

    premiumCache.value = value;
    premiumCache.fetchedAt = fetchedAt;
    premiumCache.expiresAt = fetchedAt + CACHE_TTL_MS;

    return { ...value, cached: false, stale: false, ts: fetchedAt };
  } catch (error) {
    if (premiumCache.value) {
      return {
        ...premiumCache.value,
        cached: true,
        stale: true,
        ts: premiumCache.fetchedAt,
      };
    }
    app.log.error(error, "failed to fetch premium data");
    reply.code(502);
    return { error: "upstream_unavailable" };
  }
});

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";

app.listen({ port, host }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
