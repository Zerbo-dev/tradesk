import { NextRequest, NextResponse } from "next/server";
import {
  availableBacktestPairs,
  runCryptoBacktest,
  runCryptoBacktestDeriv,
  fetchAndCacheDerivHistory,
  derivCacheStatus,
} from "@/lib/backtest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const source = req.nextUrl.searchParams.get("source") || "forex";
    const pair = req.nextUrl.searchParams.get("pair") || "EURUSD";
    const timeframe = req.nextUrl.searchParams.get("timeframe") || "1h";

    if (source === "deriv-status") {
      const status = await derivCacheStatus(pair, timeframe);
      return NextResponse.json({ ok: true, ...status });
    }

    const result =
      source === "deriv"
        ? await runCryptoBacktestDeriv(pair, timeframe)
        : runCryptoBacktest(pair, timeframe);

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
