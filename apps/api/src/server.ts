import Fastify from "fastify";
import cors from "@fastify/cors";

const app = Fastify({ logger: true });

app.register(cors, { origin: true });

const CACHE_TTL_MS = 5000;
const PRICE_ENDPOINT =
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";

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

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

app.listen({ port, host }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
