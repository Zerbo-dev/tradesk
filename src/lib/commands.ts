import { getEnv } from "./env";
import { formatStats, formatUpdate, formatAnalysis } from "./format";
import { computeStats, learnerStatus, runLearner } from "./learner";
import {
  getRules,
  listOpenSignals,
  setMeta,
  setRules,
  updateSignal,
} from "./db";
import { publishAnalysis, sendMessage } from "./telegram";
import { resolveSignal } from "./tracker";
import { runAllAnalyses } from "./analysis";
import { polishAnalysis } from "./ai";
import { demoEnabled } from "./demo";
import { demoStatusText, executeDemoForAnalysis } from "./demoExecutor";

type TgUser = { id: number; username?: string };
type TgMessage = {
  message_id: number;
  text?: string;
  chat: { id: number; type: string };
  from?: TgUser;
};

function isAdmin(userId?: number): boolean {
  if (!userId) return false;
  return getEnv().adminIds.has(userId);
}

async function reply(chatId: number, text: string) {
  try {
    await sendMessage(chatId, text);
  } catch (err) {
    console.error("reply failed", chatId, err);
  }
}

async function runForcedAnalyze(chatId: number): Promise<void> {
  const env = getEnv();
  await reply(chatId, "Analyse en cours…");
  try {
    const results = await runAllAnalyses(env.pairs, env.timeframe, 0);
    let posted = 0;
    const skipReasons: string[] = [];
    for (const a of results) {
      if (a.skipped) {
        skipReasons.push(`${a.pair}: ${a.skipped}`);
        continue;
      }
      const base = await formatAnalysis(a);
      let textOut = await polishAnalysis(
        env.geminiApiKey,
        base,
        a.rationale
      );
      if (
        (await demoEnabled()) &&
        (a.direction === "LONG" || a.direction === "SHORT")
      ) {
        try {
          const demo = await executeDemoForAnalysis(a);
          textOut += demo.ok
            ? `\n\n💰 DEMO ORDER\n${demo.detail}`
            : `\n\n⚠️ DEMO: ${demo.detail}`;
        } catch (err) {
          textOut += `\n\n⚠️ DEMO ERROR: ${
            err instanceof Error ? err.message : "error"
          }`;
        }
      }
      const pub = await publishAnalysis(textOut, { dm: true });
      if (pub.channelMessageId && a.signalId) {
        await updateSignal(a.signalId, {
          channel_message_id: pub.channelMessageId,
        });
      }
      if (pub.delivered) posted += 1;
      if (pub.errors.length) {
        skipReasons.push(`${a.pair} warn: ${pub.errors.join(" | ")}`);
      }
    }
    let summary = `Terminé: ${posted} publiée(s), ${skipReasons.length} ignorée(s).`;
    if (skipReasons.length) summary += "\n" + skipReasons.join("\n");
    await reply(chatId, summary);
  } catch (err) {
    console.error("analyze failed", err);
    await reply(
      chatId,
      `Erreur analyse: ${err instanceof Error ? err.message : "inconnu"}`
    );
  }
}

export async function handleUpdate(update: {
  message?: TgMessage;
  channel_post?: TgMessage;
}): Promise<void> {
  const msg = update.message || update.channel_post;
  if (!msg?.text) return;
  const text = msg.text.trim();
  if (!text.startsWith("/")) return;

  const [rawCmd, ...args] = text.split(/\s+/);
  const cmd = rawCmd.split("@")[0].toLowerCase();
  const chatId = msg.chat.id;
  const userId = msg.from?.id;

  try {
    switch (cmd) {
      case "/start":
      case "/help":
        await reply(
          chatId,
          [
            "Ben Dev Trade Bot — analyses auto",
            "",
            "Envoie les commandes en DISCUSSION PRIVÉE avec le bot",
            "(pas dans le canal).",
            "",
            "Commandes:",
            "/stats — perf",
            "/open — trades ouverts",
            "/rules — règles",
            "",
            "Admin:",
            "/analyse — lance une analyse maintenant",
            "/analyze — pareil (anglais)",
            "/demo — compte Binance Futures démo",
            "/close <id> <tp1|tp2|sl|be>",
            "/learn — apprentissage",
            "/pause — pause 6h",
            "/resume — retire la pause",
          ].join("\n")
        );
        return;

      case "/stats": {
        const stats = await computeStats(30);
        await reply(chatId, formatStats(stats));
        return;
      }

      case "/open": {
        const rows = await listOpenSignals();
        if (!rows.length) {
          await reply(chatId, "Aucun trade ouvert.");
          return;
        }
        await reply(
          chatId,
          "Ouverts:\n" +
            rows
              .map(
                (r) =>
                  `#${r.id} ${r.direction} ${r.pair} ${r.timeframe} (${r.status})`
              )
              .join("\n")
        );
        return;
      }

      case "/rules": {
        const rules = await getRules();
        const lines = Object.entries(rules)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k} = ${v}`);
        await reply(chatId, "Règles:\n" + lines.join("\n"));
        return;
      }

      case "/analyze":
      case "/analyse": {
        if (!isAdmin(userId)) {
          await reply(
            chatId,
            `Accès admin requis.\nTon id: ${userId ?? "inconnu"}\nÉcris au bot en privé (@Ben_dev_trade_bot), pas dans le canal.`
          );
          return;
        }
        await runForcedAnalyze(chatId);
        return;
      }

      case "/close": {
        if (!isAdmin(userId)) {
          await reply(chatId, "Accès admin requis.");
          return;
        }
        if (args.length < 2) {
          await reply(
            chatId,
            "Usage: /close <id> <tp1|tp2|sl|be|closed|cancelled> [R]"
          );
          return;
        }
        const id = Number(args[0]);
        const event = args[1];
        const customR = args[2] !== undefined ? Number(args[2]) : undefined;
        const { signal, status } = await resolveSignal(id, event, customR);
        if (!signal) {
          await reply(chatId, status);
          return;
        }
        const msgOut = formatUpdate(signal, status, signal.result_r);
        await reply(chatId, msgOut);
        await publishAnalysis(msgOut);
        return;
      }

      case "/learn": {
        if (!isAdmin(userId)) {
          await reply(chatId, "Accès admin requis.");
          return;
        }
        const sub = (args[0] || "").toLowerCase();
        if (sub === "freeze") {
          await setRules({ learning_enabled: 0 });
          await reply(chatId, "Learning freeze ON.");
          return;
        }
        if (sub === "unfreeze") {
          await setRules({ learning_enabled: 1 });
          await reply(chatId, "Learning freeze OFF.");
          return;
        }
        if (sub === "status") {
          const st = await learnerStatus();
          const rules = Object.entries(st.rules)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n");
          const recent =
            st.recent
              .map((r) => `- ${r.created_at}: ${r.summary}`)
              .join("\n") || "(vide)";
          await reply(
            chatId,
            `Learning: ${st.enabled ? "ON" : "OFF"}\nPause: ${st.pausedUntil || "non"}\n\nRègles:\n${rules}\n\nDerniers runs:\n${recent}`
          );
          return;
        }
        const report = await runLearner(30);
        await reply(
          chatId,
          `Learn run\n\n${report.summary}\n` +
            report.insights.map((i) => `• ${i}`).join("\n")
        );
        return;
      }

      case "/pause": {
        if (!isAdmin(userId)) {
          await reply(chatId, "Accès admin requis.");
          return;
        }
        const until = new Date(Date.now() + 6 * 3600_000).toISOString();
        await setMeta("paused_until", until);
        await reply(chatId, `Pause analyses jusqu'à ${until}`);
        return;
      }

      case "/resume": {
        if (!isAdmin(userId)) {
          await reply(chatId, "Accès admin requis.");
          return;
        }
        await setMeta("paused_until", "");
        await reply(chatId, "Pause retirée.");
        return;
      }

      case "/demo": {
        if (!isAdmin(userId)) {
          await reply(chatId, "Accès admin requis.");
          return;
        }
        await reply(chatId, await demoStatusText());
        return;
      }

      case "/ping":
        await reply(
          chatId,
          `pong — chat ${chatId} — user ${userId ?? "?"} — admin=${isAdmin(userId)}`
        );
        return;

      default:
        await reply(
          chatId,
          `Commande inconnue: ${cmd}\nEnvoie /start pour l'aide.`
        );
    }
  } catch (err) {
    console.error("handleUpdate error", err);
    await reply(
      chatId,
      `Erreur: ${err instanceof Error ? err.message : "inconnu"}`
    );
  }
}
