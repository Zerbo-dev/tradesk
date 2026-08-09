import { getSignal, updateSignal, type SignalRow } from "./db";

const DEFAULT_R: Record<string, number> = {
  tp1: 1,
  tp2: 2,
  sl: -1,
  be: 0,
  closed: 0,
};

export async function resolveSignal(
  signalId: number,
  event: string,
  resultR?: number
): Promise<{ signal: SignalRow | null; status: string }> {
  const ev = event.toLowerCase().trim();
  if (!(ev in DEFAULT_R) && ev !== "cancelled") {
    return { signal: null, status: "Event invalide (tp1/tp2/sl/be/closed/cancelled)" };
  }

  const signal = await getSignal(signalId);
  if (!signal) return { signal: null, status: "Signal introuvable" };
  if (["sl", "tp2", "closed", "cancelled", "be", "neutral"].includes(signal.status)) {
    return { signal: null, status: `Signal déjà terminé (${signal.status})` };
  }

  const now = new Date().toISOString();
  if (ev === "cancelled") {
    await updateSignal(signalId, { status: "cancelled", closed_at: now });
    return { signal: await getSignal(signalId), status: "cancelled" };
  }

  const r = resultR === undefined ? DEFAULT_R[ev] : resultR;
  const payload: Record<string, unknown> = { status: ev, result_r: r };
  if (ev !== "tp1") payload.closed_at = now;
  await updateSignal(signalId, payload);
  return { signal: await getSignal(signalId), status: ev };
}
