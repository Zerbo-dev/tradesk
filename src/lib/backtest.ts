import type { Candle } from "./indicators";
import { analyzeCandles } from "./analysis";
import { fetchDerivCandlesRange, DERIV_SYMBOLS } from "./feeds/deriv";
import { getMeta, setMeta } from "./db";
import fs from "fs";
import path from "path";

export type BacktestTrade = {
  index: number;
  time: number;
  direction: "LONG" | "SHORT";
  entry: number;
  stopLoss: number;
  tp1: number;
  outcome: "TP" | "SL" | "OPEN_AT_END";
  exitIndex: number;
  r: number;
};

export type BacktestResult = {
  pair: string;
  timeframe: string;
  bars: number;
  trades: BacktestTrade[];
  winrate: number | null;
  avgR: number;
  sumR: number;
  maxDrawdownR: number;
};

let cachedData: Record<string, Record<string, [number, number, number, number, number][]>> | null = null;

function loadHistoricalData() {
  if (cachedData) return cachedData;
  const file = path.join(process.cwd(), "data", "forex-market-data.json");
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw) as { pairs: typeof cachedData };
  cachedData = parsed.pairs!;
  return cachedData;
}

export function availableBacktestPairs(): string[] {
  return Object.keys(loadHistoricalData());
}

/* ------------------------------------------------------------------ */
/* Deriv — vraies paires du bot (BTC/ETH/SOL), historique mis en cache */
/* dans Supabase (pas de disque : filesystem Vercel en lecture seule   */
/* hors build). Connexion publique séparée de la session de trading — */
/* aucune interférence possible avec un trade en cours.                */
/* ------------------------------------------------------------------ */

function derivCacheKey(pair: string, timeframe: string): string {
  return `backtest_deriv_${pair}_${timeframe}`;
}

export async function fetchAndCacheDerivHistory(
  pair: string,
  timeframe: string,
  days: number
): Promise<{ bars: number }> {
  if (!(pair in DERIV_SYMBOLS)) {
    throw new Error(`Paire non supportée sur Deriv: ${pair}`);
  }
  const toEpoch = Math.floor(Date.now() / 1000);
  const fromEpoch = toEpoch - days * 86400;
  const candles = await fetchDerivCandlesRange(pair, timeframe, fromEpoch, toEpoch);
  if (!candles.length) throw new Error("Aucune donnée renvoyée par Deriv");

  const raw = candles.map((c) => [c.openTime / 1000, c.open, c.high, c.low, c.close]);
  await setMeta(derivCacheKey(pair, timeframe), JSON.stringify(raw));
  return { bars: candles.length };
}

export async function derivCacheStatus(
  pair: string,
  timeframe: string
): Promise<{ cached: boolean; bars: number }> {
  const raw = await getMeta(derivCacheKey(pair, timeframe));
  if (!raw) return { cached: false, bars: 0 };
  try {
    const arr = JSON.parse(raw) as unknown[];
    return { cached: true, bars: arr.length };
  } catch {
    return { cached: false, bars: 0 };
  }
}

export async function runCryptoBacktestDeriv(
  pair: string,
  timeframe: string
): Promise<BacktestResult> {
  const raw = await getMeta(derivCacheKey(pair, timeframe));
  if (!raw) {
    throw new Error(
      `Pas d'historique en cache pour ${pair} ${timeframe} — clique "Télécharger l'historique" d'abord`
    );
  }
  const parsed = JSON.parse(raw) as [number, number, number, number, number][];
  return runBacktestOnRawCandles(pair, timeframe, parsed);
}

function toCandles(raw: [number, number, number, number, number][]): Candle[] {
  return raw.map(([openTime, open, high, low, close]) => ({
    openTime: openTime * 1000,
    open,
    high,
    low,
    close,
    volume: 0,
  }));
}

/**
 * Rejoue analyzeCandles() (la VRAIE logique du bot crypto, EMA20/50 +
 * RSI + pullback) sur une série historique, bougie par bougie, avec
 * une fenêtre glissante de 120 bougies (comme runAnalysisForSymbol).
 * Simule chaque signal jusqu'à SL ou TP1 (R fixe, cohérent avec le bot).
 */
export function runCryptoBacktest(
  pair: string,
  timeframe: string
): BacktestResult {
  const data = loadHistoricalData();
  const raw = data[pair]?.[timeframe];
  if (!raw || raw.length < 150) {
    throw new Error(`Pas assez de données pour ${pair} ${timeframe}`);
  }
  return runBacktestOnRawCandles(pair, timeframe, raw);
}

function runBacktestOnRawCandles(
  pair: string,
  timeframe: string,
  raw: [number, number, number, number, number][]
): BacktestResult {
  if (raw.length < 150) {
    throw new Error(`Pas assez de données pour ${pair} ${timeframe}`);
  }
  const candles = toCandles(raw);
  const WINDOW = 120;
  const trades: BacktestTrade[] = [];
  let cooldownUntil = -1;

  for (let i = WINDOW; i < candles.length - 1; i++) {
    if (i < cooldownUntil) continue;
    const window = candles.slice(i - WINDOW, i + 1);
    let a;
    try {
      a = analyzeCandles(pair, timeframe, window);
    } catch {
      continue;
    }
    if (a.direction !== "LONG" && a.direction !== "SHORT") continue;
    if (a.stopLoss == null || a.tp1 == null) continue;

    const entry = a.price;
    const stopLoss = a.stopLoss;
    const tp1 = a.tp1;
    const risk = Math.abs(entry - stopLoss);
    if (risk <= 0) continue;

    let outcome: BacktestTrade["outcome"] = "OPEN_AT_END";
    let exitIndex = candles.length - 1;
    let r = 0;

    for (let j = i + 1; j < candles.length; j++) {
      const c = candles[j];
      const hitSL = a.direction === "LONG" ? c.low <= stopLoss : c.high >= stopLoss;
      const hitTP = a.direction === "LONG" ? c.high >= tp1 : c.low <= tp1;
      // Prudence : si les deux sont touchés dans la même bougie, on
      // considère le SL en premier (hypothèse conservatrice).
      if (hitSL) {
        outcome = "SL";
        exitIndex = j;
        r = -1;
        break;
      }
      if (hitTP) {
        outcome = "TP";
        exitIndex = j;
        r = Math.abs(tp1 - entry) / risk;
        break;
      }
    }

    trades.push({
      index: i,
      time: candles[i].openTime,
      direction: a.direction,
      entry,
      stopLoss,
      tp1,
      outcome,
      exitIndex,
      r,
    });
    cooldownUntil = i + 5; // évite le sur-comptage de signaux quasi-identiques
  }

  const closed = trades.filter((t) => t.outcome !== "OPEN_AT_END");
  const wins = closed.filter((t) => t.r > 0).length;
  const sumR = closed.reduce((s, t) => s + t.r, 0);
  const avgR = closed.length ? sumR / closed.length : 0;

  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const t of closed) {
    equity += t.r;
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, equity - peak);
  }

  return {
    pair,
    timeframe,
    bars: candles.length,
    trades,
    winrate: closed.length ? wins / closed.length : null,
    avgR,
    sumR,
    maxDrawdownR: maxDD,
  };
}
