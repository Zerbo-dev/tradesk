import { WebSocket } from "undici";
import { getEnv } from "../env";
import { getSettings } from "../settings";
import { activeAccountType } from "./accountMode";
import { getValidDerivAccessToken } from "./derivAuth";
import type {
  DemoAccount,
  DemoIncome,
  DemoPosition,
  PlaceDemoInput,
  PlaceDemoResult,
} from "./types";

/**
 * Deriv a migré toute sa plateforme de trading vers une nouvelle
 * architecture (confirmé via https://developers.deriv.com/llms.txt,
 * août 2026) :
 *
 *   - REST : base https://api.derivws.com, headers
 *     `Deriv-App-ID` + `Authorization: Bearer <access_token OAuth2>`.
 *     Un PAT statique NE fonctionne PAS ici (confirmé empiriquement :
 *     401 vide) — seul un access_token OAuth2 (Authorization Code+PKCE,
 *     voir demo/derivAuth.ts) est accepté. Le PAT reste valide
 *     uniquement pour l'endpoint bulk-purchase (non utilisé ici).
 *   - WebSocket : `wss://api.derivws.com/trading/v1/options/ws/{demo|real}`,
 *     obtenu via `POST /trading/v1/options/accounts/{accountId}/otp`.
 *     Pas de message `authorize` sur le WS — l'URL OTP est déjà scopée
 *     au compte.
 *   - Le champ `symbol` est renommé `underlying_symbol` dans les messages
 *     `proposal`/`buy`.
 *
 * Prérequis avant que ce module fonctionne : ouvrir une fois
 * `/api/auth/deriv/start` dans un navigateur pour créer la session
 * OAuth (voir demo/derivAuth.ts). Ensuite, le token se rafraîchit
 * automatiquement côté serveur.
 */

const REST_BASE = "https://api.derivws.com";

/**
 * Deriv n'accepte qu'un multiplicateur parmi une liste fixe pour les
 * contrats Multipliers — pas un simple levier arbitraire comme Binance.
 * Confirmé par erreur réelle : "Multiplier is not in acceptable range.
 * Accepts 100,200,300,500,800." Cette liste peut varier selon le
 * symbole ; `parseAcceptedMultipliers` la relit dynamiquement depuis le
 * message d'erreur en filet de sécurité si elle diffère.
 */
const DEFAULT_ACCEPTED_MULTIPLIERS = [100, 200, 300, 500, 800];

function snapMultiplier(desired: number, accepted: number[]): number {
  return accepted.reduce((best, cur) =>
    Math.abs(cur - desired) < Math.abs(best - desired) ? cur : best
  );
}

function parseAcceptedMultipliers(message: string): number[] | null {
  const m = message.match(/Accepts\s+([\d,\s]+)/i);
  if (!m) return null;
  const values = m[1]
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return values.length ? values : null;
}

/** Coercition défensive : Deriv peut renvoyer des nombres en string. */
function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Bot pairs → Deriv underlyings. */
const SYMBOL_TO_DERIV: Record<string, string> = {
  BTCUSDT: "cryBTCUSD",
  ETHUSDT: "cryETHUSD",
  SOLUSDT: "crySOLUSD",
  // Mêmes symboles Deriv que ceux déjà utilisés (et validés) par
  // feeds/deriv.ts pour la lecture de bougies du bot SMC.
  XAUUSD: "frxXAUUSD",
  V100: "R_100",
};

const DERIV_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_TO_DERIV).map(([k, v]) => [v, k])
);

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

async function requireToken(): Promise<string> {
  return getValidDerivAccessToken();
}

/* ------------------------------------------------------------------ */
/* REST (compte, OTP)                                                  */
/* ------------------------------------------------------------------ */

async function restCall<T>(
  path: string,
  opts: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}
): Promise<T> {
  const env = getEnv();
  const token = await requireToken();
  const appId = env.derivAppId || "1089";

  const res = await fetch(`${REST_BASE}${path}`, {
    method: opts.method || "GET",
    headers: {
      "Deriv-App-ID": appId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const raw = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: { message?: string; code?: string };
  };

  if (!res.ok || raw.error) {
    throw new Error(
      raw.error?.message ||
        raw.error?.code ||
        `Deriv REST HTTP ${res.status} sur ${path}`
    );
  }

  return (raw.data ?? raw) as T;
}

type DerivOptionsAccount = {
  account_id: string;
  balance: number | string;
  currency: string;
  group?: string;
  status?: string;
  account_type: "demo" | "real";
};

let cachedAccount: { type: string; id: string } | null = null;

/**
 * Trouve l'account_id du compte ACTIF sur ce token — "demo" par défaut,
 * ou "real" UNIQUEMENT si le double verrou (DERIV_ACCOUNT_TYPE=real +
 * REAL_TRADING_CONFIRMED=true) est levé. Voir demo/accountMode.ts.
 */
async function getDemoAccountId(): Promise<string> {
  const type = await activeAccountType();
  if (cachedAccount?.type === type) return cachedAccount.id;

  const data = await restCall<DerivOptionsAccount | DerivOptionsAccount[]>(
    "/trading/v1/options/accounts"
  );
  const accounts = Array.isArray(data) ? data : [data];
  const acc = accounts.find((a) => a.account_type === type);
  if (!acc) {
    throw new Error(
      `Aucun compte Deriv "${type}" trouvé pour ce token (vérifie DERIV_ACCOUNT_TYPE et que tu as bien autorisé ce compte lors du login OAuth)`
    );
  }
  cachedAccount = { type, id: acc.account_id };
  return acc.account_id;
}

async function getDemoAccountRaw(): Promise<DerivOptionsAccount> {
  const type = await activeAccountType();
  const data = await restCall<DerivOptionsAccount | DerivOptionsAccount[]>(
    "/trading/v1/options/accounts"
  );
  const accounts = Array.isArray(data) ? data : [data];
  const acc = accounts.find((a) => a.account_type === type);
  if (!acc) throw new Error(`Aucun compte Deriv "${type}" trouvé`);
  return acc;
}

async function getOtpWsUrl(accountId: string): Promise<string> {
  const data = await restCall<{ url: string }>(
    `/trading/v1/options/accounts/${accountId}/otp`,
    { method: "POST" }
  );
  if (!data.url) throw new Error("Deriv: réponse OTP sans url");
  return data.url;
}

/* ------------------------------------------------------------------ */
/* WebSocket (proposal, buy, portfolio, profit_table)                  */
/*                                                                      */
/* L'URL OTP est déjà authentifiée pour le compte — aucun message      */
/* `authorize` à envoyer après connexion.                              */
/* ------------------------------------------------------------------ */

type DerivWsMsg = {
  msg_type?: string;
  error?: { message?: string; code?: string };
  req_id?: number;
  proposal?: { id?: string; ask_price?: number; spot?: number };
  buy?: { contract_id?: number; buy_price?: number; entry_spot?: number };
  portfolio?: {
    contracts?: {
      contract_id?: number;
      underlying?: string;
      underlying_symbol?: string;
      symbol?: string;
      contract_type?: string;
      buy_price?: number;
      bid_price?: number;
      profit?: number;
      multiplier?: number;
      entry_spot?: number;
    }[];
  };
  proposal_open_contract?: {
    contract_id?: number;
    underlying?: string;
    underlying_symbol?: string;
    symbol?: string;
    contract_type?: string;
    buy_price?: number;
    bid_price?: number;
    profit?: number;
    multiplier?: number;
    entry_spot?: number;
    entry_tick?: number;
    current_spot?: number;
    is_sold?: number;
  };
  profit_table?: {
    transactions?: {
      contract_id?: number;
      profit?: number;
      purchase_time?: number;
      sell_time?: number;
      underlying_symbol?: string;
      underlying?: string;
    }[];
  };
};

/** Lit underlying_symbol/underlying/symbol dans cet ordre (le nom exact
 * varie selon l'endpoint — confirmé empiriquement, la doc ne le précise
 * pas de façon fiable). */
function extractUnderlying(o: {
  underlying_symbol?: string;
  underlying?: string;
  symbol?: string;
}): string | undefined {
  return o.underlying_symbol || o.underlying || o.symbol;
}

class DerivOtpSession {
  private ws: WebSocket;
  private pending = new Map<
    number,
    { resolve: (m: DerivWsMsg) => void; reject: (e: Error) => void }
  >();
  private reqId = 1;
  private ready: Promise<void>;

  constructor(otpUrl: string) {
    this.ws = new WebSocket(otpUrl);
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Deriv WS (OTP): connexion timeout")),
        12_000
      );
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Deriv WS (OTP): erreur connexion"));
      });
      this.ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as DerivWsMsg;
          this.onMessage(msg);
        } catch {
          /* ignore trames malformées */
        }
      });
    });
  }

  private onMessage(msg: DerivWsMsg) {
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
  ): Promise<DerivWsMsg> {
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
      /* déjà fermé */
    }
  }
}

async function withOtpSession<T>(
  fn: (s: DerivOtpSession) => Promise<T>
): Promise<T> {
  const accountId = await getDemoAccountId();
  const otpUrl = await getOtpWsUrl(accountId);
  const session = new DerivOtpSession(otpUrl);
  try {
    return await fn(session);
  } finally {
    session.close();
  }
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

async function getSpot(
  session: DerivOtpSession,
  derivSymbol: string
): Promise<number> {
  const res = await session.call({
    proposal: 1,
    amount: 1,
    basis: "stake",
    contract_type: "MULTUP",
    currency: "USD",
    underlying_symbol: derivSymbol,
    // multiplier n'a pas d'effet sur le spot lu, mais Deriv rejette les
    // valeurs hors liste acceptée (ex: "Accepts 100,200,300,500,800") —
    // on utilise donc le plus petit multiplicateur standard plutôt que 1.
    multiplier: DEFAULT_ACCEPTED_MULTIPLIERS[0],
  });
  const spot = res.proposal?.spot;
  if (!spot || spot <= 0) throw new Error(`Prix indisponible pour ${derivSymbol}`);
  return spot;
}

/* ------------------------------------------------------------------ */
/* API publique (même signature que le provider Binance)               */
/* ------------------------------------------------------------------ */

export async function getDemoAccount(): Promise<DemoAccount> {
  const acc = await getDemoAccountRaw();
  // La balance vient du REST /accounts. Le PnL non réalisé nécessite le
  // portfolio (WS) — additionné ci-dessous, best-effort.
  let uPnL = 0;
  try {
    uPnL = await withOtpSession(async (session) => {
      const pf = await session.call({ portfolio: 1 });
      return (
        pf.portfolio?.contracts?.reduce((s, c) => s + toNumber(c.profit), 0) || 0
      );
    });
  } catch {
    // best-effort : si le portfolio échoue, on retourne juste la balance
  }

  // Deriv peut renvoyer `balance` en string selon l'endpoint — coercition
  // défensive obligatoire, sinon .toFixed() plante côté appelant.
  const balance = toNumber(acc.balance, NaN);
  if (!Number.isFinite(balance)) {
    throw new Error(
      `Deriv: champ balance inattendu dans la réponse compte (reçu: ${JSON.stringify(acc)})`
    );
  }

  return {
    availableBalance: balance,
    walletBalance: balance,
    unrealizedProfit: uPnL,
  };
}

export async function getDemoPositions(): Promise<DemoPosition[]> {
  return withOtpSession(async (session) => {
    const pf = await session.call({ portfolio: 1 });
    const contracts = pf.portfolio?.contracts || [];

    // `portfolio` ne fournit pas toujours entry_spot/profit fiables —
    // on relit chaque contrat ouvert via proposal_open_contract, la
    // source correcte pour ces données en temps réel.
    const detailed = await Promise.all(
      contracts.map(async (c) => {
        if (!c.contract_id) return null;
        try {
          const res = await session.call({
            proposal_open_contract: 1,
            contract_id: c.contract_id,
          });
          return res.proposal_open_contract || null;
        } catch {
          return null;
        }
      })
    );

    return contracts.map((c, i) => {
      const detail = detailed[i];
      const underlying = extractUnderlying(detail || c) || "";
      const contractType = detail?.contract_type || c.contract_type || "";
      const isUp = contractType.includes("UP");
      return {
        symbol: fromDerivSymbol(underlying),
        positionAmt: isUp ? 1 : -1,
        entryPrice: toNumber(
          detail?.entry_spot ?? detail?.entry_tick ?? c.entry_spot,
          0
        ),
        unrealizedProfit: toNumber(detail?.profit ?? c.profit, 0),
        leverage: toNumber(detail?.multiplier ?? c.multiplier, 1),
        contractId: c.contract_id ? String(c.contract_id) : undefined,
      };
    });
  });
}

export async function placeDemoTrade(
  input: PlaceDemoInput
): Promise<PlaceDemoResult> {
  const settings = await getSettings();
  const symbol = input.symbol.replace("/", "").toUpperCase();
  const derivSymbol = toDerivSymbol(symbol);
  const stake = input.notionalUsdt ?? settings.demoNotionalUsdt;
  const desiredMultiplier = input.leverage ?? settings.demoLeverage;
  let multiplier = snapMultiplier(desiredMultiplier, DEFAULT_ACCEPTED_MULTIPLIERS);

  return withOtpSession(async (session) => {
    const spot = await getSpot(session, derivSymbol);
    let limits = priceLimitsToDerivAmounts(
      input.direction,
      spot,
      input.stopLoss,
      input.takeProfit,
      stake,
      multiplier
    );

    async function sendProposal() {
      return session.call({
        proposal: 1,
        amount: stake,
        basis: "stake",
        contract_type: input.direction === "LONG" ? "MULTUP" : "MULTDOWN",
        currency: "USD",
        underlying_symbol: derivSymbol,
        multiplier,
        limit_order: limits,
      });
    }

    let proposal: DerivWsMsg;
    try {
      proposal = await sendProposal();
    } catch (err) {
      // Le set accepté peut différer de DEFAULT_ACCEPTED_MULTIPLIERS selon
      // le symbole — on relit la vraie liste dans le message d'erreur et
      // on retente une fois avec la valeur la plus proche.
      const message = err instanceof Error ? err.message : String(err);
      const accepted = parseAcceptedMultipliers(message);
      if (!accepted) throw err;
      multiplier = snapMultiplier(desiredMultiplier, accepted);
      limits = priceLimitsToDerivAmounts(
        input.direction,
        spot,
        input.stopLoss,
        input.takeProfit,
        stake,
        multiplier
      );
      proposal = await sendProposal();
    }

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
  return withOtpSession(async (session) => {
    const pt = await session.call({
      profit_table: 1,
      description: 1,
      limit,
      sort: "DESC",
    });

    return (pt.profit_table?.transactions || []).map((t) => ({
      symbol: fromDerivSymbol(t.underlying_symbol || t.underlying),
      income: Number(t.profit || 0),
      time: Number((t.sell_time || t.purchase_time || 0) * 1000),
      incomeType: "REALIZED_PNL",
      contractId: t.contract_id ? String(t.contract_id) : undefined,
    }));
  });
}

/**
 * Lit le PnL réel d'UN contrat par son contract_id — bien plus fiable que
 * profit_table (dont le matching symbole/heure s'est avéré ne rien
 * retourner sur la nouvelle API Deriv, cause du bug "PnL toujours +0.00").
 * Renvoie null si le contrat est introuvable/erreur (best-effort).
 */
export async function getContractProfit(contractId: string): Promise<number | null> {
  try {
    return await withOtpSession(async (session) => {
      const res = await session.call({
        proposal_open_contract: 1,
        contract_id: Number(contractId),
      });
      const c = res.proposal_open_contract;
      if (!c) return null;
      const profit = toNumber(c.profit, NaN);
      return Number.isFinite(profit) ? profit : null;
    });
  } catch {
    return null;
  }
}
