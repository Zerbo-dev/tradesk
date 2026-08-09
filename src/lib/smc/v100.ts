import { atr } from "../indicators";
import { fetchDerivCandles } from "../feeds/deriv";
import {
  buildTargets,
  detectOrderBlocks,
  findOteZone,
  latestValidFvg,
  roundPx,
  structureBias,
  zoneInsideOrOverlap,
  type Direction,
} from "./detect";
import type { SmcSignal } from "./types";

/**
 * V100 — SMC M5 / M15 / M30
 * AMD + OTE (Fib 0.618–0.786)
 * Entrée si dans l'OTE on trouve un FVG ou un OB
 * SL juste après la zone OTE
 */
export async function analyzeV100(): Promise<SmcSignal | null> {
  const [m5, m15, m30] = await Promise.all([
    fetchDerivCandles("V100", "5m", 120),
    fetchDerivCandles("V100", "15m", 100),
    fetchDerivCandles("V100", "30m", 80),
  ]);

  if (m15.length < 40 || m30.length < 30 || m5.length < 40) return null;

  // Biais HTF (M30) confirmé par M15
  const bias30 = structureBias(m30);
  const bias15 = structureBias(m15);
  if (!bias30 || !bias15 || bias30 !== bias15) return null;

  const direction: Direction = bias30;
  const ote = findOteZone(m15, direction);
  if (!ote) return null;

  // Prix doit être proche / dans la zone OTE (pas trop loin)
  const price = m5[m5.length - 1].close;
  const atrVal = atr(m15, 14);
  const nearOte =
    price <= ote.top + atrVal * 0.8 && price >= ote.bottom - atrVal * 0.8;
  if (!nearOte) return null;

  const fvgKind = direction === "BUY" ? "bullish" : "bearish";
  const fvg = latestValidFvg(m5, fvgKind, 30);
  const obs = detectOrderBlocks(m5, 40).filter((z) => z.kind === fvgKind);

  let entryZone: { top: number; bottom: number } | null = null;
  let entryLabel = "";

  if (fvg && zoneInsideOrOverlap(fvg, ote)) {
    entryZone = fvg;
    entryLabel = "FVG";
  } else {
    for (let i = obs.length - 1; i >= 0; i--) {
      if (zoneInsideOrOverlap(obs[i], ote)) {
        entryZone = obs[i];
        entryLabel = "OB";
        break;
      }
    }
  }

  if (!entryZone) return null;

  const buffer = Math.max(atrVal * 0.08, price * 0.0004);
  const stopLoss =
    direction === "SELL"
      ? roundPx(ote.top + buffer)
      : roundPx(ote.bottom - buffer);

  const entryLow = roundPx(Math.min(entryZone.bottom, entryZone.top));
  const entryHigh = roundPx(Math.max(entryZone.bottom, entryZone.top));
  const { tp1, tp2, tp3, rr } = buildTargets(
    direction,
    entryLow,
    entryHigh,
    stopLoss
  );

  const mid = (entryLow + entryHigh) / 2;
  if (direction === "SELL" && stopLoss <= mid) return null;
  if (direction === "BUY" && stopLoss >= mid) return null;

  const fingerprint = `V100:${direction}:${roundPx(ote.bottom)}-${roundPx(ote.top)}:${entryLabel}`;

  return {
    pair: "V100",
    direction,
    timeframe: "M15",
    setup: `SMC - Zone OTE + ${entryLabel}`,
    entryLow,
    entryHigh,
    stopLoss,
    tp1,
    tp2,
    tp3,
    rr,
    oteLow: roundPx(ote.bottom),
    oteHigh: roundPx(ote.top),
    confluence: `OTE + ${entryLabel} · biais M30/M15 ${direction}`,
    fingerprint,
    price: roundPx(price),
  };
}
