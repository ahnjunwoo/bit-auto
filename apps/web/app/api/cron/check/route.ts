import { NextResponse } from "next/server";
import crypto from "node:crypto";

const COOLDOWN_MS = 10 * 60 * 1000;

type RiskResponse = {
  fundingRate: number;
  openInterest: number;
  risk?: { level?: string; reasons?: string[] };
};

const lastAlerts = new Map<string, number>();

function nowMs() {
  return Date.now();
}

function alertKey(level: string, reasons: string[]) {
  const raw = `${level}:${reasons.join("|")}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function parseNumber(value: unknown, label: string) {
  const n = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${label} value`);
  }
  return n;
}

export async function GET(request: Request) {
  try {
    const url = new URL("/api/market/btc-risk", request.url);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Risk API HTTP ${res.status}`);
    }

    const data = (await res.json()) as RiskResponse;
    const level = data.risk?.level;
    const reasons = data.risk?.reasons ?? [];
    if (!level || !Array.isArray(reasons)) {
      throw new Error("Invalid risk payload");
    }

    const fundingRate = parseNumber(data.fundingRate, "fundingRate");
    const openInterest = parseNumber(data.openInterest, "openInterest");

    let alerted = false;
    let lastAlertTs: number | undefined;

    if (level === "WARN" || level === "DANGER") {
      const key = alertKey(level, reasons);
      const last = lastAlerts.get(key);
      const now = nowMs();
      if (!last || now - last >= COOLDOWN_MS) {
        console.log(
          `[ALERT] level=${level} funding=${fundingRate} oi=${openInterest} reasons=${reasons.join(
            ";",
          )}`,
        );
        lastAlerts.set(key, now);
        alerted = true;
        lastAlertTs = now;
      } else {
        lastAlertTs = last;
      }
    }

    return NextResponse.json({
      ok: true,
      alerted,
      lastAlertTs,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 502 },
    );
  }
}
