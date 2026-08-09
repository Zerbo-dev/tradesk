import type { SmcSignal } from "../smc/types";

export type SelectorPair = "XAUUSD" | "V100";

/** Un setup détecté + son score déterministe (0–100) */
export type ScoredSetup = {
  pair: SelectorPair;
  score: number;
  breakdown: Record<string, number>;
  signal: SmcSignal;
};

/** État d'un créneau pour UNE paire */
export type PairWindowState = {
  windowId: string;
  /** true → quota du créneau consommé, plus rien à publier */
  published: boolean;
  publishedFingerprint: string | null;
  /** meilleur setup vu jusqu'ici dans ce créneau (pas encore publié) */
  best: ScoredSetup | null;
};

export type SelectorState = {
  XAUUSD: PairWindowState;
  V100: PairWindowState;
};

export type Window = {
  id: string;
  /** minute du jour (UTC), inclus */
  startMinute: number;
  /** minute du jour (UTC), exclu */
  endMinute: number;
  label: string;
};

export type TickPairResult = {
  pair: SelectorPair;
  action: "published_immediate" | "published_end_of_window" | "held" | "quota_used" | "no_setup";
  score?: number;
  detail: string;
};

export type TickResult = {
  ok: true;
  window: string | null;
  threshold: number;
  results: TickPairResult[];
};
