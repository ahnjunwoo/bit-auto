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
    const res = await fetch(PRICE_ENDPOINT, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Upstream error ${res.status}: ${body}`);
    }

    const json: { price?: string } = await res.json();
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
    const [fundingRes, oiRes] = await Promise.all([
      fetch(FUNDING_ENDPOINT, { headers: { Accept: "application/json" } }),
      fetch(OPEN_INTEREST_ENDPOINT, { headers: { Accept: "application/json" } }),
    ]);

    if (!fundingRes.ok) {
      const body = await fundingRes.text();
      throw new Error(`Upstream error ${fundingRes.status}: ${body}`);
    }
    if (!oiRes.ok) {
      const body = await oiRes.text();
      throw new Error(`Upstream error ${oiRes.status}: ${body}`);
    }

    const fundingJson: { lastFundingRate?: string } = await fundingRes.json();
    const oiJson: { openInterest?: string } = await oiRes.json();

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

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";

app.listen({ port, host }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
