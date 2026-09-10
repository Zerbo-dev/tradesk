import { NextRequest, NextResponse } from "next/server";
import { listRealTradeHistory } from "@/lib/tradeHistory";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const days = Number(req.nextUrl.searchParams.get("days") || 30);
    const trades = await listRealTradeHistory(days);
    const closed = trades.filter((t) => t.outcome === "TP" || t.outcome === "SL");
    const wins = closed.filter((t) => t.outcome === "TP").length;

    // R uniquement pour les trades qui en ont un (crypto) — la somme
    // reste donc partielle si des trades SMC (PnL $) sont mélangés.
    const withR = closed.filter((t) => t.realizedR != null);
    const sumR = withR.reduce((s, t) => s + (t.realizedR ?? 0), 0);

    return NextResponse.json({
      ok: true,
      trades,
      stats: {
        total: closed.length,
        winrate: closed.length ? wins / closed.length : null,
        sumR,
        avgR: withR.length ? sumR / withR.length : 0,
        tradesWithR: withR.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "erreur" },
      { status: 500 }
    );
  }
}
