import {
  addLearningLog,
  closedSignalsSince,
  getMeta,
  getRules,
  recentLearningLogs,
  setMeta,
  setRules,
  type SignalRow,
} from "./db";

export type LearnReport = {
  summary: string;
  changes: Record<string, number>;
  insights: string[];
};

function avg(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function bucket(
  rows: SignalRow[],
  key: keyof SignalRow
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const row of rows) {
    if (row.result_r === null || row.result_r === undefined) continue;
    const k = String(row[key]);
    (out[k] ||= []).push(Number(row.result_r));
  }
  return out;
}

function worst(
  b: Record<string, number[]>,
  minN: number
): [string, number] | null {
  let best: [string, number] | null = null;
  for (const [name, vals] of Object.entries(b)) {
    if (vals.length < minN) continue;
    const m = avg(vals);
    if (!best || m < best[1]) best = [name, m];
  }
  return best;
}

function bestBucket(
  b: Record<string, number[]>,
  minN: number
): [string, number] | null {
  let top: [string, number] | null = null;
  for (const [name, vals] of Object.entries(b)) {
    if (vals.length < minN) continue;
    const m = avg(vals);
    if (!top || m > top[1]) top = [name, m];
  }
  return top;
}

export async function currentLossStreak(): Promise<number> {
  const rows = await closedSignalsSince(90);
  let streak = 0;
  for (const row of rows) {
    if (row.result_r === null || row.result_r === undefined) continue;
    if (Number(row.result_r) < 0) streak += 1;
    else break;
  }
  return streak;
}

export async function runLearner(days = 30): Promise<LearnReport> {
  const rules = await getRules();
  if (Number(rules.learning_enabled ?? 1) < 1) {
    return {
      summary: "Learning freeze actif — aucune modification.",
      changes: {},
      insights: ["Utilise /learn unfreeze pour réactiver."],
    };
  }

  const rows = (await closedSignalsSince(days)).filter(
    (r) => r.result_r !== null && r.result_r !== undefined
  );
  if (rows.length < 5) {
    return {
      summary: `Pas assez de data (${rows.length}/5 trades clos).`,
      changes: {},
      insights: ["Close les setups avec /close <id> tp1|sl."],
    };
  }

  const results = rows.map((r) => Number(r.result_r));
  const avgR = avg(results);
  const winrate = results.filter((r) => r > 0).length / results.length;
  const insights: string[] = [
    `${rows.length} trades / ${days}j — WR ${Math.round(winrate * 100)}% — avg ${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R`,
  ];
  const changes: Record<string, number> = {};

  const minConf = Number(rules.min_confidence || 3);
  if (avgR < -0.15 || winrate < 0.4) {
    const next = Math.min(5, minConf + 0.5);
    if (next !== minConf) {
      changes.min_confidence = next;
      insights.push(`Perf faible → min_confidence ${minConf} → ${next}`);
    }
  } else if (avgR > 0.25 && winrate > 0.55) {
    const next = Math.max(2, minConf - 0.5);
    if (next !== minConf) {
      changes.min_confidence = next;
      insights.push(`Perf solide → min_confidence ${minConf} → ${next}`);
    }
  }

  const maxTrades = Number(rules.max_trades_per_day || 8);
  if (rows.length >= 10 && avgR < 0) {
    const next = Math.max(3, maxTrades - 1);
    if (next !== maxTrades) {
      changes.max_trades_per_day = next;
      insights.push(`Surtrading → max/jour ${maxTrades} → ${next}`);
    }
  }

  const streak = await currentLossStreak();
  const pauseAfter = Number(rules.pause_after_loss_streak || 3);
  if (streak >= pauseAfter) {
    const hours = Number(rules.pause_hours || 6);
    const until = new Date(Date.now() + hours * 3600_000).toISOString();
    await setMeta("paused_until", until);
    insights.push(`Loss streak ${streak} → pause jusqu'à ${until}`);
    changes.risk_pct_default = Math.min(
      Number(rules.risk_pct_default || 1),
      Number(rules.risk_pct_after_drawdown || 0.5)
    );
  }

  const wp = worst(bucket(rows, "pattern"), 3);
  if (wp) insights.push(`Pattern faible: ${wp[0]} (${wp[1].toFixed(2)}R)`);
  const bs = bestBucket(bucket(rows, "session"), 3);
  if (bs) insights.push(`Meilleure session: ${bs[0]} (${bs[1].toFixed(2)}R)`);

  if (Object.keys(changes).length) await setRules(changes);

  const summary = Object.keys(changes).length
    ? `Règles ajustées: ${Object.entries(changes)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`
    : "Aucune règle modifiée — insights mis à jour.";

  await addLearningLog(summary, changes);
  return { summary, changes, insights };
}

export async function learnerStatus() {
  const rules = await getRules();
  const recent = await recentLearningLogs(3);
  return {
    enabled: Number(rules.learning_enabled ?? 1) >= 1,
    rules,
    pausedUntil: await getMeta("paused_until"),
    recent,
  };
}

export async function computeStats(days = 30) {
  const rows = await closedSignalsSince(days);
  const open = (await import("./db")).listOpenSignals;
  const openRows = await open();
  const results = rows
    .filter((r) => r.result_r !== null && r.result_r !== undefined)
    .map((r) => Number(r.result_r));
  if (!results.length) {
    return {
      total: 0,
      winrate: null as number | null,
      avgR: 0,
      sumR: 0,
      open: openRows.length,
    };
  }
  const wins = results.filter((r) => r > 0).length;
  return {
    total: results.length,
    winrate: wins / results.length,
    avgR: avg(results),
    sumR: results.reduce((a, b) => a + b, 0),
    open: openRows.length,
  };
}
