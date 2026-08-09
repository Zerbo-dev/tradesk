import { rpc } from "./supabase";

export type SignalRow = {
  id: number;
  pair: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  timeframe: string;
  entry_low: number | null;
  entry_high: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  risk_pct: number;
  pattern: string;
  session: string;
  confidence: number;
  rationale: string | null;
  status: string;
  result_r: number | null;
  channel_message_id: number | null;
  created_at: string;
  closed_at: string | null;
};

export type Rules = Record<string, number>;

export async function getRules(): Promise<Rules> {
  const data = await rpc<Record<string, number>>("td_get_rules");
  return data || {};
}

export async function setRules(updates: Rules): Promise<void> {
  await rpc("td_set_rules", { p_updates: updates });
}

export async function getMeta(key: string): Promise<string | null> {
  const data = await rpc<string | null>("td_get_meta", { p_key: key });
  return data ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await rpc("td_set_meta", { p_key: key, p_value: value });
}

export async function insertSignal(
  data: Record<string, unknown>
): Promise<number> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    payload[k] = v === null || v === undefined ? "" : v;
  }
  return rpc<number>("td_insert_signal", { p_data: payload });
}

export async function updateSignal(
  id: number,
  data: Record<string, unknown>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    payload[k] = v === null || v === undefined ? "" : v;
  }
  await rpc("td_update_signal", { p_id: id, p_data: payload });
}

export async function getSignal(id: number): Promise<SignalRow | null> {
  return rpc<SignalRow | null>("td_get_signal", { p_id: id });
}

export async function listOpenSignals(): Promise<SignalRow[]> {
  const data = await rpc<SignalRow[] | null>("td_list_open_signals");
  return data || [];
}

export async function closedSignalsSince(days = 30): Promise<SignalRow[]> {
  const data = await rpc<SignalRow[] | null>("td_closed_signals_since", {
    p_days: days,
  });
  return data || [];
}

export async function countSignalsToday(): Promise<number> {
  return rpc<number>("td_count_signals_today");
}

/** `minutes` maps to RPC param p_hours (legacy name; DB treats it as minutes). */
export async function recentByPair(
  pair: string,
  minutes = 4
): Promise<SignalRow[]> {
  const data = await rpc<SignalRow[] | null>("td_recent_by_pair", {
    p_pair: pair,
    p_hours: minutes,
  });
  return data || [];
}

export async function addLearningLog(
  summary: string,
  changes: Record<string, number>
): Promise<void> {
  await rpc("td_add_learning_log", {
    p_summary: summary,
    p_changes: changes,
  });
}

export async function recentLearningLogs(limit = 5): Promise<
  { id: number; summary: string; created_at: string }[]
> {
  const data = await rpc<
    { id: number; summary: string; created_at: string }[] | null
  >("td_recent_learning_logs", { p_limit: limit });
  return data || [];
}
