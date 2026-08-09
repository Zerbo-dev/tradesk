import type { Candle } from "../indicators";

const DERIV_WS = "wss://ws.derivws.com/websockets/v3?app_id=1089";

/** Deriv symbols used by the SMC engine */
export const DERIV_SYMBOLS = {
  XAUUSD: "frxXAUUSD",
  V100: "R_100",
} as const;

export type DerivPair = keyof typeof DERIV_SYMBOLS;

/** TF label → Deriv granularity (seconds) */
export const GRANULARITY: Record<string, number> = {
  "1m": 60,
  "2m": 120,
  "3m": 180,
  "5m": 300,
  "10m": 600,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

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
 * Fetch OHLC candles from Deriv (WebSocket, free, no API key).
 * Works for forex (frxXAUUSD) and synthetics (R_100 = V100).
 */
export async function fetchDerivCandles(
  pair: DerivPair | string,
  timeframe: string,
  count = 200,
  timeoutMs = 12_000
): Promise<Candle[]> {
  const symbol =
    DERIV_SYMBOLS[pair as DerivPair] ||
    String(pair).trim();
  const granularity = GRANULARITY[timeframe];
  if (!granularity) {
    throw new Error(`Deriv TF non supporté: ${timeframe}`);
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DERIV_WS);
    let settled = false;

    const finish = (err?: Error, candles?: Candle[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(candles || []);
    };

    const timer = setTimeout(
      () => finish(new Error(`Deriv timeout ${symbol} ${timeframe}`)),
      timeoutMs
    );

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count,
          end: "latest",
          granularity,
          style: "candles",
        })
      );
    });

    ws.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          msg_type?: string;
          candles?: DerivCandle[];
          error?: { message?: string; code?: string };
        };
        if (data.error) {
          finish(
            new Error(
              `Deriv ${symbol}: ${data.error.message || data.error.code || "error"}`
            )
          );
          return;
        }
        if (data.msg_type === "candles" && data.candles?.length) {
          finish(undefined, toCandles(data.candles));
          return;
        }
        if (data.msg_type === "candles") {
          finish(new Error(`Deriv ${symbol}: aucune bougie`));
        }
      } catch (err) {
        finish(err instanceof Error ? err : new Error("Deriv parse error"));
      }
    });

    ws.addEventListener("error", () => {
      finish(new Error(`Deriv WS error ${symbol}`));
    });
  });
}
