import { fetchKlines } from "./binance";
import { listOpenSignals, type SignalRow } from "./db";
import { formatUpdate } from "./format";
import { publishAnalysis } from "./telegram";
import { resolveSignal } from "./tracker";

export type AutoResolveItem = {
  id: number;
  pair: string;
  event: string;
  reason: string;
};

function symbolOf(pair: string): string {
  return pair.replace("/", "").toUpperCase();
}

/**
 * Parcourt les bougies après création du signal.
 * Premier niveau touché gagne (SL vs TP) — pour évaluer la fiabilité sans biais.
 */
function detectOutcome(
  signal: SignalRow,
  candles: { openTime: number; high: number; low: number }[]
): { event: "tp1" | "tp2" | "sl" | null; reason: string } {
  const created = new Date(signal.created_at).getTime();
  const sl = signal.stop_loss;
  const tp1 = signal.tp1;
  const tp2 = signal.tp2;
  const dir = signal.direction;

  if (dir !== "LONG" && dir !== "SHORT") {
    return { event: null, reason: "not actionable" };
  }
  if (sl == null || tp1 == null) {
    return { event: null, reason: "missing levels" };
  }

  const relevant = candles.filter((c) => c.openTime >= created - 60_000);
  if (!relevant.length) return { event: null, reason: "no candles yet" };

  for (const c of relevant) {
    if (dir === "LONG") {
      const hitSl = c.low <= sl;
      const hitTp2 = tp2 != null && c.high >= tp2;
      const hitTp1 = c.high >= tp1;

      // Même bougie: pire cas = SL en premier si les deux touchés
      if (hitSl && (hitTp1 || hitTp2)) {
        return { event: "sl", reason: "SL et TP même bougie → SL (conservateur)" };
      }
      if (hitSl) return { event: "sl", reason: `prix low ${c.low} <= SL ${sl}` };
      if (hitTp2) return { event: "tp2", reason: `prix high ${c.high} >= TP2 ${tp2}` };
      if (hitTp1 && signal.status === "open") {
        return { event: "tp1", reason: `prix high ${c.high} >= TP1 ${tp1}` };
      }
      if (hitTp1 && signal.status === "tp1" && hitTp2) {
        return { event: "tp2", reason: `TP2 après TP1` };
      }
    } else {
      const hitSl = c.high >= sl;
      const hitTp2 = tp2 != null && c.low <= tp2;
      const hitTp1 = c.low <= tp1;

      if (hitSl && (hitTp1 || hitTp2)) {
        return { event: "sl", reason: "SL et TP même bougie → SL (conservateur)" };
      }
      if (hitSl) return { event: "sl", reason: `prix high ${c.high} >= SL ${sl}` };
      if (hitTp2) return { event: "tp2", reason: `prix low ${c.low} <= TP2 ${tp2}` };
      if (hitTp1 && signal.status === "open") {
        return { event: "tp1", reason: `prix low ${c.low} <= TP1 ${tp1}` };
      }
    }
  }

  return { event: null, reason: "levels not hit yet" };
}

export async function autoResolveOpenSignals(opts?: {
  expireHours?: number;
  notify?: boolean;
  timeframe?: string;
}): Promise<AutoResolveItem[]> {
  const expireHours = opts?.expireHours ?? 24;
  const notify = opts?.notify !== false;
  const timeframe = opts?.timeframe || "15m";
  const open = await listOpenSignals();
  const done: AutoResolveItem[] = [];
  const now = Date.now();

  for (const signal of open) {
    if (signal.direction !== "LONG" && signal.direction !== "SHORT") continue;

    const ageH =
      (now - new Date(signal.created_at).getTime()) / (3600 * 1000);

    try {
      const candles = await fetchKlines(symbolOf(signal.pair), timeframe, 96);
      const { event, reason } = detectOutcome(signal, candles);

      if (event) {
        // Si déjà tp1 et on redetecte tp1, ignore
        if (signal.status === "tp1" && event === "tp1") continue;

        const { signal: updated, status } = await resolveSignal(
          signal.id,
          event
        );
        if (!updated) continue;

        const item = {
          id: signal.id,
          pair: signal.pair,
          event: status,
          reason,
        };
        done.push(item);

        if (notify) {
          const msg =
            `🤖 AUTO-CLOSE #${signal.id}\n` +
            formatUpdate(updated, status, updated.result_r) +
            `\n(${reason})`;
          await publishAnalysis(msg, { dm: true });
        }
        continue;
      }

      // Expiration: trop vieux sans hit → closed 0R (timeout)
      if (ageH >= expireHours) {
        const { signal: updated, status } = await resolveSignal(
          signal.id,
          "closed",
          0
        );
        if (!updated) continue;
        const item = {
          id: signal.id,
          pair: signal.pair,
          event: status,
          reason: `expiré après ${expireHours}h sans TP/SL`,
        };
        done.push(item);
        if (notify) {
          const msg =
            `⏰ TIMEOUT #${signal.id}\n` +
            formatUpdate(updated, status, updated.result_r) +
            `\n(${item.reason})`;
          await publishAnalysis(msg, { dm: true });
        }
      }
    } catch (err) {
      console.error("autoResolve failed", signal.id, err);
    }
  }

  return done;
}
