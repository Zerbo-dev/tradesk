import type { SmcSignal } from "./types";
import { getSettings } from "../settings";
import { renderTemplate } from "../templates";

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

export async function formatXauSignal(s: SmcSignal): Promise<string> {
  const settings = await getSettings();
  const dir = s.direction === "BUY" ? "BUY 🟢" : "SELL 🔴";
  return renderTemplate(settings.xauSignalTemplate, {
    direction: s.direction,
    directionEmoji: dir,
    timeframe: s.timeframe,
    setup: s.setup,
    entryLow: fmt(s.entryLow),
    entryHigh: fmt(s.entryHigh),
    stopLoss: fmt(s.stopLoss),
    tp1: fmt(s.tp1),
    tp2: fmt(s.tp2),
    tp3: fmt(s.tp3),
    rr: rrDisplay(s),
    time: nowGmt(),
  });
}

export async function formatV100Signal(s: SmcSignal): Promise<string> {
  const settings = await getSettings();
  const dir = s.direction === "BUY" ? "BUY 🟢" : "SELL 🔴";
  const slNote = s.direction === "BUY" ? "*Sous OTE*" : "*Au-dessus OTE*";
  return renderTemplate(settings.v100SignalTemplate, {
    direction: s.direction,
    directionEmoji: dir,
    timeframe: s.timeframe,
    setup: s.setup,
    oteLow: fmt(s.oteLow || 0),
    oteHigh: fmt(s.oteHigh || 0),
    entryLow: fmt(s.entryLow),
    entryHigh: fmt(s.entryHigh),
    stopLoss: fmt(s.stopLoss),
    slNote,
    tp1: fmt(s.tp1),
    tp2: fmt(s.tp2),
    tp3: fmt(s.tp3),
    rr: rrDisplay(s),
    time: nowGmt(),
    confluence: s.confluence,
  });
}

export async function formatSmcSignal(s: SmcSignal): Promise<string> {
  return s.pair === "XAUUSD" ? formatXauSignal(s) : formatV100Signal(s);
}

export function formatSmcEmpty(nextSeconds = 60): string {
  return [
    "✅ *Scan terminé*",
    "Aucun nouveau setup valide sur XAUUSD et V100.",
    `Prochain scan dans ${nextSeconds}s.`,
  ].join("\n");
}
