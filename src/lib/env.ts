function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function normalizeChannelId(raw?: string): string | undefined {
  if (!raw) return undefined;
  let id = raw.trim().replace(/^canal\s*/i, "");
  if (!id) return undefined;
  if (!id.startsWith("-")) id = `-${id}`;
  return id;
}

export function getEnv() {
  const adminRaw = required("ADMIN_IDS");
  const adminIds = new Set(
    adminRaw
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number(x))
  );

  return {
    telegramToken: required("TELEGRAM_BOT_TOKEN"),
    adminIds,
    signalsChannelId: normalizeChannelId(optional("SIGNALS_CHANNEL_ID")),
    /** Canal dédié SMC (XAUUSD / V100) — ne touche PAS au canal crypto EMA */
    smcChannelId: normalizeChannelId(
      optional("SMC_CHANNEL_ID") || optional("SIGNALS_SMC_CHANNEL_ID")
    ),
    cronSecret: required("CRON_SECRET"),
    supabaseUrl: required("SUPABASE_URL"),
    supabaseAnonKey: required("SUPABASE_ANON_KEY"),
    geminiApiKey: optional("GEMINI_API_KEY"),
    pairs: (optional("ANALYZE_PAIRS") || "BTCUSDT,ETHUSDT,SOLUSDT")
      .split(/[,;\s]+/)
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean),
    timeframe: optional("ANALYZE_TIMEFRAME") || "1h",
    /** Anti-spam between posts for the same pair (match your cron, e.g. 5 → use 4). */
    cooldownMinutes: Number(optional("ANALYZE_COOLDOWN_MINUTES") || 4),
    autoExpireHours: Number(optional("AUTO_EXPIRE_HOURS") || 24),
    /** Anti-spam SMC (même FVG/OTE) */
    smcCooldownMinutes: Number(optional("SMC_COOLDOWN_MINUTES") || 45),
    /** Poster le message "Scan terminé" si aucun setup (0=off) */
    smcPostEmpty: Number(optional("SMC_POST_EMPTY") || 0) >= 1,
    /** Exécution ordres demo (Deriv ou Binance — argent fictif) */
    demoExecution: (optional("DEMO_EXECUTION") || "false").toLowerCase() === "true",
    /** auto | deriv | binance — auto = Deriv si token, sinon Binance */
    demoProvider: optional("DEMO_PROVIDER") || "auto",
    /** Legacy PAT — plus utilisé pour l'auth des endpoints REST Deriv
     * (uniquement valide sur bulk-purchase). Conservé pour rétro-compat. */
    derivApiToken: optional("DERIV_API_TOKEN"),
    derivAppId: optional("DERIV_APP_ID") || "1089",
    /** OAuth2 + PKCE — requis pour l'exécution démo Deriv (nouvelle API). */
    derivOauthRedirectUri: optional("DERIV_OAUTH_REDIRECT_URI"),
    derivOauthScope: optional("DERIV_OAUTH_SCOPE") || "trade",
    /** DOUBLE VERROU réel — voir demo/accountMode.ts. Les deux doivent
     * être présentes pour trader en argent réel, sinon reste en démo. */
    derivAccountType: (optional("DERIV_ACCOUNT_TYPE") || "demo").toLowerCase(),
    realTradingConfirmed:
      (optional("REAL_TRADING_CONFIRMED") || "false").toLowerCase() === "true",
    binanceDemoKey: optional("BINANCE_DEMO_API_KEY"),
    binanceDemoSecret: optional("BINANCE_DEMO_API_SECRET"),
    demoNotionalUsdt: Number(optional("DEMO_NOTIONAL_USDT") || 50),
    demoLeverage: Number(optional("DEMO_LEVERAGE") || 5),
  };
}

export type AppEnv = ReturnType<typeof getEnv>;
