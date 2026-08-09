export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Ben Dev Trade Bot</h1>
      <p style={{ color: "#444", lineHeight: 1.5 }}>
        Bot d&apos;analyses crypto automatiques pour Telegram. Les endpoints
        vivent sous <code>/api/*</code>.
      </p>
      <ul>
        <li>
          <code>POST /api/telegram</code> — webhook Telegram
        </li>
        <li>
          <code>POST /api/cron/analyze</code> — analyses auto (cron)
        </li>
        <li>
          <code>GET /api/health</code> — santé
        </li>
      </ul>
    </main>
  );
}
