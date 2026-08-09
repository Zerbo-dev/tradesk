import type { Candle } from "../indicators";
import { atr } from "../indicators";

export type Direction = "BUY" | "SELL";

export type Zone = {
  top: number;
  bottom: number;
  index: number;
  kind: "bullish" | "bearish";
};

export type Swing = {
  index: number;
  price: number;
  type: "high" | "low";
};

export function roundPx(price: number): number {
  if (price >= 1000) return Math.round(price * 100) / 100;
  if (price >= 100) return Math.round(price * 100) / 100;
  if (price >= 1) return Math.round(price * 1000) / 1000;
  return Math.round(price * 1e5) / 1e5;
}

export function zoneOverlap(
  a: { top: number; bottom: number },
  b: { top: number; bottom: number },
  minRatio = 0.35
): boolean {
  const top = Math.min(a.top, b.top);
  const bottom = Math.max(a.bottom, b.bottom);
  if (top <= bottom) return false;
  const overlap = top - bottom;
  const smaller = Math.min(a.top - a.bottom, b.top - b.bottom);
  if (smaller <= 0) return false;
  return overlap / smaller >= minRatio;
}

/** Classic 3-candle Fair Value Gap */
export function detectFvgs(candles: Candle[], lookback = 40): Zone[] {
  const start = Math.max(2, candles.length - lookback);
  const out: Zone[] = [];
  for (let i = start; i < candles.length; i++) {
    const left = candles[i - 2];
    const right = candles[i];
    // Bullish FVG: gap up between left.high and right.low
    if (right.low > left.high) {
      out.push({
        top: right.low,
        bottom: left.high,
        index: i,
        kind: "bullish",
      });
    }
    // Bearish FVG: gap down between left.low and right.high
    if (right.high < left.low) {
      out.push({
        top: left.low,
        bottom: right.high,
        index: i,
        kind: "bearish",
      });
    }
  }
  return out;
}

/** Last unfilled FVG still near price (not fully traded through) */
export function latestValidFvg(
  candles: Candle[],
  kind: "bullish" | "bearish",
  maxAgeBars = 24
): Zone | null {
  const fvgs = detectFvgs(candles, maxAgeBars + 5).filter((z) => z.kind === kind);
  if (!fvgs.length) return null;
  const price = candles[candles.length - 1].close;
  const atrVal = atr(candles, 14);

  for (let i = fvgs.length - 1; i >= 0; i--) {
    const z = fvgs[i];
    const age = candles.length - 1 - z.index;
    if (age > maxAgeBars) continue;

    // Consider filled if price closed deep through the zone
    if (kind === "bullish") {
      const filled = candles
        .slice(z.index + 1)
        .some((c) => c.close < z.bottom - atrVal * 0.05);
      if (filled) continue;
      // Prefer zones price can still revisit
      if (price < z.bottom - atrVal * 0.8) continue;
      if (price > z.top + atrVal * 2.5) continue;
    } else {
      const filled = candles
        .slice(z.index + 1)
        .some((c) => c.close > z.top + atrVal * 0.05);
      if (filled) continue;
      if (price > z.top + atrVal * 0.8) continue;
      if (price < z.bottom - atrVal * 2.5) continue;
    }
    return z;
  }
  return null;
}

export function findSwings(candles: Candle[], left = 3, right = 3): Swing[] {
  const swings: Swing[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) swings.push({ index: i, price: c.high, type: "high" });
    if (isLow) swings.push({ index: i, price: c.low, type: "low" });
  }
  return swings;
}

/**
 * Market structure bias from recent swing highs/lows.
 * Fallback: close vs SMA20.
 */
export function structureBias(candles: Candle[]): Direction | null {
  const swings = findSwings(candles, 2, 2);
  const highs = swings.filter((s) => s.type === "high").slice(-3);
  const lows = swings.filter((s) => s.type === "low").slice(-3);

  if (highs.length >= 2 && lows.length >= 2) {
    const hh = highs[highs.length - 1].price > highs[highs.length - 2].price;
    const hl = lows[lows.length - 1].price > lows[lows.length - 2].price;
    const lh = highs[highs.length - 1].price < highs[highs.length - 2].price;
    const ll = lows[lows.length - 1].price < lows[lows.length - 2].price;
    if (hh && hl) return "BUY";
    if (lh && ll) return "SELL";
  }

  const closes = candles.map((c) => c.close);
  const n = 20;
  if (closes.length < n + 1) return null;
  const sma =
    closes.slice(-n).reduce((a, b) => a + b, 0) / n;
  const price = closes[closes.length - 1];
  if (price > sma * 1.0005) return "BUY";
  if (price < sma * 0.9995) return "SELL";
  return null;
}

/**
 * Liquidity = equal highs / equal lows (stop clusters) near a zone.
 * "rejet de mèche" ≈ wick piercing then reject.
 */
export function findLiquidity(
  candles: Candle[],
  direction: Direction,
  near: { top: number; bottom: number },
  lookback = 30
): { price: number; kind: "eqh" | "eql" | "wick" } | null {
  const atrVal = atr(candles, 14);
  const tol = Math.max(atrVal * 0.15, near.top * 0.00015);
  const slice = candles.slice(-lookback);
  const start = candles.length - slice.length;

  if (direction === "SELL") {
    // Equal highs above / at top of FVG
    const highs = slice
      .map((c, i) => ({ price: c.high, index: start + i }))
      .filter((h) => h.price >= near.top - tol && h.price <= near.top + atrVal * 2.2);

    for (let i = 0; i < highs.length; i++) {
      for (let j = i + 1; j < highs.length; j++) {
        if (Math.abs(highs[i].price - highs[j].price) <= tol) {
          const level = Math.max(highs[i].price, highs[j].price);
          return { price: level, kind: "eqh" };
        }
      }
    }

    // Wick rejection above FVG
    for (let i = slice.length - 1; i >= Math.max(0, slice.length - 8); i--) {
      const c = slice[i];
      const bodyTop = Math.max(c.open, c.close);
      const upperWick = c.high - bodyTop;
      if (
        c.high > near.top &&
        upperWick >= atrVal * 0.35 &&
        c.close <= near.top + tol
      ) {
        return { price: c.high, kind: "wick" };
      }
    }
  } else {
    const lows = slice
      .map((c, i) => ({ price: c.low, index: start + i }))
      .filter((l) => l.price <= near.bottom + tol && l.price >= near.bottom - atrVal * 2.2);

    for (let i = 0; i < lows.length; i++) {
      for (let j = i + 1; j < lows.length; j++) {
        if (Math.abs(lows[i].price - lows[j].price) <= tol) {
          const level = Math.min(lows[i].price, lows[j].price);
          return { price: level, kind: "eql" };
        }
      }
    }

    for (let i = slice.length - 1; i >= Math.max(0, slice.length - 8); i--) {
      const c = slice[i];
      const bodyBottom = Math.min(c.open, c.close);
      const lowerWick = bodyBottom - c.low;
      if (
        c.low < near.bottom &&
        lowerWick >= atrVal * 0.35 &&
        c.close >= near.bottom - tol
      ) {
        return { price: c.low, kind: "wick" };
      }
    }
  }
  return null;
}

/** Last opposing candle before an impulsive move = Order Block */
export function detectOrderBlocks(
  candles: Candle[],
  lookback = 40
): Zone[] {
  const out: Zone[] = [];
  const start = Math.max(3, candles.length - lookback);
  const atrVal = atr(candles, 14);

  for (let i = start; i < candles.length - 1; i++) {
    const c = candles[i];
    const next = candles[i + 1];
    const move = next.close - next.open;

    // Bullish OB: last bearish candle before bullish impulse
    if (c.close < c.open && move > atrVal * 0.55) {
      out.push({
        top: Math.max(c.open, c.close),
        bottom: c.low,
        index: i,
        kind: "bullish",
      });
    }
    // Bearish OB: last bullish candle before bearish impulse
    if (c.close > c.open && move < -atrVal * 0.55) {
      out.push({
        top: c.high,
        bottom: Math.min(c.open, c.close),
        index: i,
        kind: "bearish",
      });
    }
  }
  return out;
}

/**
 * OTE zone = Fib 0.618 – 0.786 of last impulsive swing.
 * BUY → retracement of bullish impulse (swing low → swing high)
 * SELL → retracement of bearish impulse (swing high → swing low)
 */
export function findOteZone(
  candles: Candle[],
  direction: Direction
): { top: number; bottom: number; swingHigh: number; swingLow: number } | null {
  const swings = findSwings(candles, 2, 2);
  if (swings.length < 2) return null;

  if (direction === "BUY") {
    // Last significant low then higher high
    const lows = swings.filter((s) => s.type === "low");
    const highs = swings.filter((s) => s.type === "high");
    if (!lows.length || !highs.length) return null;
    const swingLow = lows[lows.length - 1];
    const afterHighs = highs.filter((h) => h.index > swingLow.index);
    const swingHigh = afterHighs.length
      ? afterHighs.reduce((a, b) => (b.price > a.price ? b : a))
      : highs[highs.length - 1];
    if (swingHigh.index <= swingLow.index) return null;
    if (swingHigh.price <= swingLow.price) return null;

    const range = swingHigh.price - swingLow.price;
    const oteTop = swingHigh.price - range * 0.618;
    const oteBottom = swingHigh.price - range * 0.786;
    return {
      top: oteTop,
      bottom: oteBottom,
      swingHigh: swingHigh.price,
      swingLow: swingLow.price,
    };
  }

  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");
  if (!lows.length || !highs.length) return null;
  const swingHigh = highs[highs.length - 1];
  const afterLows = lows.filter((l) => l.index > swingHigh.index);
  const swingLow = afterLows.length
    ? afterLows.reduce((a, b) => (b.price < a.price ? b : a))
    : lows[lows.length - 1];
  if (swingLow.index <= swingHigh.index) return null;
  if (swingHigh.price <= swingLow.price) return null;

  const range = swingHigh.price - swingLow.price;
  const oteBottom = swingLow.price + range * 0.618;
  const oteTop = swingLow.price + range * 0.786;
  return {
    top: oteTop,
    bottom: oteBottom,
    swingHigh: swingHigh.price,
    swingLow: swingLow.price,
  };
}

export function zoneInsideOrOverlap(
  inner: { top: number; bottom: number },
  outer: { top: number; bottom: number }
): boolean {
  const mid = (inner.top + inner.bottom) / 2;
  if (mid <= outer.top && mid >= outer.bottom) return true;
  return zoneOverlap(inner, outer, 0.25);
}

export function buildTargets(
  direction: Direction,
  entryLow: number,
  entryHigh: number,
  stopLoss: number
): { tp1: number; tp2: number; tp3: number; rr: number } {
  const entry = (entryLow + entryHigh) / 2;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) {
    return { tp1: entry, tp2: entry, tp3: entry, rr: 0 };
  }
  const sign = direction === "BUY" ? 1 : -1;
  return {
    tp1: roundPx(entry + sign * risk * 1),
    tp2: roundPx(entry + sign * risk * 2),
    tp3: roundPx(entry + sign * risk * 3),
    rr: 3,
  };
}
