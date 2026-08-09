/**
 * Usage: npx tsx scripts/set-webhook.ts https://your-app.vercel.app
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const base = process.argv[2];

if (!token || !base) {
  console.error(
    "Usage: TELEGRAM_BOT_TOKEN=xxx npx tsx scripts/set-webhook.ts https://xxx.vercel.app"
  );
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/telegram`;

async function main() {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, drop_pending_updates: true }),
    }
  );
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main();
