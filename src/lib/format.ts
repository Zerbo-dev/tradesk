import type { AnalysisResult } from "./analysis";
import type { SignalRow } from "./db";
import { getSettings } from "./settings";
import { renderTemplate } from "./templates";

function stars(confidence: number): string {
  const full = Math.max(0, Math.min(5, Math.round(confidence)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  if (value >= 100) return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return String(value);
}

export async function formatAnalysis(a: AnalysisResult): Promise<string> {
  const settings = await getSettings();

  const bias =
    a.direction === "LONG" ? "LONG" : a.direction === "SHORT" ? "SHORT" : "NEUTRE";
  const directionEmoji =
    a.direction === "LONG" ? "🟢" : a.direction === "SHORT" ? "🔴" : "⚪";

  const tradeLines =
    a.direction !== "NEUTRAL"
      ? [
          `Entrée   : ${num(a.entryLow)} – ${num(a.entryHigh)}`,
          `SL       : ${num(a.stopLoss)}`,
          `TP1      : ${num(a.tp1)}`,
          `TP2      : ${num(a.tp2)}`,
        ].join("\n")
      : "Action   : pas de trade — attendre un meilleur setup";

  return renderTemplate(settings.cryptoSignalTemplate, {
    pair: a.pair,
    timeframe: a.timeframe,
    direction: bias,
    directionEmoji,
    price: num(a.price),
    ema20: num(a.ema20),
    ema50: num(a.ema50),
    rsi: String(a.rsi),
    changePct: `${a.changePct >= 0 ? "+" : ""}${a.changePct}`,
    entryLow: num(a.entryLow),
    entryHigh: num(a.entryHigh),
    stopLoss: num(a.stopLoss),
    tp1: num(a.tp1),
    tp2: num(a.tp2),
    tradeLines,
    setup: a.pattern,
    confidenceStars: stars(a.confidence),
    rationale: a.rationale,
    signalIdLine: a.signalId ? `ID #${a.signalId}` : "",
  });
}

export function formatUpdate(
  signal: SignalRow,
  event: string,
  resultR: number | null
): string {
  const base: Record<string, string> = {
    tp1: `⚡ TP1 hit — ${signal.pair} (#${signal.id})`,
    tp2: `✅ TP2 hit — ${signal.pair} (#${signal.id})`,
    sl: `❌ SL hit — ${signal.pair} (#${signal.id})`,
    be: `➖ Break-even — ${signal.pair} (#${signal.id})`,
    closed: `🔒 Closed — ${signal.pair} (#${signal.id})`,
    cancelled: `🛑 Cancelled — ${signal.pair} (#${signal.id})`,
  };
  let msg = base[event] || `Update — ${signal.pair} (#${signal.id})`;
  if (resultR !== null && resultR !== undefined) {
    const sign = resultR >= 0 ? "+" : "";
    msg += `\nRésultat : ${sign}${resultR.toFixed(2)}R`;
  }
  return msg;
}

export function formatStats(stats: {
  total: number;
  winrate: number | null;
  avgR: number;
  sumR: number;
  open: number;
}): string {
  const wr =
    stats.winrate === null ? "n/a" : `${Math.round(stats.winrate * 100)}%`;
  return [
    "📊 Perf (30j)",
    `Trades  : ${stats.total}`,
    `Winrate : ${wr}`,
    `R moyen : ${stats.avgR >= 0 ? "+" : ""}${stats.avgR.toFixed(2)}R`,
    `Sum R   : ${stats.sumR >= 0 ? "+" : ""}${stats.sumR.toFixed(2)}R`,
    `Open    : ${stats.open}`,
  ].join("\n");
}
