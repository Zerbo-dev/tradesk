import { getMeta, setMeta } from "./db";
import { sendMessage } from "./telegram";

export type Subscriber = {
  id: string;
  chatId: string;
  label: string;
  type: "channel" | "dm";
  feed: "crypto" | "smc" | "both";
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  note?: string;
};

const KEY = "subscribers_v1";

export async function listSubscribers(): Promise<Subscriber[]> {
  const raw = await getMeta(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Subscriber[];
  } catch {
    return [];
  }
}

async function saveSubscribers(list: Subscriber[]): Promise<void> {
  await setMeta(KEY, JSON.stringify(list));
}

export async function addSubscriber(input: {
  chatId: string;
  label: string;
  type: "channel" | "dm";
  feed: "crypto" | "smc" | "both";
  expiresAt?: string | null;
  note?: string;
}): Promise<Subscriber> {
  const list = await listSubscribers();
  const sub: Subscriber = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    chatId: input.chatId.trim(),
    label: input.label.trim() || input.chatId.trim(),
    type: input.type,
    feed: input.feed,
    active: true,
    expiresAt: input.expiresAt || null,
    createdAt: new Date().toISOString(),
    note: input.note,
  };
  list.push(sub);
  await saveSubscribers(list);
  return sub;
}

export async function updateSubscriber(
  id: string,
  patch: Partial<Omit<Subscriber, "id" | "createdAt">>
): Promise<Subscriber[]> {
  const list = await listSubscribers();
  const next = list.map((s) => (s.id === id ? { ...s, ...patch } : s));
  await saveSubscribers(next);
  return next;
}

export async function removeSubscriber(id: string): Promise<Subscriber[]> {
  const list = await listSubscribers();
  const next = list.filter((s) => s.id !== id);
  await saveSubscribers(next);
  return next;
}

function isActiveNow(s: Subscriber): boolean {
  if (!s.active) return false;
  if (s.expiresAt && new Date(s.expiresAt) < new Date()) return false;
  return true;
}

export async function broadcastToSubscribers(
  feed: "crypto" | "smc",
  text: string
): Promise<{ sent: number; failed: string[] }> {
  const list = await listSubscribers();
  const targets = list.filter(
    (s) => isActiveNow(s) && (s.feed === feed || s.feed === "both")
  );

  let sent = 0;
  const failed: string[] = [];

  await Promise.all(
    targets.map(async (s) => {
      try {
        await sendMessage(s.chatId, text);
        sent++;
      } catch {
        failed.push(s.label);
      }
    })
  );

  return { sent, failed };
}
