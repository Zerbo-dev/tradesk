import { fetchKlines, toPairLabel } from "./binance";
import { atr, ema, rsi, type Candle } from "./indicators";
import {
  countSignalsToday,
  getMeta,
  getRules,
  insertSignal,
  recentByPair,
  type SignalRow,
} from "./db";

export type AnalysisResult = {
  pair: string;
  symbol: string;
  timeframe: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  entryLow: number;
  entryHigh: number;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  confidence: number;
  pattern: string;
  session: string;
  rationale: string;
  price: number;
  ema20: number;
  ema50: number;
  rsi: number;
  changePct: number;
  skipped?: string;
  signalId?: number;
};

function currentSession(now = new Date()): string {
  const hour = now.getUTCHours();
  if (hour < 7) return "asia";
  if (hour < 13) return "london";
  if (hour < 21) return "newyork";
  return "late";
}

function roundPrice(price: number): number {
  if (price >= 1000) return Math.round(price * 10) / 10;
  if (price >= 100) return Math.round(price * 100) / 100;
  if (price >= 1) return Math.round(price * 1000) / 1000;
  return Math.round(price * 1e6) / 1e6;
}

function analyzeCandles(
  symbol: string,
  timeframe: string,
  candles: Candle[]
): AnalysisResult {
  const closes = candles.map((c) => c.close);
  const ema20Arr = ema(closes, 20);
  const ema50Arr = ema(closes, 50);
  const rsiArr = rsi(closes, 14);
  const i = closes.length - 1;
  const price = closes[i];
  const e20 = ema20Arr[i];
  const e50 = ema50Arr[i];
  const r = rsiArr[i];
  const prevR = rsiArr[i - 1];
  const atrVal = atr(candles, 14);
  const changePct =
    ((price - closes[Math.max(0, i - 24)]) / closes[Math.max(0, i - 24)]) * 100;

  const pair = toPairLabel(symbol);
  const session = currentSession();
  const bullish = e20 > e50;
  const bearish = e20 < e50;

  let direction: AnalysisResult["direction"] = "NEUTRAL";
  let pattern = "range";
  let confidence = 2.5;
  const reasons: string[] = [];

  reasons.push(
    bullish ? "EMA20 > EMA50 (tendance haussière)" : bearish ? "EMA20 < EMA50 (tendance baissière)" : "EMAs plates"
  );
  reasons.push(`RSI ${r.toFixed(1)}`);

  // LONG: uptrend + RSI recovering from oversold
  if (bullish && prevR < 35 && r >= 35 && r < 55) {
    direction = "LONG";
    pattern = "rsi_reclaim";
    confidence = 4;
    reasons.push("RSI sort de zone basse");
  } else if (bullish && r > 45 && r < 65 && price >= e20) {
    direction = "LONG";
    pattern = "trend_pullback";
    confidence = 3.5;
    reasons.push("pullback tendance haussière");
  } else if (bearish && prevR > 65 && r <= 65 && r > 45) {
    direction = "SHORT";
    pattern = "rsi_reject";
    confidence = 4;
    reasons.push("RSI quitte zone haute");
  } else if (bearish && r < 55 && r > 35 && price <= e20) {
    direction = "SHORT";
    pattern = "trend_pullback";
    confidence = 3.5;
    reasons.push("pullback tendance baissière");
  } else {
    direction = "NEUTRAL";
    pattern = "no_setup";
    confidence = 2;
    reasons.push("pas de setup clair — rester flat");
  }

  const entryLow = roundPrice(price * 0.998);
  const entryHigh = roundPrice(price * 1.002);
  let stopLoss: number | null = null;
  let tp1: number | null = null;
  let tp2: number | null = null;

  if (direction === "LONG") {
    stopLoss = roundPrice(price - atrVal * 1.2);
    tp1 = roundPrice(price + atrVal * 1.2);
    tp2 = roundPrice(price + atrVal * 2.2);
  } else if (direction === "SHORT") {
    stopLoss = roundPrice(price + atrVal * 1.2);
    tp1 = roundPrice(price - atrVal * 1.2);
    tp2 = roundPrice(price - atrVal * 2.2);
  }

  return {
    pair,
    symbol,
    timeframe,
    direction,
    entryLow,
    entryHigh,
    stopLoss,
    tp1,
    tp2,
    confidence,
    pattern,
    session,
    rationale: reasons.join(" · "),
    price: roundPrice(price),
    ema20: roundPrice(e20),
    ema50: roundPrice(e50),
    rsi: Math.round(r * 10) / 10,
    changePct: Math.round(changePct * 100) / 100,
  };
}

export async function runAnalysisForSymbol(
  symbol: string,
  timeframe: string,
  cooldownMinutes = 4
): Promise<AnalysisResult> {
  const rules = await getRules();
  const candles = await fetchKlines(symbol, timeframe, 120);
  const analysis = analyzeCandles(symbol, timeframe, candles);

  const pausedUntil = await getMeta("paused_until");
  if (pausedUntil && new Date(pausedUntil) > new Date()) {
    return { ...analysis, skipped: `pause jusqu'à ${pausedUntil}` };
  }

  // cooldownMinutes === 0 => force admin, skip anti-spam
  if (cooldownMinutes > 0) {
    const cool =
      Number(rules.analyze_cooldown_minutes || cooldownMinutes) ||
      cooldownMinutes;
    const recent = await recentByPair(
      analysis.pair,
      Math.max(1, Math.round(cool))
    );
    if (recent.length > 0) {
      return {
        ...analysis,
        skipped: `cooldown ${cool}min — déjà posté récemment`,
      };
    }
  }

  // Daily cap only for actionable LONG/SHORT (neutrals always allowed)
  if (analysis.direction !== "NEUTRAL") {
    const today = await countSignalsToday();
    const maxDay = Number(rules.max_trades_per_day || 96);
    if (today >= maxDay) {
      return { ...analysis, skipped: "limite quotidienne atteinte" };
    }
  }

  const minConf = Number(rules.min_confidence || 3);
  const postNeutrals = Number(rules.post_neutrals ?? 1) >= 1;

  if (analysis.direction === "NEUTRAL" && !postNeutrals) {
    return { ...analysis, skipped: "neutre ignoré par règles" };
  }

  // Neutrals always post (market update). Setups respect min confidence.
  if (analysis.direction !== "NEUTRAL" && analysis.confidence < minConf) {
    // Downgrade to neutral update instead of silence
    analysis.direction = "NEUTRAL";
    analysis.pattern = "watch";
    analysis.stopLoss = null;
    analysis.tp1 = null;
    analysis.tp2 = null;
    analysis.rationale =
      `${analysis.rationale} · setup filtré (conf < ${minConf}) — update marché`;
  }

  const risk =
    analysis.direction === "NEUTRAL"
      ? 0
      : Number(rules.risk_pct_default || 1);

  const status = analysis.direction === "NEUTRAL" ? "neutral" : "open";
  const id = await insertSignal({
    pair: analysis.pair,
    direction: analysis.direction,
    timeframe: analysis.timeframe,
    entry_low: analysis.entryLow,
    entry_high: analysis.entryHigh,
    stop_loss: analysis.stopLoss,
    tp1: analysis.tp1,
    tp2: analysis.tp2,
    risk_pct: risk,
    pattern: analysis.pattern,
    session: analysis.session,
    confidence: analysis.confidence,
    rationale: analysis.rationale,
    status,
  });

  return { ...analysis, signalId: id };
}

export async function runAllAnalyses(
  pairs: string[],
  timeframe: string,
  cooldownMinutes = 4
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];
  for (const symbol of pairs) {
    try {
      results.push(
        await runAnalysisForSymbol(symbol, timeframe, cooldownMinutes)
      );
    } catch (err) {
      results.push({
        pair: toPairLabel(symbol),
        symbol,
        timeframe,
        direction: "NEUTRAL",
        entryLow: 0,
        entryHigh: 0,
        stopLoss: null,
        tp1: null,
        tp2: null,
        confidence: 0,
        pattern: "error",
        session: currentSession(),
        rationale: err instanceof Error ? err.message : "error",
        price: 0,
        ema20: 0,
        ema50: 0,
        rsi: 0,
        changePct: 0,
        skipped: err instanceof Error ? err.message : "error",
      });
    }
  }
  await setLastRun();
  return results;
}

async function setLastRun() {
  const { setMeta } = await import("./db");
  await setMeta("last_analyze_at", new Date().toISOString());
}

export function signalFromRow(row: SignalRow): AnalysisResult {
  return {
    pair: row.pair,
    symbol: row.pair.replace("/", ""),
    timeframe: row.timeframe,
    direction: row.direction,
    entryLow: row.entry_low || 0,
    entryHigh: row.entry_high || 0,
    stopLoss: row.stop_loss,
    tp1: row.tp1,
    tp2: row.tp2,
    confidence: row.confidence,
    pattern: row.pattern,
    session: row.session,
    rationale: row.rationale || "",
    price: row.entry_high || 0,
    ema20: 0,
    ema50: 0,
    rsi: 0,
    changePct: 0,
    signalId: row.id,
  };
}
