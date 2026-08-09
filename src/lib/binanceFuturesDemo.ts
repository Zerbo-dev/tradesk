import crypto from "crypto";
import { getEnv } from "./env";
import type {
  DemoAccount,
  DemoIncome,
  DemoPosition,
  PlaceDemoInput,
  PlaceDemoResult,
} from "./demo/types";

export type {
  DemoAccount,
  DemoIncome,
  DemoPosition,
  PlaceDemoInput,
  PlaceDemoResult,
};

/** Binance USD-M Futures Demo REST (ex-testnet). */
const BASE = "https://demo-fapi.binance.com";

type Filters = {
  stepSize: number;
  tickSize: number;
  minQty: number;
};

const filterCache = new Map<string, Filters>();

function sign(query: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

function toQuery(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");
}

async function signedRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string | number | boolean> = {}
): Promise<T> {
  const env = getEnv();
  if (!env.binanceDemoKey || !env.binanceDemoSecret) {
    throw new Error("BINANCE_DEMO_API_KEY/SECRET manquants");
  }

  const payload = {
    ...params,
    timestamp: Date.now(),
    recvWindow: 10_000,
  };
  const query = toQuery(payload);
  const signature = sign(query, env.binanceDemoSecret);
  const url = `${BASE}${path}?${query}&signature=${signature}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": env.binanceDemoKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
  });

  const data = (await res.json()) as T & {
    code?: number;
    msg?: string;
  };
  if (!res.ok || (data as { code?: number }).code) {
    const msg =
      (data as { msg?: string }).msg ||
      `Binance demo HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function publicGet<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const qs = toQuery(params);
  const url = `${BASE}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as T & { code?: number; msg?: string };
  if (!res.ok || (data as { code?: number }).code) {
    throw new Error(
      (data as { msg?: string }).msg || `Binance demo HTTP ${res.status}`
    );
  }
  return data;
}

function floorToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  const floored = Math.floor(value / step) * step;
  return Number(floored.toFixed(precision));
}

function roundToTick(value: number, tick: number): number {
  if (tick <= 0) return value;
  const precision = Math.max(0, Math.round(-Math.log10(tick)));
  const rounded = Math.round(value / tick) * tick;
  return Number(rounded.toFixed(precision));
}

async function getFilters(symbol: string): Promise<Filters> {
  const sym = symbol.replace("/", "").toUpperCase();
  const cached = filterCache.get(sym);
  if (cached) return cached;

  const info = await publicGet<{
    symbols: {
      symbol: string;
      filters: { filterType: string; stepSize?: string; tickSize?: string; minQty?: string }[];
    }[];
  }>("/fapi/v1/exchangeInfo");

  const row = info.symbols.find((s) => s.symbol === sym);
  if (!row) throw new Error(`Symbol inconnu sur futures demo: ${sym}`);

  const lot = row.filters.find((f) => f.filterType === "LOT_SIZE");
  const price = row.filters.find((f) => f.filterType === "PRICE_FILTER");
  const filters: Filters = {
    stepSize: Number(lot?.stepSize || 0.001),
    tickSize: Number(price?.tickSize || 0.01),
    minQty: Number(lot?.minQty || 0),
  };
  filterCache.set(sym, filters);
  return filters;
}

export async function getDemoAccount(): Promise<DemoAccount> {
  const acc = await signedRequest<{
    availableBalance: string;
    totalWalletBalance: string;
    totalUnrealizedProfit: string;
  }>("GET", "/fapi/v2/account");
  return {
    availableBalance: Number(acc.availableBalance),
    walletBalance: Number(acc.totalWalletBalance),
    unrealizedProfit: Number(acc.totalUnrealizedProfit),
  };
}

export type DemoPosition = {
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  unrealizedProfit: number;
  leverage: number;
};

export async function getDemoPositions(): Promise<DemoPosition[]> {
  const rows = await signedRequest<
    {
      symbol: string;
      positionAmt: string;
      entryPrice: string;
      unRealizedProfit: string;
      leverage: string;
    }[]
  >("GET", "/fapi/v2/positionRisk");

  return rows
    .map((r) => ({
      symbol: r.symbol,
      positionAmt: Number(r.positionAmt),
      entryPrice: Number(r.entryPrice),
      unrealizedProfit: Number(r.unRealizedProfit),
      leverage: Number(r.leverage),
    }))
    .filter((r) => Math.abs(r.positionAmt) > 0);
}

export type PlaceDemoInput = {
  symbol: string;
  direction: "LONG" | "SHORT";
  stopLoss: number;
  takeProfit: number;
  notionalUsdt?: number;
  leverage?: number;
};

export type PlaceDemoResult = {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  entryOrderId: string;
  entryPrice: number;
  slOrderId?: string;
  tpOrderId?: string;
};

export async function placeDemoTrade(
  input: PlaceDemoInput
): Promise<PlaceDemoResult> {
  const env = getEnv();
  const symbol = input.symbol.replace("/", "").toUpperCase();
  const notional = input.notionalUsdt ?? env.demoNotionalUsdt;
  const leverage = input.leverage ?? env.demoLeverage;
  const filters = await getFilters(symbol);

  // One-way mode + leverage
  try {
    await signedRequest("POST", "/fapi/v1/marginType", {
      symbol,
      marginType: "ISOLATED",
    });
  } catch {
    // already isolated
  }
  await signedRequest("POST", "/fapi/v1/leverage", {
    symbol,
    leverage,
  });

  const mark = await publicGet<{ price: string }>("/fapi/v1/ticker/price", {
    symbol,
  });
  const price = Number(mark.price);
  let qty = floorToStep(notional / price, filters.stepSize);
  if (qty < filters.minQty) {
    throw new Error(
      `Qty trop petite pour ${symbol}: ${qty} < min ${filters.minQty}`
    );
  }

  const side: "BUY" | "SELL" = input.direction === "LONG" ? "BUY" : "SELL";
  const closeSide: "BUY" | "SELL" = side === "BUY" ? "SELL" : "BUY";

  const entry = await signedRequest<{
    orderId: number;
    avgPrice: string;
    executedQty: string;
  }>("POST", "/fapi/v1/order", {
    symbol,
    side,
    type: "MARKET",
    quantity: qty,
  });

  const entryPrice = Number(entry.avgPrice) || price;
  qty = Number(entry.executedQty) || qty;

  const sl = roundToTick(input.stopLoss, filters.tickSize);
  const tp = roundToTick(input.takeProfit, filters.tickSize);

  let slOrderId: string | undefined;
  let tpOrderId: string | undefined;

  try {
    const slOrder = await signedRequest<{ orderId: number }>(
      "POST",
      "/fapi/v1/order",
      {
        symbol,
        side: closeSide,
        type: "STOP_MARKET",
        stopPrice: sl,
        closePosition: "true",
        workingType: "MARK_PRICE",
      }
    );
    slOrderId = String(slOrder.orderId);
  } catch (err) {
    console.error("demo SL order failed", err);
  }

  try {
    const tpOrder = await signedRequest<{ orderId: number }>(
      "POST",
      "/fapi/v1/order",
      {
        symbol,
        side: closeSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: tp,
        closePosition: "true",
        workingType: "MARK_PRICE",
      }
    );
    tpOrderId = String(tpOrder.orderId);
  } catch (err) {
    console.error("demo TP order failed", err);
  }

  return {
    symbol,
    side,
    qty,
    entryOrderId: String(entry.orderId),
    entryPrice,
    slOrderId,
    tpOrderId,
  };
}

export async function getIncomeRecent(limit = 50): Promise<
  { symbol: string; income: number; time: number; incomeType: string }[]
> {
  const rows = await signedRequest<
    { symbol: string; income: string; time: number; incomeType: string }[]
  >("GET", "/fapi/v1/income", {
    incomeType: "REALIZED_PNL",
    limit,
  });
  return rows.map((r) => ({
    symbol: r.symbol,
    income: Number(r.income),
    time: r.time,
    incomeType: r.incomeType,
  }));
}
