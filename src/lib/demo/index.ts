import * as binance from "../binanceFuturesDemo";
import * as deriv from "./derivDemo";
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

export function resolveDemoProvider(): DemoProviderName {
  const env = getEnv();
  const pref = (env.demoProvider || "auto").toLowerCase();

  if (pref === "deriv") return "deriv";
  if (pref === "binance") return "binance";

  // auto: Deriv first (works from FR / Vercel US), then Binance
  if (env.derivApiToken) return "deriv";
  if (env.binanceDemoKey && env.binanceDemoSecret) return "binance";
  throw new Error("Aucun provider demo configuré");
}

export function demoEnabled(): boolean {
  const env = getEnv();
  if (!env.demoExecution) return false;
  return Boolean(
    env.derivApiToken || (env.binanceDemoKey && env.binanceDemoSecret)
  );
}

export function demoProviderLabel(): string {
  try {
    const p = resolveDemoProvider();
    return p === "deriv" ? "Deriv Multipliers DEMO" : "Binance Futures DEMO";
  } catch {
    return "Demo OFF";
  }
}

function api() {
  const provider = resolveDemoProvider();
  return provider === "deriv" ? deriv : binance;
}

export async function getDemoAccount(): Promise<DemoAccount> {
  return api().getDemoAccount();
}

export async function getDemoPositions(): Promise<DemoPosition[]> {
  return api().getDemoPositions();
}

export async function placeDemoTrade(
  input: PlaceDemoInput
): Promise<PlaceDemoResult> {
  return api().placeDemoTrade(input);
}

export async function getIncomeRecent(limit = 50): Promise<DemoIncome[]> {
  return api().getIncomeRecent(limit);
}

export function usesContractIds(): boolean {
  return resolveDemoProvider() === "deriv";
}
