import { getMeta, setMeta } from "../db";
import type { PairWindowState, SelectorState } from "./types";

/**
 * Clé DÉDIÉE au nouveau sélecteur. Ne touche jamais à `smc_seen_fingerprints`
 * (anti-spam du bot SMC existant) ni à `smc_last_scan_at`.
 */
const STATE_KEY = "smc_selector_state_v1";

function emptyPairState(windowId: string): PairWindowState {
  return {
    windowId,
    published: false,
    publishedFingerprint: null,
    best: null,
  };
}

function emptyState(windowId: string): SelectorState {
  return {
    XAUUSD: emptyPairState(windowId),
    V100: emptyPairState(windowId),
  };
}

export async function loadSelectorState(
  currentWindowId: string
): Promise<SelectorState> {
  const raw = await getMeta(STATE_KEY);
  if (!raw) return emptyState(currentWindowId);

  let parsed: SelectorState;
  try {
    parsed = JSON.parse(raw) as SelectorState;
  } catch {
    return emptyState(currentWindowId);
  }

  // Nouveau créneau détecté pour une paire → on repart de zéro pour elle
  // (chaque paire est réinitialisée indépendamment, au cas où un run aurait
  // été manqué pour l'une des deux).
  const XAUUSD =
    parsed.XAUUSD?.windowId === currentWindowId
      ? parsed.XAUUSD
      : emptyPairState(currentWindowId);
  const V100 =
    parsed.V100?.windowId === currentWindowId
      ? parsed.V100
      : emptyPairState(currentWindowId);

  return { XAUUSD, V100 };
}

export async function saveSelectorState(state: SelectorState): Promise<void> {
  await setMeta(STATE_KEY, JSON.stringify(state));
}
