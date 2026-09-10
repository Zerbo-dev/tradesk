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
  realizedR: number | null; // crypto: R réel ; smc: null (voir realizedPnl)
  realizedPnl: number | null;
  /** Meilleur prix atteint AVANT la clôture — calculé seulement pour les SL. */
  mfePrice: number | null;
  /** Ce même point converti en multiple de R — "ce que le TP aurait pu
   * rapporter si tu l'avais placé exactement là". */
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

/**
 * Combine les VRAIS ordres placés chez Deriv (bot crypto + sélecteur SMC),
 * pas de simulation. Pour chaque SL touché, va chercher l'historique de
 * prix réel (API publique Deriv, séparée de la session de trading) pour
 * calculer le point le plus favorable atteint avant la clôture.
 */
export async function listRealTradeHistory(days = 30): Promise<RealTrade[]> {
  const trades: RealTrade[] = [];

  // --- Bot crypto : signaux clos + ordre démo réel associé ---
  const closedSignals = await closedSignalsSince(days);
  for (const sig of closedSignals) {
    const order = await loadDemoOrder(sig.id);
    if (!order) continue; // pas d'ordre réel placé pour ce signal (démo off à l'époque)
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
  }

  // --- Sélecteur SMC : ordres stockés en base ---
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

  // MFE pour TOUS les SL de la période — par lots pour ne pas ouvrir
  // trop de connexions Deriv en simultané.
  const slTrades = trades.filter((t) => t.outcome === "SL" && t.stopLoss != null);
  const BATCH = 5;
  for (let i = 0; i < slTrades.length; i += BATCH) {
    const batch = slTrades.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (t) => {
        try {
          const mfe = await computeMfe(t);
          t.mfePrice = mfe.price;
          t.mfeR = mfe.r;
        } catch {
          // best-effort — un échec n'affecte pas les autres trades
        }
      })
    );
  }

  return trades;
}

async function computeMfe(t: RealTrade): Promise<{ price: number | null; r: number | null }> {
  if (!(t.pair in DERIV_SYMBOLS) || !t.closedAt || t.stopLoss == null) {
    return { price: null, r: null };
  }
  const from = Math.floor(new Date(t.openedAt).getTime() / 1000);
  const to = Math.floor(new Date(t.closedAt).getTime() / 1000) + 60;
  if (to <= from) return { price: null, r: null };

  const candles = await fetchDerivCandlesRange(t.pair, "1m", from, to);
  if (!candles.length) return { price: null, r: null };

  const risk = Math.abs(t.entryPrice - t.stopLoss);
  if (risk <= 0) return { price: null, r: null };

  let best = t.direction === "LONG" ? -Infinity : Infinity;
  for (const c of candles) {
    best = t.direction === "LONG" ? Math.max(best, c.high) : Math.min(best, c.low);
  }
  if (!Number.isFinite(best)) return { price: null, r: null };

  const r = Math.abs(best - t.entryPrice) / risk;
  return { price: best, r };
}
