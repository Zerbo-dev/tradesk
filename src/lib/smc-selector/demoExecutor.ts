import { getMeta, setMeta } from "../db";
import {
  demoEnabled,
  getContractProfit,
  getDemoPositions,
  getIncomeRecent,
  isRealTradingActive,
  placeDemoTrade,
} from "../demo";
import { publishSmcSignal } from "../telegram";
import { getSettings } from "../settings";
import type { ScoredSetup } from "./types";

/**
 * Suivi des ordres démo du SÉLECTEUR SMC, complètement isolé du bot
 * crypto (qui garde ses positions dans la table `signals` + tracker.ts)
 * et du bot SMC classique (qui n'exécute rien). Une seule clé meta,
 * volume attendu très faible (max 6 setups/jour).
 */
const ORDERS_KEY = "smc_selector_demo_orders_v1";
const MAX_CLOSED_HISTORY_DAYS = 14;

type SelectorDemoOrder = {
  fingerprint: string;
  pair: "XAUUSD" | "V100";
  direction: "BUY" | "SELL";
  qty: number;
  entryOrderId: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: string;
  status: "open" | "closed";
  realizedPnl?: number;
  closedAt?: string;
};

async function loadOrders(): Promise<SelectorDemoOrder[]> {
  const raw = await getMeta(ORDERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SelectorDemoOrder[];
  } catch {
    return [];
  }
}

async function saveOrders(orders: SelectorDemoOrder[]): Promise<void> {
  const cutoff = Date.now() - MAX_CLOSED_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const pruned = orders.filter(
    (o) => o.status === "open" || (o.closedAt && new Date(o.closedAt).getTime() > cutoff)
  );
  await setMeta(ORDERS_KEY, JSON.stringify(pruned));
}

/**
 * Ouvre un trade démo pour un setup publié par le sélecteur.
 * 1 position démo max par paire (XAUUSD, V100), comme pour le bot crypto.
 */
export async function executeDemoForSetup(
  setup: ScoredSetup
): Promise<{ ok: boolean; detail: string }> {
  if (!(await demoEnabled())) return { ok: false, detail: "demo off" };

  const { signal, pair } = setup;

  const settings = await getSettings();
  if (settings.demoOnePositionPerSymbol) {
    const positions = await getDemoPositions();
    if (positions.some((p) => p.symbol.toUpperCase() === pair)) {
      return { ok: false, detail: `position démo déjà ouverte sur ${pair}` };
    }
  }

  const direction = signal.direction === "BUY" ? "LONG" : "SHORT";
  const takeProfit = signal.tp2 ?? signal.tp1;

  try {
    const order = await placeDemoTrade({
      symbol: pair,
      direction,
      stopLoss: signal.stopLoss,
      takeProfit,
    });

    const orders = await loadOrders();
    orders.push({
      fingerprint: signal.fingerprint,
      pair,
      direction: signal.direction,
      qty: order.qty,
      entryOrderId: order.entryOrderId,
      entryPrice: order.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit,
      openedAt: new Date().toISOString(),
      status: "open",
    });
    await saveOrders(orders);

    return {
      ok: true,
      detail: `${(await isRealTradingActive()) ? "🔴 RÉEL" : "DEMO"} ${signal.direction} ${pair} qty=${order.qty} @ ${order.entryPrice}`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: `échec ouverture démo ${pair}: ${err instanceof Error ? err.message : "erreur"}`,
    };
  }
}

/**
 * Détecte les positions démo du sélecteur qui ont disparu (SL/TP touché)
 * et publie un recap dans le canal SMC. Ne touche jamais aux positions
 * du bot crypto (storage/critères totalement séparés).
 */
export async function syncSelectorDemoClosedTrades(): Promise<{
  closed: number;
  details: string[];
}> {
  if (!(await demoEnabled())) return { closed: 0, details: [] };

  const orders = await loadOrders();
  const openOrders = orders.filter((o) => o.status === "open");
  if (!openOrders.length) return { closed: 0, details: [] };

  const positions = await getDemoPositions();
  const openSymbols = new Set(positions.map((p) => p.symbol.toUpperCase()));
  const income = await getIncomeRecent(100);
  const details: string[] = [];
  let closed = 0;

  for (const order of openOrders) {
    if (openSymbols.has(order.pair)) continue; // toujours ouverte

    // PnL réel via contract_id (fiable) sinon fallback matching income
    let pnl = await getContractProfit(order.entryOrderId);
    if (pnl === null) {
      const openedMs = new Date(order.openedAt).getTime();
      const hits = income
        .filter(
          (i) => i.symbol.toUpperCase() === order.pair && i.time >= openedMs - 5_000
        )
        .sort((a, b) => b.time - a.time);
      pnl = hits.reduce((s, i) => s + i.income, 0);
    }

    const risk = Math.abs(order.entryPrice - order.stopLoss);
    const rMultiple =
      risk > 0 && order.qty > 0
        ? pnl / (risk * order.qty)
        : pnl > 0
          ? 1
          : pnl < 0
            ? -1
            : 0;

    order.status = "closed";
    order.realizedPnl = pnl;
    order.closedAt = new Date().toISOString();

    closed += 1;
    const realMode = await isRealTradingActive();
    const tag = realMode ? "RÉEL" : "DEMO";
    const line = `${tag} CLOSE ${order.pair} ${order.direction} PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD (~${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(2)}R)`;
    details.push(line);

    try {
      await publishSmcSignal(`${realMode ? "🔴" : "💰"} ${line}`);
    } catch {
      // recap best-effort — ne bloque pas la synchro des autres trades
    }
  }

  await saveOrders(orders);
  return { closed, details };
}
