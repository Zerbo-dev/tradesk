import { WebSocket } from "undici";
import { getEnv } from "../env";
import type {
  DemoAccount,
  DemoIncome,
  DemoPosition,
  PlaceDemoInput,
  PlaceDemoResult,
} from "./types";

const WS_BASE = "wss://ws.derivws.com/websockets/v3";

/** Bot pairs → Deriv multiplier underlyings. */
const SYMBOL_TO_DERIV: Record<string, string> = {
  BTCUSDT: "cryBTCUSD",
  ETHUSDT: "cryETHUSD",
  SOLUSDT: "crySOLUSD",
};

const DERIV_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_TO_DERIV).map(([k, v]) => [v, k])
);

type DerivMsg = {
  msg_type?: string;
  error?: { message: string; code?: string };
  req_id?: number;
  authorize?: {
    balance?: number;
    currency?: string;
    loginid?: string;
  };
  proposal?: {
    id?: string;
    ask_price?: number;
    spot?: number;
    display_value?: string;
  };
  buy?: {
    contract_id?: number;
    buy_price?: number;
    entry_spot?: number;
  };
  portfolio?: {
    contracts?: {
      contract_id?: number;
      symbol?: string;
      underlying?: string;
      contract_type?: string;
      buy_price?: number;
      bid_price?: number;
      profit?: number;
      multiplier?: number;
      entry_spot?: number;
      display_name?: string;
    }[];
  };
  profit_table?: {
    transactions?: {
      contract_id?: number;
      profit?: number;
      purchase_time?: number;
      sell_time?: number;
      shortcode?: string;
      underlying_symbol?: string;
    }[];
  };
  ticks_history?: {
    history?: { prices?: number[] };
  };
};

class DerivSession {
  private ws: WebSocket;
  private pending = new Map<
    number,
    { resolve: (m: DerivMsg) => void; reject: (e: Error) => void }
  >();
  private reqId = 1;
  private ready: Promise<void>;

  constructor(appId: number) {
    this.ws = new WebSocket(`${WS_BASE}?app_id=${appId}`);
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Deriv WS: connexion timeout")),
        12_000
      );
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Deriv WS: erreur connexion"));
      });
      this.ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as DerivMsg;
          this.onMessage(msg);
        } catch {
          // ignore malformed frames
        }
      });
    });
  }

  private onMessage(msg: DerivMsg) {
    if (!msg.req_id || !this.pending.has(msg.req_id)) return;
    const pending = this.pending.get(msg.req_id)!;
    this.pending.delete(msg.req_id);
    if (msg.error) {
      pending.reject(new Error(msg.error.message || "Deriv API error"));
      return;
    }
    pending.resolve(msg);
  }

  async call(
    payload: Record<string, unknown>,
    timeoutMs = 15_000
  ): Promise<DerivMsg> {
    await this.ready;
    const req_id = this.reqId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req_id);
        reject(new Error("Deriv API timeout"));
      }, timeoutMs);
      this.pending.set(req_id, {
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ ...payload, req_id }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // already closed
    }
  }
}

async function withSession<T>(fn: (s: DerivSession) => Promise<T>): Promise<T> {
  const env = getEnv();
  const appId = Number(env.derivAppId || 1089);
  const session = new DerivSession(appId);
  try {
    return await fn(session);
  } finally {
    session.close();
  }
}

function toDerivSymbol(symbol: string): string {
  const sym = symbol.replace("/", "").toUpperCase();
  const mapped = SYMBOL_TO_DERIV[sym];
  if (!mapped) {
    throw new Error(`Paire non supportée sur Deriv demo: ${sym}`);
  }
  return mapped;
}

function fromDerivSymbol(underlying?: string): string {
  if (!underlying) return "UNKNOWN";
  return DERIV_TO_SYMBOL[underlying] || underlying;
}

function priceLimitsToDerivAmounts(
  direction: "LONG" | "SHORT",
  entry: number,
  stopLoss: number,
  takeProfit: number,
  stake: number,
  multiplier: number
): { stop_loss: number; take_profit: number } {
  let slPct: number;
  let tpPct: number;
  if (direction === "LONG") {
    slPct = Math.max(0, (entry - stopLoss) / entry);
    tpPct = Math.max(0, (takeProfit - entry) / entry);
  } else {
    slPct = Math.max(0, (stopLoss - entry) / entry);
    tpPct = Math.max(0, (entry - takeProfit) / entry);
  }
  return {
    stop_loss: Math.max(0.35, Number((slPct * multiplier * stake).toFixed(2))),
    take_profit: Math.max(0.35, Number((tpPct * multiplier * stake).toFixed(2))),
  };
}

async function authorize(session: DerivSession): Promise<void> {
  const token = getEnv().derivApiToken;
  if (!token) throw new Error("DERIV_API_TOKEN manquant");
  const res = await session.call({ authorize: token });
  if (!res.authorize?.loginid) {
    throw new Error("Deriv: autorisation refusée (token demo + scope Trade)");
  }
}

async function getSpot(session: DerivSession, derivSymbol: string): Promise<number> {
  const res = await session.call({
    ticks_history: derivSymbol,
    adjust_start_time: 1,
    count: 1,
    end: "latest",
    style: "ticks",
  });
  const prices = res.ticks_history?.history?.prices;
  const spot = prices?.[prices.length - 1];
  if (!spot || spot <= 0) throw new Error(`Prix indisponible pour ${derivSymbol}`);
  return spot;
}

export async function getDemoAccount(): Promise<DemoAccount> {
  return withSession(async (session) => {
    await authorize(session);
    const auth = await session.call({ authorize: getEnv().derivApiToken! });
    const balance = Number(auth.authorize?.balance || 0);

    const pf = await session.call({ portfolio: 1 });
    const uPnL =
      pf.portfolio?.contracts?.reduce((s, c) => s + Number(c.profit || 0), 0) ||
      0;

    return {
      availableBalance: balance,
      walletBalance: balance,
      unrealizedProfit: uPnL,
    };
  });
}

export async function getDemoPositions(): Promise<DemoPosition[]> {
  return withSession(async (session) => {
    await authorize(session);
    const pf = await session.call({ portfolio: 1 });
    return (pf.portfolio?.contracts || []).map((c) => {
      const underlying = c.underlying || c.symbol || "";
      const isUp = (c.contract_type || "").includes("UP");
      return {
        symbol: fromDerivSymbol(underlying),
        positionAmt: isUp ? 1 : -1,
        entryPrice: Number(c.entry_spot || c.buy_price || 0),
        unrealizedProfit: Number(c.profit || 0),
        leverage: Number(c.multiplier || 1),
        contractId: c.contract_id ? String(c.contract_id) : undefined,
      };
    });
  });
}

export async function placeDemoTrade(
  input: PlaceDemoInput
): Promise<PlaceDemoResult> {
  const env = getEnv();
  const symbol = input.symbol.replace("/", "").toUpperCase();
  const derivSymbol = toDerivSymbol(symbol);
  const stake = input.notionalUsdt ?? env.demoNotionalUsdt;
  const multiplier = input.leverage ?? env.demoLeverage;

  return withSession(async (session) => {
    await authorize(session);
    const spot = await getSpot(session, derivSymbol);
    const limits = priceLimitsToDerivAmounts(
      input.direction,
      spot,
      input.stopLoss,
      input.takeProfit,
      stake,
      multiplier
    );

    const proposal = await session.call({
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type: input.direction === "LONG" ? "MULTUP" : "MULTDOWN",
      currency: "USD",
      symbol: derivSymbol,
      multiplier,
      limit_order: limits,
    });

    const propId = proposal.proposal?.id;
    if (!propId) throw new Error("Deriv: proposal sans id");

    const askPrice = Number(proposal.proposal?.ask_price || stake);
    const bought = await session.call({
      buy: propId,
      price: askPrice,
    });

    const contractId = bought.buy?.contract_id;
    if (!contractId) throw new Error("Deriv: achat sans contract_id");

    return {
      symbol,
      side: input.direction === "LONG" ? "BUY" : "SELL",
      qty: stake,
      entryOrderId: String(contractId),
      entryPrice: Number(proposal.proposal?.spot || bought.buy?.entry_spot || spot),
    };
  });
}

export async function getIncomeRecent(limit = 50): Promise<DemoIncome[]> {
  return withSession(async (session) => {
    await authorize(session);
    const pt = await session.call({
      profit_table: 1,
      description: 1,
      limit,
      sort: "DESC",
    });

    return (pt.profit_table?.transactions || []).map((t) => ({
      symbol: fromDerivSymbol(t.underlying_symbol),
      income: Number(t.profit || 0),
      time: Number((t.sell_time || t.purchase_time || 0) * 1000),
      incomeType: "REALIZED_PNL",
      contractId: t.contract_id ? String(t.contract_id) : undefined,
    }));
  });
}
