import * as binance from "../binanceFuturesDemo";
import * as deriv from "./derivDemo";
import { activeAccountType, isRealTradingActive } from "./accountMode";
import { getSettings } from "../settings";
import type {
  DemoAccount,
  DemoIncome,
  DemoPosition,
  DemoProviderName,
  PlaceDemoInput,
  PlaceDemoResult,
} from "./types";
import { getEnv } from "../env";

export type {
  DemoAccount,
  DemoIncome,
  DemoPosition,
  DemoProviderName,
  PlaceDemoInput,
  PlaceDemoResult,
};

export { isRealTradingActive, activeAccountType };

/**
 * Résolution DYNAMIQUE (settings admin, avec env.ts en fallback si rien
 * n'a jamais été enregistré via le panneau).
 */
export async function resolveDemoProvider(): Promise<DemoProviderName> {
  const s = await getSettings();
  const env = getEnv();
  const pref = (s.demoProvider || "auto").toLowerCase();

  if (pref === "deriv") return "deriv";
  if (pref === "binance") return "binance";

  // auto: Deriv first (works from FR / Vercel US), then Binance.
  // On teste la CONFIGURATION (redirect_uri OAuth renseignée), pas la
  // session elle-même (vérifiée de façon async au moment de l'appel réel
  // dans derivAuth.ts — sinon getDemoAccount/placeDemoTrade échoueront
  // avec un message clair invitant à faire /api/auth/deriv/start).
  if (env.derivOauthRedirectUri) return "deriv";
  if (env.binanceDemoKey && env.binanceDemoSecret) return "binance";
  throw new Error("Aucun provider demo configuré");
}

export async function demoEnabled(): Promise<boolean> {
  const s = await getSettings();
  const env = getEnv();
  if (!s.demoExecution) return false;
  return Boolean(
    env.derivOauthRedirectUri || (env.binanceDemoKey && env.binanceDemoSecret)
  );
}

export async function demoProviderLabel(): Promise<string> {
  try {
    const p = await resolveDemoProvider();
    const mode = (await isRealTradingActive()) ? "🔴 RÉEL" : "DEMO";
    return p === "deriv" ? `Deriv Multipliers ${mode}` : `Binance Futures ${mode}`;
  } catch {
    return "Demo OFF";
  }
}

async function api() {
  const provider = await resolveDemoProvider();
  if (provider === "binance" && (await isRealTradingActive())) {
    throw new Error(
      "Le provider Binance est câblé en dur sur l'hôte DEMO (demo-fapi.binance.com) — le trading réel n'est disponible que via Deriv (provider = deriv)"
    );
  }
  return provider === "deriv" ? deriv : binance;
}

export async function getDemoAccount(): Promise<DemoAccount> {
  return (await api()).getDemoAccount();
}

export async function getDemoPositions(): Promise<DemoPosition[]> {
  return (await api()).getDemoPositions();
}

export async function placeDemoTrade(
  input: PlaceDemoInput
): Promise<PlaceDemoResult> {
  return (await api()).placeDemoTrade(input);
}

export async function getIncomeRecent(limit = 50): Promise<DemoIncome[]> {
  return (await api()).getIncomeRecent(limit);
}

export async function getContractProfit(contractId: string): Promise<number | null> {
  return (await api()).getContractProfit(contractId);
}

export async function usesContractIds(): Promise<boolean> {
  return (await resolveDemoProvider()) === "deriv";
}
