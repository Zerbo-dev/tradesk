import { getMeta, setMeta } from "./db";
import { getEnv } from "./env";
import {
  DEFAULT_CRYPTO_TEMPLATE,
  DEFAULT_V100_TEMPLATE,
  DEFAULT_XAU_TEMPLATE,
} from "./templates";

/**
 * Réglages modifiables depuis l'interface admin, SANS redéploiement.
 * Stockés dans une clé meta dédiée. Les secrets (tokens, clés API,
 * URLs Supabase...) restent en variables Vercel — jamais ici.
 */
export type AppSettings = {
  // Bot crypto (BTC/ETH/SOL...)
  analyzePairs: string[];
  analyzeTimeframe: string;
  analyzeCooldownMinutes: number;
  autoExpireHours: number;

  // Bot SMC classique (XAUUSD/V100)
  smcCooldownMinutes: number;
  smcPostEmpty: boolean;

  // Sélecteur SMC (nouveau système, 3 créneaux/jour)
  smcSelectorThreshold: number;

  // Exécution démo / réelle
  demoExecution: boolean;
  demoProvider: "auto" | "deriv" | "binance";
  demoNotionalUsdt: number;
  demoLeverage: number;
  derivAccountType: "demo" | "real";
  realTradingConfirmed: boolean;

  // Anti-doublon
  /** 1 position démo/réelle max par symbole à la fois (recommandé: true). */
  demoOnePositionPerSymbol: boolean;

  // Templates Telegram (tokens {comme_ça} — vide = défaut intégré)
  cryptoSignalTemplate: string;
  xauSignalTemplate: string;
  v100SignalTemplate: string;
};

const SETTINGS_KEY = "app_settings_v1";

function defaultsFromEnv(): AppSettings {
  const env = getEnv();
  return {
    analyzePairs: env.pairs,
    analyzeTimeframe: env.timeframe,
    analyzeCooldownMinutes: env.cooldownMinutes,
    autoExpireHours: env.autoExpireHours,
    smcCooldownMinutes: env.smcCooldownMinutes,
    smcPostEmpty: env.smcPostEmpty,
    smcSelectorThreshold: Number(process.env.SMC_SELECTOR_THRESHOLD || 85),
    demoExecution: env.demoExecution,
    demoProvider: (env.demoProvider as AppSettings["demoProvider"]) || "auto",
    demoNotionalUsdt: env.demoNotionalUsdt,
    demoLeverage: env.demoLeverage,
    derivAccountType: (env.derivAccountType as AppSettings["derivAccountType"]) || "demo",
    realTradingConfirmed: env.realTradingConfirmed,
    demoOnePositionPerSymbol: true,
    cryptoSignalTemplate: DEFAULT_CRYPTO_TEMPLATE,
    xauSignalTemplate: DEFAULT_XAU_TEMPLATE,
    v100SignalTemplate: DEFAULT_V100_TEMPLATE,
  };
}

function sanitize(partial: Partial<AppSettings>, base: AppSettings): AppSettings {
  const next: AppSettings = { ...base, ...partial };

  if (Array.isArray(partial.analyzePairs)) {
    next.analyzePairs = partial.analyzePairs
      .map((p) => String(p).trim().toUpperCase())
      .filter(Boolean);
  }
  if (!next.analyzePairs.length) next.analyzePairs = base.analyzePairs;

  next.analyzeCooldownMinutes = clampNumber(next.analyzeCooldownMinutes, 1, 1440);
  next.autoExpireHours = clampNumber(next.autoExpireHours, 1, 168);
  next.smcCooldownMinutes = clampNumber(next.smcCooldownMinutes, 1, 1440);
  next.smcSelectorThreshold = clampNumber(next.smcSelectorThreshold, 0, 100);
  next.demoNotionalUsdt = clampNumber(next.demoNotionalUsdt, 1, 1_000_000);
  next.demoLeverage = clampNumber(next.demoLeverage, 1, 5000);

  if (!["auto", "deriv", "binance"].includes(next.demoProvider)) {
    next.demoProvider = base.demoProvider;
  }
  if (!["demo", "real"].includes(next.derivAccountType)) {
    next.derivAccountType = base.derivAccountType;
  }

  if (!next.cryptoSignalTemplate?.trim()) next.cryptoSignalTemplate = DEFAULT_CRYPTO_TEMPLATE;
  if (!next.xauSignalTemplate?.trim()) next.xauSignalTemplate = DEFAULT_XAU_TEMPLATE;
  if (!next.v100SignalTemplate?.trim()) next.v100SignalTemplate = DEFAULT_V100_TEMPLATE;

  return next;
}

function clampNumber(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export async function getSettings(): Promise<AppSettings> {
  const defaults = defaultsFromEnv();
  const raw = await getMeta(SETTINGS_KEY);
  if (!raw) return defaults;
  try {
    const stored = JSON.parse(raw) as Partial<AppSettings>;
    return sanitize(stored, defaults);
  } catch {
    return defaults;
  }
}

export async function updateSettings(
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  const current = await getSettings();
  const next = sanitize({ ...current, ...patch }, current);
  await setMeta(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
