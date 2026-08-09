import type { AnalysisResult } from "./analysis";
import type { SignalRow } from "./db";

function stars(confidence: number): string {
  const full = Math.max(0, Math.min(5, Math.round(confidence)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  if (value >= 100) return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return String(value);
}

export function formatAnalysis(a: AnalysisResult): string {
  const bias =
    a.direction === "LONG"
      ? "🟢 LONG"
      : a.direction === "SHORT"
        ? "🔴 SHORT"
        : "⚪ NEUTRE";

  const lines = [
    `ANALYSE AUTO  ${a.pair}  |  ${a.timeframe}`,
    `Biais    : ${bias}`,
    `Prix     : ${num(a.price)}`,
    `EMA20/50 : ${num(a.ema20)} / ${num(a.ema50)}`,
    `RSI      : ${a.rsi}`,
    `24h      : ${a.changePct >= 0 ? "+" : ""}${a.changePct}%`,
  ];

  if (a.direction !== "NEUTRAL") {
    lines.push(`Entrée   : ${num(a.entryLow)} – ${num(a.entryHigh)}`);
    lines.push(`SL       : ${num(a.stopLoss)}`);
    lines.push(`TP1      : ${num(a.tp1)}`);
    lines.push(`TP2      : ${num(a.tp2)}`);
  } else {
    lines.push("Action   : pas de trade — attendre un meilleur setup");
  }

  lines.push(`Setup    : ${a.pattern}`);
  lines.push(`Conf.    : ${stars(a.confidence)}`);
  lines.push(`Pourquoi : ${a.rationale}`);
  if (a.signalId) lines.push(`ID #${a.signalId}`);
  return lines.join("\n");
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
