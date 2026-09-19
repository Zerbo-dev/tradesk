import { closedSignalsSince, getMeta } from "./db";
import { loadDemoOrder } from "./demoExecutor";
import { fetchDerivCandlesRange, DERIV_SYMBOLS } from "./feeds/deriv";

export type RealTrade = {
  source: "crypto" | "smc";
  id: string;
  pair: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: string;
  closedAt: string | null;
  outcome: "TP" | "SL" | "OPEN" | "UNKNOWN";
  realizedR: number | null;
  realizedPnl: number | null;
  mfePrice: number | null;
  mfeR: number | null;
};

type SmcOrderRaw = {
  fingerprint: string;
  pair: "XAUUSD" | "V100";
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: string;
  closedAt?: string;
  status: "open" | "closed";
  realizedPnl?: number;
};

const TIME_BUDGET_MS = 45_000;
const MAX_MFE_PAIRS = 20;

export async function listRealTradeHistory(days = 30): Promise<RealTrade[]> {
  const startedAt = Date.now();
  const trades: RealTrade[] = [];

  const closedSignals = await closedSignalsSince(days);
  const cryptoOrders = await Promise.all(
    closedSignals.map((sig) => loadDemoOrder(sig.id).catch(() => null))
  );
  closedSignals.forEach((sig, i) => {
    const order = cryptoOrders[i];
    if (!order) return;
    const outcome: RealTrade["outcome"] =
      sig.result_r == null ? "UNKNOWN" : sig.result_r > 0 ? "TP" : sig.result_r < 0 ? "SL" : "UNKNOWN";
    trades.push({
      source: "crypto",
      id: `crypto_${sig.id}`,
      pair: sig.pair.replace("/", "").toUpperCase(),
      direction: sig.direction === "LONG" ? "LONG" : "SHORT",
      entryPrice: order.entryPrice,
      stopLoss: sig.stop_loss,
      takeProfit: sig.tp1,
      openedAt: order.openedAt,
      closedAt: sig.closed_at,
      outcome,
      realizedR: sig.result_r,
      realizedPnl: order.realizedPnl ?? null,
      mfePrice: null,
      mfeR: null,
    });
  });

  const raw = await getMeta("smc_selector_demo_orders_v1");
  if (raw) {
    try {
      const orders = JSON.parse(raw) as SmcOrderRaw[];
      for (const o of orders) {
        if (o.status !== "closed") continue;
        const outcome: RealTrade["outcome"] =
          o.realizedPnl == null ? "UNKNOWN" : o.realizedPnl > 0 ? "TP" : o.realizedPnl < 0 ? "SL" : "UNKNOWN";
        trades.push({
          source: "smc",
          id: `smc_${o.fingerprint}`,
          pair: o.pair,
          direction: o.direction === "BUY" ? "LONG" : "SHORT",
          entryPrice: o.entryPrice,
          stopLoss: o.stopLoss,
          takeProfit: o.takeProfit,
          openedAt: o.openedAt,
          closedAt: o.closedAt || null,
          outcome,
          realizedR: null,
          realizedPnl: o.realizedPnl ?? null,
          mfePrice: null,
          mfeR: null,
        });
      }
    } catch {
      // best-effort
    }
  }

  trades.sort(
    (a, b) =>
      new Date(b.closedAt || b.openedAt).getTime() - new Date(a.closedAt || a.openedAt).getTime()
  );

  await attachMfe(trades, startedAt);

  return trades;
}

/**
 * Une seule requête Deriv PAR PAIRE (pas une par trade) : on télécharge
 * la période complète couvrant tous les SL de cette paire, puis on
 * découpe localement chaque sous-intervalle dans les données déjà en
 * mémoire. Gros gain de temps quand plusieurs trades SL se suivent sur
 * la même paire.
 */
async function attachMfe(trades: RealTrade[], startedAt: number): Promise<void> {
  const slTrades = trades.filter(
    (t) => t.outcome === "SL" && t.stopLoss != null && t.closedAt && t.pair in DERIV_SYMBOLS
  );
  if (!slTrades.length) return;

  const byPair = new Map<string, RealTrade[]>();
  for (const t of slTrades) {
    if (!byPair.has(t.pair)) byPair.set(t.pair, []);
    byPair.get(t.pair)!.push(t);
  }

  let pairsProcessed = 0;
  for (const [pair, list] of byPair) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    if (pairsProcessed >= MAX_MFE_PAIRS) break;
    pairsProcessed++;

    const from = Math.min(...list.map((t) => new Date(t.openedAt).getTime())) / 1000;
    const to = Math.max(...list.map((t) => new Date(t.closedAt!).getTime())) / 1000 + 60;

    try {
      const candles = await fetchDerivCandlesRange(pair, "1m", Math.floor(from), Math.ceil(to));
      if (!candles.length) continue;

      for (const t of list) {
        const tFrom = new Date(t.openedAt).getTime() / 1000;
        const tTo = new Date(t.closedAt!).getTime() / 1000 + 60;
        const window = candles.filter((c) => c.openTime / 1000 >= tFrom && c.openTime / 1000 <= tTo);
        if (!window.length || t.stopLoss == null) continue;

        const risk = Math.abs(t.entryPrice - t.stopLoss);
        if (risk <= 0) continue;

        let best = t.direction === "LONG" ? -Infinity : Infinity;
        for (const c of window) {
          best = t.direction === "LONG" ? Math.max(best, c.high) : Math.min(best, c.low);
        }
        if (!Number.isFinite(best)) continue;

        t.mfePrice = best;
        t.mfeR = Math.abs(best - t.entryPrice) / risk;
      }
    } catch {
      // best-effort
    }
  }
}
