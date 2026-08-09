import type { Candle } from "./indicators";

/** Public market-data host (works from US Vercel; api.binance.com often returns 451). */
const BINANCE_DATA = "https://data-api.binance.vision";
const BYBIT = "https://api.bybit.com";

function mapBinanceKlines(raw: unknown[]): Candle[] {
  return raw.map((row) => {
    const r = row as (string | number)[];
    return {
      openTime: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    };
  });
}

async function fetchBinanceDataApi(
  symbol: string,
  interval: string,
  limit: number
): Promise<Candle[]> {
  const url = new URL(`${BINANCE_DATA}/api/v3/klines`);
  url.searchParams.set("symbol", symbol.replace("/", ""));
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`BinanceData ${symbol}: ${res.status}`);
  return mapBinanceKlines((await res.json()) as unknown[]);
}

async function fetchBybit(
  symbol: string,
  interval: string,
  limit: number
): Promise<Candle[]> {
  const intervalMap: Record<string, string> = {
    "1m": "1",
    "5m": "5",
    "15m": "15",
    "1h": "60",
    "4h": "240",
    "1d": "D",
  };
  const url = new URL(`${BYBIT}/v5/market/kline`);
  url.searchParams.set("category", "spot");
  url.searchParams.set("symbol", symbol.replace("/", ""));
  url.searchParams.set("interval", intervalMap[interval] || "60");
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Bybit ${symbol}: ${res.status}`);
  const data = (await res.json()) as {
    retCode: number;
    result?: { list?: string[][] };
  };
  if (data.retCode !== 0 || !data.result?.list?.length) {
    throw new Error(`Bybit ${symbol}: empty`);
  }
  // Bybit returns newest first
  return data.result.list
    .slice()
    .reverse()
    .map((r) => ({
      openTime: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }));
}

export async function fetchKlines(
  symbol: string,
  interval = "1h",
  limit = 120
): Promise<Candle[]> {
  try {
    return await fetchBinanceDataApi(symbol, interval, limit);
  } catch {
    return fetchBybit(symbol, interval, limit);
  }
}

export function toPairLabel(symbol: string): string {
  const s = symbol.replace("/", "").toUpperCase();
  if (s.endsWith("USDT")) return `${s.slice(0, -4)}/USDT`;
  return s;
}
