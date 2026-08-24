import { NextRequest, NextResponse } from "next/server";
import { availableBacktestPairs, runCryptoBacktest } from "@/lib/backtest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const pair = req.nextUrl.searchParams.get("pair") || "EURUSD";
    const timeframe = req.nextUrl.searchParams.get("timeframe") || "1h";
    const result = runCryptoBacktest(pair, timeframe);
    return NextResponse.json({
      ok: true,
      pairs: availableBacktestPairs(),
      result: {
        ...result,
        trades: result.trades.slice(-100), // évite une réponse trop lourde
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "erreur" },
      { status: 500 }
    );
  }
}
