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

/** Budget temps dur — bien sous la limite serverless, même en pleine
 * exécution du cron principal. Au-delà, on s'arrête proprement et on le
 * signale, plutôt que de risquer un timeout Vercel. */
const BROADCAST_TIME_BUDGET_MS = 20_000;
/** Envois simultanés par lot — reste sous le rate-limit agrégé Telegram
 * (~30 messages/seconde tous chats confondus). */
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1100;

export async function broadcastToSubscribers(
  feed: "crypto" | "smc",
  text: string,
  budgetMs = BROADCAST_TIME_BUDGET_MS
): Promise<{ sent: number; failed: string[]; skipped: number }> {
  const list = await listSubscribers();
  const targets = list.filter(
    (s) => isActiveNow(s) && (s.feed === feed || s.feed === "both")
  );

  const startedAt = Date.now();
  let sent = 0;
  const failed: string[] = [];

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    if (Date.now() - startedAt > budgetMs) {
      const skipped = targets.length - i;
      return { sent, failed, skipped };
    }

    const batch = targets.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (s) => {
        try {
          await sendMessage(s.chatId, text);
          sent++;
        } catch {
          failed.push(s.label);
        }
      })
    );

    if (i + BATCH_SIZE < targets.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return { sent, failed, skipped: 0 };
}
