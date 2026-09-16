import { NextRequest, NextResponse } from "next/server";
import {
  availableBacktestPairs,
  runCryptoBacktest,
  runCryptoBacktestDeriv,
  fetchAndCacheDerivHistory,
  derivCacheStatus,
  type BacktestOverrides,
} from "@/lib/backtest";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseOverrides(sp: URLSearchParams): BacktestOverrides {
  const num = (key: string) => {
    const v = sp.get(key);
    return v !== null && v !== "" ? Number(v) : undefined;
  };
  return {
    minConfidence: num("minConfidence"),
    maxTradesPerDay: num("maxTradesPerDay"),
    cooldownMinutes: num("cooldownMinutes"),
    pauseAfterLossStreak: num("pauseAfterLossStreak"),
    pauseHours: num("pauseHours"),
    window: num("window"),
    useTp2: sp.get("useTp2") === "1",
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const source = sp.get("source") || "forex";
    const pair = sp.get("pair") || "EURUSD";
    const timeframe = sp.get("timeframe") || "1h";

    if (source === "deriv-status") {
      const status = await derivCacheStatus(pair, timeframe);
      return NextResponse.json({ ok: true, ...status });
    }

    const overrides = parseOverrides(sp);
    const result =
      source === "deriv"
        ? await runCryptoBacktestDeriv(pair, timeframe, overrides)
        : await runCryptoBacktest(pair, timeframe, overrides);

    return NextResponse.json({
      ok: true,
      pairs: source === "deriv" ? ["BTCUSDT", "ETHUSDT", "SOLUSDT"] : availableBacktestPairs(),
      result: { ...result, trades: result.trades.slice(-100) },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "erreur" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { pair: string; timeframe: string; days?: number };
    const res = await fetchAndCacheDerivHistory(body.pair, body.timeframe, body.days ?? 180);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "erreur" },
      { status: 500 }
    );
  }
}
