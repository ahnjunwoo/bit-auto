import { NextResponse } from "next/server";

// README: Proxies BTCUSDT funding rate + open interest risk data from upstream API.

const UPSTREAM_BASE = process.env.RENDER_API_BASE;
const FETCH_TIMEOUT_MS = 4_000;

function assertUpstream() {
  if (!UPSTREAM_BASE) {
    throw new Error("Missing RENDER_API_BASE");
  }
}

function makeUpstreamUrl(path: string) {
  const base = UPSTREAM_BASE?.replace(/\/+$/, "") ?? "";
  return `${base}${path}`;
}

async function fetchUpstream(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Upstream HTTP ${res.status}: ${body}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  try {
    assertUpstream();
    const url = makeUpstreamUrl("/api/market/btc-risk");
    const json = await fetchUpstream(url);
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upstream error" },
      { status: 502 },
    );
  }
}
