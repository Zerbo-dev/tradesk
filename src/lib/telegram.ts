import { getEnv } from "./env";

const API = "https://api.telegram.org";

export type PublishResult = {
  channelMessageId: number | null;
  delivered: boolean;
  errors: string[];
};

export async function tg(method: string, body: Record<string, unknown>) {
  const { telegramToken } = getEnv();
  const res = await fetch(`${API}/bot${telegramToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    ok: boolean;
    result?: unknown;
    description?: string;
  };
  if (!data.ok) {
    throw new Error(data.description || `Telegram ${method} failed`);
  }
  return data.result;
}

export async function sendMessage(chatId: string | number, text: string) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  }) as Promise<{ message_id: number }>;
}

/** Normalize ids like "canal-100…", "100…", "-100…" */
export function normalizeChatId(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let id = raw.trim().replace(/^canal\s*/i, "");
  if (!id) return undefined;
  if (!id.startsWith("-")) id = `-${id}`;
  return id;
}

export async function publishAnalysis(
  text: string,
  opts: { dm?: boolean } = { dm: true }
): Promise<PublishResult> {
  const env = getEnv();
  const errors: string[] = [];
  let channelMessageId: number | null = null;
  let dmOk = false;

  const channelId = normalizeChatId(env.signalsChannelId);
  const tasks: Promise<void>[] = [];

  if (channelId) {
    tasks.push(
      sendMessage(channelId, text)
        .then((sent) => {
          channelMessageId = sent.message_id;
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "échec";
          errors.push(`canal(${channelId}): ${msg}`);
          console.error("channel publish failed", err);
        })
    );
  }

  if (opts.dm !== false) {
    for (const adminId of env.adminIds) {
      tasks.push(
        sendMessage(adminId, text)
          .then(() => {
            dmOk = true;
          })
          .catch((err) => {
            errors.push(
              `dm(${adminId}): ${err instanceof Error ? err.message : "échec"}`
            );
            console.error("admin DM failed", adminId, err);
          })
      );
    }
  }

  await Promise.all(tasks);

  return {
    channelMessageId,
    delivered: channelMessageId !== null || dmOk,
    errors,
  };
}

/**
 * Publish to a specific channel (SMC).
 * Default: Markdown for *bold* templates. Never touches SIGNALS_CHANNEL_ID.
 */
export async function publishToChat(
  text: string,
  opts: {
    channelId?: string | null;
    dm?: boolean;
    parseMode?: "Markdown" | "HTML" | null;
  }
): Promise<PublishResult> {
  const env = getEnv();
  const errors: string[] = [];
  let channelMessageId: number | null = null;
  let dmOk = false;

  const channelId = normalizeChatId(opts.channelId);
  const parseMode = opts.parseMode === undefined ? "Markdown" : opts.parseMode;
  const tasks: Promise<void>[] = [];

  const send = (chatId: string | number) =>
    tg("sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(parseMode ? { parse_mode: parseMode } : {}),
    }) as Promise<{ message_id: number }>;

  if (channelId) {
    tasks.push(
      send(channelId)
        .then((sent) => {
          channelMessageId = sent.message_id;
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "échec";
          errors.push(`canal(${channelId}): ${msg}`);
          console.error("channel publish failed", err);
        })
    );
  }

  if (opts.dm) {
    for (const adminId of env.adminIds) {
      tasks.push(
        send(adminId)
          .then(() => {
            dmOk = true;
          })
          .catch((err) => {
            errors.push(
              `dm(${adminId}): ${err instanceof Error ? err.message : "échec"}`
            );
            console.error("admin DM failed", adminId, err);
          })
      );
    }
  }

  await Promise.all(tasks);

  return {
    channelMessageId,
    delivered: channelMessageId !== null || dmOk,
    errors,
  };
}

/** SMC signals → canal SMC uniquement (pas le canal EMA crypto). */
export async function publishSmcSignal(text: string): Promise<PublishResult> {
  const env = getEnv();
  return publishToChat(text, {
    channelId: env.smcChannelId,
    dm: false,
    parseMode: "Markdown",
  });
}
