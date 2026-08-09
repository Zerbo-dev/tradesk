import { atr } from "../indicators";
import { fetchDerivCandles } from "../feeds/deriv";
import {
  buildTargets,
  findLiquidity,
  latestValidFvg,
  roundPx,
  structureBias,
  zoneOverlap,
  type Direction,
} from "./detect";
import type { SmcSignal } from "./types";

/**
 * XAUUSD — FVG M5 confirmée sur M3
 * - Tendance baissière → SELL / haussière → BUY
 * - SL au-dessus de la liquidité (rejet de mèche) si présente, sinon au-dessus/sous la FVG
 * - 3 TP : 1R / 2R (50%) / 3R (close)
 */
export async function analyzeXauusd(): Promise<SmcSignal | null> {
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

  // Confirmation : FVG M3 qui chevauche la FVG M5 (même sens)
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
  const { tp1, tp2, tp3, rr } = buildTargets(
    direction,
    entryLow,
    entryHigh,
    stopLoss
  );

  const mid = (entryLow + entryHigh) / 2;
  if (direction === "SELL" && stopLoss <= entryHigh) return null;
  if (direction === "BUY" && stopLoss >= entryLow) return null;
  if (Math.abs(mid - stopLoss) < buffer * 0.5) return null;

  const fingerprint = `XAUUSD:${direction}:${entryLow}-${entryHigh}:${stopLoss}`;

  return {
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
}
