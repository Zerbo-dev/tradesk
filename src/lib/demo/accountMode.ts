import { getSettings } from "../settings";

/**
 * DOUBLE VERROU pour le trading réel — les DEUX réglages doivent être
 * actifs en même temps (via l'admin panel ou les env vars en fallback),
 * sinon on reste en démo par défaut.
 */
export async function isRealTradingActive(): Promise<boolean> {
  const s = await getSettings();
  return s.derivAccountType === "real" && s.realTradingConfirmed === true;
}

export async function activeAccountType(): Promise<"demo" | "real"> {
  return (await isRealTradingActive()) ? "real" : "demo";
}
