import { getMeta, setMeta } from "../db";
import { analyzeXauusd } from "./xauusd";
import { analyzeV100 } from "./v100";
import type { SmcScanResult, SmcSignal } from "./types";

const SEEN_KEY = "smc_seen_fingerprints";

type SeenMap = Record<string, number>; // fingerprint → unix ms

async function loadSeen(): Promise<SeenMap> {
  const raw = await getMeta(SEEN_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SeenMap;
  } catch {
    return {};
  }
}

async function saveSeen(seen: SeenMap): Promise<void> {
  // Keep last 80 fingerprints
  const entries = Object.entries(seen)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80);
  await setMeta(SEEN_KEY, JSON.stringify(Object.fromEntries(entries)));
}

function isFresh(seen: SeenMap, fp: string, cooldownMinutes: number): boolean {
  const ts = seen[fp];
  if (!ts) return true;
  return Date.now() - ts >= cooldownMinutes * 60_000;
}

/**
 * SMC scan (XAUUSD + V100). Fully isolated from EMA crypto engine.
 * Does NOT write into the main signals table (évite auto-resolve Binance).
 */
export async function runSmcScan(opts: {
  cooldownMinutes?: number;
  force?: boolean;
}): Promise<SmcScanResult> {
  const cooldown = opts.cooldownMinutes ?? 45;
  const force = opts.force === true;
  const seen = await loadSeen();
  const signals: SmcSignal[] = [];
  const skipped: { pair: string; reason: string }[] = [];
  const errors: string[] = [];

  const jobs: { pair: string; run: () => Promise<SmcSignal | null> }[] = [
    { pair: "XAUUSD", run: analyzeXauusd },
    { pair: "V100", run: analyzeV100 },
  ];

  for (const job of jobs) {
    try {
      const signal = await job.run();
      if (!signal) {
        skipped.push({ pair: job.pair, reason: "pas de setup valide" });
        continue;
      }
      if (!force && !isFresh(seen, signal.fingerprint, cooldown)) {
        skipped.push({
          pair: job.pair,
          reason: `anti-spam — même setup < ${cooldown}min`,
        });
        continue;
      }
      signals.push(signal);
      seen[signal.fingerprint] = Date.now();
    } catch (err) {
      errors.push(
        `${job.pair}: ${err instanceof Error ? err.message : "erreur"}`
      );
    }
  }

  if (signals.length) {
    await saveSeen(seen);
  }

  await setMeta("smc_last_scan_at", new Date().toISOString());

  return {
    signals,
    empty: signals.length === 0,
    errors,
    skipped,
  };
}
