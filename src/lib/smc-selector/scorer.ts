import { atr } from "../indicators";
import { fetchDerivCandles } from "../feeds/deriv";
import {
  buildTargets,
  detectOrderBlocks,
  findLiquidity,
  findOteZone,
  latestValidFvg,
  roundPx,
  structureBias,
  zoneInsideOrOverlap,
  zoneOverlap,
  type Direction,
} from "../smc/detect";
import type { SmcSignal } from "../smc/types";
import type { ScoredSetup } from "./types";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/* ------------------------------------------------------------------ */
/* XAUUSD                                                              */
/* ------------------------------------------------------------------ */
/**
 * Barème (100 pts) :
 *  - 25 pts  base structurelle (bias M5 + FVG M5 confirmée par FVG M3 —
 *            c'est la condition d'existence même du setup dans xauusd.ts)
 *  - 25 pts  liquidité : eqh/eql (stop-hunt net) > wick (rejet simple) > rien
 *  - 20 pts  fraîcheur de la FVG M5 (plus l'écart candles est petit, mieux c'est)
 *  - 15 pts  force de la confirmation M3 (taux de chevauchement avec la FVG M5)
 *  - 15 pts  qualité du risque (stop serré par rapport à l'ATR = zone précise)
 */
export async function analyzeXauusdScored(): Promise<ScoredSetup | null> {
  const [m5, m3] = await Promise.all([
    fetchDerivCandles("XAUUSD", "5m", 120),
    fetchDerivCandles("XAUUSD", "3m", 160),
  ]);
  if (m5.length < 40 || m3.length < 40) return null;

  const bias = structureBias(m5);
  if (!bias) return null;

  const fvgKind = bias === "BUY" ? "bullish" : "bearish";
  const fvgM5 = latestValidFvg(m5, fvgKind, 28);
  if (!fvgM5) return null;

  const fvgM3 = latestValidFvg(m3, fvgKind, 36);
  if (!fvgM3 || !zoneOverlap(fvgM5, fvgM3, 0.3)) return null;

  const atrVal = atr(m5, 14);
  const buffer = Math.max(atrVal * 0.12, 0.15);
  const direction: Direction = bias;

  const liquidity = findLiquidity(m5, direction, fvgM5, 35);

  let stopLoss: number;
  let setup = "FVG + confirmation M3";
  if (liquidity) {
    stopLoss =
      direction === "SELL"
        ? roundPx(liquidity.price + buffer)
        : roundPx(liquidity.price - buffer);
    setup = "FVG + Liquidité";
  } else {
    stopLoss =
      direction === "SELL"
        ? roundPx(fvgM5.top + buffer)
        : roundPx(fvgM5.bottom - buffer);
  }

  const entryLow = roundPx(Math.min(fvgM5.bottom, fvgM5.top));
  const entryHigh = roundPx(Math.max(fvgM5.bottom, fvgM5.top));
  const { tp1, tp2, tp3, rr } = buildTargets(direction, entryLow, entryHigh, stopLoss);

  const mid = (entryLow + entryHigh) / 2;
  if (direction === "SELL" && stopLoss <= entryHigh) return null;
  if (direction === "BUY" && stopLoss >= entryLow) return null;
  if (Math.abs(mid - stopLoss) < buffer * 0.5) return null;

  // ---- Scoring ----
  const base = 25;

  let liquidityPts = 0;
  if (liquidity?.kind === "eqh" || liquidity?.kind === "eql") liquidityPts = 25;
  else if (liquidity?.kind === "wick") liquidityPts = 15;

  const fvgAge = m5.length - 1 - fvgM5.index;
  const freshnessPts = Math.round(clamp(20 * (1 - fvgAge / 28), 0, 20));

  const overlapRatio = computeOverlapRatio(fvgM5, fvgM3);
  const confirmationPts = Math.round(
    clamp(((overlapRatio - 0.3) / 0.7) * 15, 0, 15)
  );

  const riskRatio = Math.abs(mid - stopLoss) / Math.max(atrVal, 1e-9);
  const riskPts = Math.round(clamp(15 * (1 - Math.min(riskRatio, 3) / 3), 0, 15));

  const score = clamp(base + liquidityPts + freshnessPts + confirmationPts + riskPts, 0, 100);

  const fingerprint = `XAUUSD:${direction}:${entryLow}-${entryHigh}:${stopLoss}`;

  const signal: SmcSignal = {
    pair: "XAUUSD",
    direction,
    timeframe: "M5 avec confirmation M3",
    setup,
    entryLow,
    entryHigh,
    stopLoss,
    tp1,
    tp2,
    tp3,
    rr,
    oteLow: null,
    oteHigh: null,
    confluence:
      direction === "SELL"
        ? liquidity
          ? `FVG baissière M5∩M3 + liquidité (${liquidity.kind})`
          : "FVG baissière M5 confirmée M3"
        : liquidity
          ? `FVG haussière M5∩M3 + liquidité (${liquidity.kind})`
          : "FVG haussière M5 confirmée M3",
    fingerprint,
    price: roundPx(m5[m5.length - 1].close),
  };

  return {
    pair: "XAUUSD",
    score,
    breakdown: {
      base_structure: base,
      liquidite: liquidityPts,
      fraicheur_fvg: freshnessPts,
      confirmation_m3: confirmationPts,
      qualite_risque: riskPts,
    },
    signal,
  };
}

function computeOverlapRatio(
  a: { top: number; bottom: number },
  b: { top: number; bottom: number }
): number {
  const top = Math.min(a.top, b.top);
  const bottom = Math.max(a.bottom, b.bottom);
  if (top <= bottom) return 0;
  const overlap = top - bottom;
  const smaller = Math.min(a.top - a.bottom, b.top - b.bottom);
  if (smaller <= 0) return 0;
  return overlap / smaller;
}

/* ------------------------------------------------------------------ */
/* V100                                                                 */
/* ------------------------------------------------------------------ */
/**
 * Barème (100 pts) :
 *  - 25 pts  base structurelle (biais M30+M15 alignés — condition
 *            obligatoire dans v100.ts, donc toujours acquise si le setup existe)
 *  - 25 pts  type de confluence dans l'OTE : FVG (25) > OB (15)
 *  - 20 pts  proximité du prix avec la zone OTE
 *  - 15 pts  fraîcheur de la zone d'entrée (FVG/OB)
 *  - 15 pts  qualité du risque (stop serré par rapport à l'ATR)
 */
export async function analyzeV100Scored(): Promise<ScoredSetup | null> {
  const [m5, m15, m30] = await Promise.all([
    fetchDerivCandles("V100", "5m", 120),
    fetchDerivCandles("V100", "15m", 100),
    fetchDerivCandles("V100", "30m", 80),
  ]);
  if (m15.length < 40 || m30.length < 30 || m5.length < 40) return null;

  const bias30 = structureBias(m30);
  const bias15 = structureBias(m15);
  if (!bias30 || !bias15 || bias30 !== bias15) return null;

  const direction: Direction = bias30;
  const ote = findOteZone(m15, direction);
  if (!ote) return null;

  const price = m5[m5.length - 1].close;
  const atrVal = atr(m15, 14);
  const oteBuffer = atrVal * 0.8;
  const nearOte = price <= ote.top + oteBuffer && price >= ote.bottom - oteBuffer;
  if (!nearOte) return null;

  const fvgKind = direction === "BUY" ? "bullish" : "bearish";
  const fvg = latestValidFvg(m5, fvgKind, 30);
  const obs = detectOrderBlocks(m5, 40).filter((z) => z.kind === fvgKind);

  let entryZone: { top: number; bottom: number; index: number } | null = null;
  let entryLabel: "FVG" | "OB" = "FVG";

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
    direction === "SELL" ? roundPx(ote.top + buffer) : roundPx(ote.bottom - buffer);

  const entryLow = roundPx(Math.min(entryZone.bottom, entryZone.top));
  const entryHigh = roundPx(Math.max(entryZone.bottom, entryZone.top));
  const { tp1, tp2, tp3, rr } = buildTargets(direction, entryLow, entryHigh, stopLoss);

  const mid = (entryLow + entryHigh) / 2;
  if (direction === "SELL" && stopLoss <= mid) return null;
  if (direction === "BUY" && stopLoss >= mid) return null;

  // ---- Scoring ----
  const base = 25;

  const confluencePts = entryLabel === "FVG" ? 25 : 15;

  const distanceToOte =
    price > ote.top ? price - ote.top : price < ote.bottom ? ote.bottom - price : 0;
  const proximityRatio = clamp(distanceToOte / Math.max(oteBuffer, 1e-9), 0, 1);
  const proximityPts = Math.round(20 * (1 - proximityRatio));

  const zoneAge = m5.length - 1 - entryZone.index;
  const maxAge = entryLabel === "FVG" ? 30 : 40;
  const freshnessPts = Math.round(clamp(15 * (1 - zoneAge / maxAge), 0, 15));

  const riskRatio = Math.abs(mid - stopLoss) / Math.max(atrVal, 1e-9);
  const riskPts = Math.round(clamp(15 * (1 - Math.min(riskRatio, 3) / 3), 0, 15));

  const score = clamp(base + confluencePts + proximityPts + freshnessPts + riskPts, 0, 100);

  const fingerprint = `V100:${direction}:${roundPx(ote.bottom)}-${roundPx(ote.top)}:${entryLabel}`;

  const signal: SmcSignal = {
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

  return {
    pair: "V100",
    score,
    breakdown: {
      base_biais_aligne: base,
      confluence_ote: confluencePts,
      proximite_ote: proximityPts,
      fraicheur_zone: freshnessPts,
      qualite_risque: riskPts,
    },
    signal,
  };
}
