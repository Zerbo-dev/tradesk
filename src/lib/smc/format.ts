import type { SmcSignal } from "./types";

function fmt(n: number): string {
  return n.toFixed(2);
}

function nowGmt(): string {
  const d = new Date();
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi} GMT+0`;
}

function rrDisplay(signal: SmcSignal): string {
  const entry = (signal.entryLow + signal.entryHigh) / 2;
  const risk = Math.abs(entry - signal.stopLoss);
  if (risk <= 0) return "1:0";
  const reward = Math.abs(signal.tp2 - entry);
  const ratio = reward / risk;
  return `1:${ratio.toFixed(1)}`;
}

export function formatXauSignal(s: SmcSignal): string {
  const dir = s.direction === "BUY" ? "BUY 🟢" : "SELL 🔴";
  return [
    "🚨 *NOUVEAU SIGNAL XAUUSD* 🚨",
    "",
    `*Paire*: XAUUSD`,
    `*Direction*: ${dir}`,
    `*TF d'analyse*: ${s.timeframe}`,
    `*Setup*: ${s.setup}`,
    "",
    `*📍 Entry Zone*: ${fmt(s.entryLow)} - ${fmt(s.entryHigh)}`,
    `*🛑 Stop Loss*: ${fmt(s.stopLoss)}`,
    `*🎯 Take Profit*:`,
    `  TP1: ${fmt(s.tp1)} [1R]`,
    `  TP2: ${fmt(s.tp2)} [2R] *50%*`,
    `  TP3: ${fmt(s.tp3)} [3R] *Close*`,
    "",
    `*RR*: ${rrDisplay(s)}`,
    `*Heure*: ${nowGmt()}`,
    "",
    `_Ne pas forcer l'entrée. Attends que le prix revienne dans la zone._`,
  ].join("\n");
}

export function formatV100Signal(s: SmcSignal): string {
  const dir = s.direction === "BUY" ? "BUY 🟢" : "SELL 🔴";
  const slNote = s.direction === "BUY" ? "*Sous OTE*" : "*Au-dessus OTE*";
  return [
    "🚨 *NOUVEAU SIGNAL VOLATILITY 100* 🚨",
    "",
    `*Paire*: V100`,
    `*Direction*: ${dir}`,
    `*TF d'analyse*: ${s.timeframe}`,
    `*Setup*: ${s.setup}`,
    "",
    `*📍 Zone OTE*: ${fmt(s.oteLow || 0)} - ${fmt(s.oteHigh || 0)}`,
    `*📍 Entry Zone*: ${fmt(s.entryLow)} - ${fmt(s.entryHigh)} *FVG/OB trouvée*`,
    `*🛑 Stop Loss*: ${fmt(s.stopLoss)} ${slNote}`,
    `*🎯 Take Profit*:`,
    `  TP1: ${fmt(s.tp1)} [1R]`,
    `  TP2: ${fmt(s.tp2)} [2R] *50%*`,
    `  TP3: ${fmt(s.tp3)} [3R] *Close*`,
    "",
    `*RR*: ${rrDisplay(s)}`,
    `*Heure*: ${nowGmt()}`,
    "",
    `_Confluence: ${s.confluence}_`,
  ].join("\n");
}

export function formatSmcSignal(s: SmcSignal): string {
  return s.pair === "XAUUSD" ? formatXauSignal(s) : formatV100Signal(s);
}

export function formatSmcEmpty(nextSeconds = 60): string {
  return [
    "✅ *Scan terminé*",
    "Aucun nouveau setup valide sur XAUUSD et V100.",
    `Prochain scan dans ${nextSeconds}s.`,
  ].join("\n");
}
