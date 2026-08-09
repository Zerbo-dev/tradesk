import { analyzeV100Scored, analyzeXauusdScored } from "./scorer";
import { getActiveWindow, isClosingTick } from "./scheduler";
import { loadSelectorState, saveSelectorState } from "./storage";
import type {
  PairWindowState,
  ScoredSetup,
  SelectorPair,
  SelectorState,
  TickPairResult,
  TickResult,
} from "./types";

const ANALYZERS: Record<SelectorPair, () => Promise<ScoredSetup | null>> = {
  XAUUSD: analyzeXauusdScored,
  V100: analyzeV100Scored,
};

export type PublishableTickResult = TickResult & {
  toPublish: ScoredSetup[];
};

async function processPair(
  pair: SelectorPair,
  pairState: PairWindowState,
  now: Date,
  closingTick: boolean,
  threshold: number
): Promise<{ nextState: PairWindowState; result: TickPairResult; toPublish: ScoredSetup | null }> {
  // Quota déjà consommé pour ce créneau → on ne scanne même pas.
  if (pairState.published) {
    return {
      nextState: pairState,
      result: {
        pair,
        action: "quota_used",
        detail: "Publication déjà faite pour ce créneau",
      },
      toPublish: null,
    };
  }

  let scored: ScoredSetup | null = null;
  try {
    scored = await ANALYZERS[pair]();
  } catch {
    scored = null;
  }

  let best = pairState.best;
  if (scored && (!best || scored.score > best.score)) {
    best = scored;
  }

  // Seuil atteint → publication immédiate, quota consommé.
  if (scored && scored.score >= threshold) {
    return {
      nextState: {
        ...pairState,
        best,
        published: true,
        publishedFingerprint: scored.signal.fingerprint,
      },
      result: {
        pair,
        action: "published_immediate",
        score: scored.score,
        detail: `Seuil ${threshold} atteint (${scored.score})`,
      },
      toPublish: scored,
    };
  }

  // Fin de créneau → on publie le meilleur setup vu, s'il y en a un.
  if (closingTick && best) {
    return {
      nextState: {
        ...pairState,
        best,
        published: true,
        publishedFingerprint: best.signal.fingerprint,
      },
      result: {
        pair,
        action: "published_end_of_window",
        score: best.score,
        detail: `Fin de créneau, meilleur setup (${best.score}) publié`,
      },
      toPublish: best,
    };
  }

  if (closingTick && !best) {
    return {
      nextState: { ...pairState, best },
      result: {
        pair,
        action: "no_setup",
        detail: "Fin de créneau, aucun setup valide détecté — aucune publication",
      },
      toPublish: null,
    };
  }

  return {
    nextState: { ...pairState, best },
    result: {
      pair,
      action: "held",
      score: scored?.score,
      detail: scored
        ? `Setup à ${scored.score}/${threshold}, on garde en réserve`
        : "Aucun setup ce tick",
    },
    toPublish: null,
  };
}

/**
 * Exécute un tick de cron pour le sélecteur SMC.
 * N'écrit rien dans `smc_seen_fingerprints` ni dans les tables du bot
 * existant : storage.ts utilise une clé meta dédiée.
 */
export async function runSmcSelectorTick(opts: {
  threshold?: number;
  now?: Date;
}): Promise<PublishableTickResult> {
  const threshold = opts.threshold ?? 85;
  const now = opts.now ?? new Date();
  const window = getActiveWindow(now);

  if (!window) {
    return {
      ok: true,
      window: null,
      threshold,
      results: [
        { pair: "XAUUSD", action: "no_setup", detail: "Hors créneau" },
        { pair: "V100", action: "no_setup", detail: "Hors créneau" },
      ],
      toPublish: [],
    };
  }

  const closingTick = isClosingTick(now, window);
  const state = await loadSelectorState(window.id);

  const [xau, v100] = await Promise.all([
    processPair("XAUUSD", state.XAUUSD, now, closingTick, threshold),
    processPair("V100", state.V100, now, closingTick, threshold),
  ]);

  const nextState: SelectorState = {
    XAUUSD: xau.nextState,
    V100: v100.nextState,
  };
  await saveSelectorState(nextState);

  const toPublish = [xau.toPublish, v100.toPublish].filter(
    (s): s is ScoredSetup => s !== null
  );

  return {
    ok: true,
    window: window.label,
    threshold,
    results: [xau.result, v100.result],
    toPublish,
  };
}
