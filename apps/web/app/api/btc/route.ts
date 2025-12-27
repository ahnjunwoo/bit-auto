import { NextResponse } from "next/server";

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

export async function GET(request: Request) {
  try {
    assertUpstream();
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const url = makeUpstreamUrl(`/api/btc${symbol ? `?symbol=${symbol}` : ""}`);
    const json = await fetchUpstream(url);
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upstream error" },
      { status: 502 },
    );
  }
}
