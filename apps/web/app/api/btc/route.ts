import { NextResponse } from "next/server";

const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";
const CACHE_TTL_MS = 5_000;
const STALE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 4_000;

type PriceCache = {
  price: number;
  fetchedAt: number;
  expiresAt: number;
};

let cache: PriceCache | null = null;

function nowMs() {
  return Date.now();
}

async function fetchBinancePrice() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(BINANCE_URL, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Binance HTTP ${res.status}`);
    }

    const data = (await res.json()) as { price?: string };
    const price = Number.parseFloat(data.price ?? "");
    if (!Number.isFinite(price)) {
      throw new Error("Invalid Binance price payload");
    }

    const fetchedAt = nowMs();
    cache = {
      price,
      fetchedAt,
      expiresAt: fetchedAt + CACHE_TTL_MS,
    };

    return { price, fetchedAt };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  if (symbol && symbol !== "BTC") {
    return NextResponse.json(
      { error: "Unsupported symbol. Only BTC is allowed." },
      { status: 400 },
    );
  }

  const now = nowMs();
  if (cache && now < cache.expiresAt) {
    return NextResponse.json({
      symbol: "BTC",
      currency: "USD",
      price: cache.price,
      source: "binance",
      cached: true,
      stale: false,
      fetchedAt: cache.fetchedAt,
    });
  }

  try {
    const { price, fetchedAt } = await fetchBinancePrice();
    return NextResponse.json({
      symbol: "BTC",
      currency: "USD",
      price,
      source: "binance",
      cached: false,
      stale: false,
      fetchedAt,
    });
  } catch (err) {
    if (cache && now - cache.fetchedAt <= STALE_TTL_MS) {
      return NextResponse.json({
        symbol: "BTC",
        currency: "USD",
        price: cache.price,
        source: "binance",
        cached: true,
        stale: true,
        fetchedAt: cache.fetchedAt,
        warning: err instanceof Error ? err.message : "Upstream error",
      });
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upstream error" },
      { status: 502 },
    );
  }
}
