import type { AnalysisResult } from "./analysis";
import {
  demoEnabled,
  getDemoAccount,
  getDemoPositions,
  getIncomeRecent,
  placeDemoTrade,
  type PlaceDemoResult,
} from "./binanceFuturesDemo";
import { getMeta, listOpenSignals, setMeta } from "./db";
import { resolveSignal } from "./tracker";
import { publishAnalysis } from "./telegram";

export type DemoOrderRecord = {
  signalId: number;
  symbol: string;
  side: "BUY" | "SELL";
  direction: "LONG" | "SHORT";
  qty: number;
  entryOrderId: string;
  entryPrice: number;
  slOrderId?: string;
  tpOrderId?: string;
  openedAt: string;
  status: "open" | "closed";
  realizedPnl?: number;
};

function demoKey(signalId: number) {
  return `demo_order_${signalId}`;
}

export async function saveDemoOrder(rec: DemoOrderRecord): Promise<void> {
  await setMeta(demoKey(rec.signalId), JSON.stringify(rec));
}

export async function loadDemoOrder(
  signalId: number
): Promise<DemoOrderRecord | null> {
  const raw = await getMeta(demoKey(signalId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DemoOrderRecord;
  } catch {
    return null;
  }
}

export async function executeDemoForAnalysis(
  a: AnalysisResult
): Promise<{ ok: boolean; detail: string; order?: PlaceDemoResult }> {
  if (!demoEnabled()) {
    return { ok: false, detail: "demo off" };
  }
  if (!a.signalId) return { ok: false, detail: "no signal id" };
  if (a.direction !== "LONG" && a.direction !== "SHORT") {
    return { ok: false, detail: "neutral skip" };
  }
  if (a.stopLoss == null || a.tp1 == null) {
    return { ok: false, detail: "missing SL/TP" };
  }

  // 1 position max par symbole
  const positions = await getDemoPositions();
  const symbol = a.symbol.replace("/", "").toUpperCase();
  if (positions.some((p) => p.symbol === symbol)) {
    return {
      ok: false,
      detail: `position déjà ouverte sur ${symbol}`,
    };
  }

  // TP2 si dispo, sinon TP1
  const tp = a.tp2 ?? a.tp1;
  const order = await placeDemoTrade({
    symbol,
    direction: a.direction,
    stopLoss: a.stopLoss,
    takeProfit: tp,
  });

  await saveDemoOrder({
    signalId: a.signalId,
    symbol: order.symbol,
    side: order.side,
    direction: a.direction,
    qty: order.qty,
    entryOrderId: order.entryOrderId,
    entryPrice: order.entryPrice,
    slOrderId: order.slOrderId,
    tpOrderId: order.tpOrderId,
    openedAt: new Date().toISOString(),
    status: "open",
  });

  return {
    ok: true,
    detail: `DEMO ${a.direction} ${order.symbol} qty=${order.qty} @ ${order.entryPrice}`,
    order,
  };
}

/**
 * Si plus de position sur le symbole → trade démo clos.
 * Approx PnL via income REALIZED_PNL récent.
 */
export async function syncDemoClosedTrades(opts?: {
  notify?: boolean;
}): Promise<{ closed: number; details: string[] }> {
  if (!demoEnabled()) return { closed: 0, details: [] };

  const notify = opts?.notify !== false;
  const positions = await getDemoPositions();
  const openSymbols = new Set(
    positions.map((p) => p.symbol.toUpperCase())
  );
  const openSignals = await listOpenSignals();
  const income = await getIncomeRecent(100);
  const details: string[] = [];
  let closed = 0;

  for (const signal of openSignals) {
    if (signal.direction !== "LONG" && signal.direction !== "SHORT") continue;
    const rec = await loadDemoOrder(signal.id);
    if (!rec || rec.status === "closed") continue;

    const stillOpen = openSymbols.has(rec.symbol.toUpperCase());
    if (stillOpen) continue;

    // Position disparue → chercher PnL récent sur ce symbole
    const openedMs = new Date(rec.openedAt).getTime();
    const hits = income
      .filter(
        (i) =>
          i.symbol.toUpperCase() === rec.symbol.toUpperCase() &&
          i.time >= openedMs - 5_000
      )
      .sort((a, b) => b.time - a.time);

    const pnl = hits.reduce((s, i) => s + i.income, 0);
    const risk = Math.abs(rec.entryPrice - (signal.stop_loss || rec.entryPrice));
    const rMultiple =
      risk > 0 && rec.qty > 0
        ? pnl / (risk * rec.qty)
        : pnl > 0
          ? 1
          : pnl < 0
            ? -1
            : 0;

    const event =
      pnl > 0 ? (Math.abs(rMultiple) >= 1.6 ? "tp2" : "tp1") : pnl < 0 ? "sl" : "closed";

    await resolveSignal(signal.id, event, Number(rMultiple.toFixed(3)));
    await saveDemoOrder({
      ...rec,
      status: "closed",
      realizedPnl: pnl,
    });

    closed += 1;
    const line = `DEMO CLOSE #${signal.id} ${rec.symbol} PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT (~${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(2)}R)`;
    details.push(line);

    if (notify) {
      await publishAnalysis(`💰 ${line}`, { dm: true });
    }
  }

  return { closed, details };
}

export async function demoStatusText(): Promise<string> {
  if (!demoEnabled()) {
    return [
      "Demo Binance: OFF",
      "",
      "Pour activer:",
      "1) Crée des clés sur https://demo.binance.com (Demo Trading API)",
      "2) Vercel env:",
      "   DEMO_EXECUTION=true",
      "   BINANCE_DEMO_API_KEY=...",
      "   BINANCE_DEMO_API_SECRET=...",
      "   DEMO_NOTIONAL_USDT=50",
      "   DEMO_LEVERAGE=5",
    ].join("\n");
  }

  try {
    const acc = await getDemoAccount();
    const positions = await getDemoPositions();
    const lines = [
      "Binance Futures DEMO",
      `Wallet : ${acc.walletBalance.toFixed(2)} USDT`,
      `Dispo  : ${acc.availableBalance.toFixed(2)} USDT`,
      `uPnL   : ${acc.unrealizedProfit >= 0 ? "+" : ""}${acc.unrealizedProfit.toFixed(2)} USDT`,
      "",
      positions.length
        ? "Positions:"
        : "Aucune position ouverte.",
      ...positions.map(
        (p) =>
          `• ${p.symbol} qty=${p.positionAmt} entry=${p.entryPrice} uPnL=${p.unrealizedProfit >= 0 ? "+" : ""}${p.unrealizedProfit.toFixed(2)} x${p.leverage}`
      ),
    ];
    return lines.join("\n");
  } catch (err) {
    return `Demo erreur: ${err instanceof Error ? err.message : "inconnu"}`;
  }
}
