/**
 * Deriv REST API fallback pour les environnements avec WebSocket bloqués
 * (Vercel, certains réseau d'entreprise, etc.)
 */

import type { Candle } from "../indicators";
import { DERIV_SYMBOLS, GRANULARITY, type DerivPair } from "./deriv";

type DerivCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
  epoch: number;
};

function toCandles(raw: DerivCandle[]): Candle[] {
  return raw.map((c) => ({
    openTime: c.epoch * 1000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: 0,
  }));
}

/**
 * Fetch OHLC candles from Deriv REST API (fallback when WS fails).
 * This is more reliable in restricted network environments.
 */
export async function fetchDerivCandlesRest(
  pair: DerivPair | string,
  timeframe: string,
  count = 200,
  timeoutMs = 12_000
): Promise<Candle[]> {
  const symbol =
    DERIV_SYMBOLS[pair as DerivPair] || String(pair).trim();
  const granularity = GRANULARITY[timeframe];

  if (!granularity) {
    throw new Error(`Deriv TF non supporté: ${timeframe}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL("https://api.deriv.com/api/v3");
    url.searchParams.set("ticks_history", symbol);
    url.searchParams.set("granularity", String(granularity));
    url.searchParams.set("count", String(count));
    url.searchParams.set("end", "latest");
    url.searchParams.set("style", "candles");

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Deriv REST ${res.status} ${symbol}`);
    }

    const data = (await res.json()) as {
      candles?: DerivCandle[];
      error?: { message?: string; code?: string };
    };

    if (data.error) {
      throw new Error(
        `Deriv ${symbol}: ${data.error.message || data.error.code || "error"}`
      );
    }

    if (!data.candles || data.candles.length === 0) {
      throw new Error(`Deriv ${symbol}: aucune bougie`);
    }

    return toCandles(data.candles);
  } finally {
    clearTimeout(timer);
  }
}
