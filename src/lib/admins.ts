import { getEnv } from "./env";
import { getMeta, setMeta } from "./db";
import { sendMessage } from "./telegram";

export type AdminEntry = {
  id: string;
  chatId: string;
  label: string;
  createdAt: string;
};

const KEY = "extra_admins_v1";
const ALERT_THROTTLE_MS = 15 * 60 * 1000;

export async function listExtraAdmins(): Promise<AdminEntry[]> {
  const raw = await getMeta(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AdminEntry[];
  } catch {
    return [];
  }
}

async function saveExtraAdmins(list: AdminEntry[]): Promise<void> {
  await setMeta(KEY, JSON.stringify(list));
}

export async function addExtraAdmin(chatId: string, label: string): Promise<AdminEntry[]> {
  const list = await listExtraAdmins();
  list.push({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    chatId: chatId.trim(),
    label: label.trim() || chatId.trim(),
    createdAt: new Date().toISOString(),
  });
  await saveExtraAdmins(list);
  return list;
}

export async function removeExtraAdmin(id: string): Promise<AdminEntry[]> {
  const list = await listExtraAdmins();
  const next = list.filter((a) => a.id !== id);
  await saveExtraAdmins(next);
  return next;
}

export async function getEffectiveAdminChatIds(): Promise<string[]> {
  const env = getEnv();
  const extra = await listExtraAdmins();
  const set = new Set<string>([...[...env.adminIds].map(String), ...extra.map((a) => a.chatId)]);
  return [...set];
}

export async function notifyAdmins(text: string): Promise<void> {
  const ids = await getEffectiveAdminChatIds();
  await Promise.all(
    ids.map((id) =>
      sendMessage(id, text).catch(() => {
        /* best-effort */
      })
    )
  );
}

export async function notifyAdminsThrottled(key: string, text: string): Promise<void> {
  const throttleKey = `alert_throttle_${key}`;
  const last = await getMeta(throttleKey);
  if (last && Date.now() - new Date(last).getTime() < ALERT_THROTTLE_MS) return;
  await setMeta(throttleKey, new Date().toISOString());
  await notifyAdmins(text);
}
