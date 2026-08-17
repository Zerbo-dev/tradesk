"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./admin.css";

type AppSettings = {
  analyzePairs: string[];
  analyzeTimeframe: string;
  analyzeCooldownMinutes: number;
  autoExpireHours: number;
  smcCooldownMinutes: number;
  smcPostEmpty: boolean;
  smcSelectorThreshold: number;
  demoExecution: boolean;
  demoProvider: "auto" | "deriv" | "binance";
  demoNotionalUsdt: number;
  demoLeverage: number;
  derivAccountType: "demo" | "real";
  realTradingConfirmed: boolean;
  demoOnePositionPerSymbol: boolean;
  cryptoSignalTemplate: string;
  xauSignalTemplate: string;
  v100SignalTemplate: string;
};

type StatusResponse = {
  ok: boolean;
  enabled: boolean;
  realMode: boolean;
  account?: { walletBalance: number; availableBalance: number; unrealizedProfit: number } | null;
  positions?: { symbol: string; entryPrice: number; unrealizedProfit: number }[];
  error?: string;
};

const TEMPLATE_TOKENS: Record<"cryptoSignalTemplate" | "xauSignalTemplate" | "v100SignalTemplate", string[]> = {
  cryptoSignalTemplate: [
    "pair", "timeframe", "direction", "directionEmoji", "price", "ema20", "ema50",
    "rsi", "changePct", "entryLow", "entryHigh", "stopLoss", "tp1", "tp2",
    "tradeLines", "setup", "confidenceStars", "rationale", "signalIdLine",
  ],
  xauSignalTemplate: [
    "direction", "directionEmoji", "timeframe", "setup", "entryLow", "entryHigh",
    "stopLoss", "tp1", "tp2", "tp3", "rr", "time",
  ],
  v100SignalTemplate: [
    "direction", "directionEmoji", "timeframe", "setup", "oteLow", "oteHigh",
    "entryLow", "entryHigh", "stopLoss", "slNote", "tp1", "tp2", "tp3", "rr",
    "time", "confluence",
  ],
};

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className={`switch ${on ? "on" : ""}`}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
    />
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pairsInput, setPairsInput] = useState("");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realConfirmStep, setRealConfirmStep] = useState(false);

  async function load() {
    const [sRes, stRes] = await Promise.all([
      fetch("/api/admin/settings").then((r) => r.json()),
      fetch("/api/admin/status").then((r) => r.json()),
    ]);
    if (sRes.ok) {
      setSettings(sRes.settings);
      setPairsInput(sRes.settings.analyzePairs.join(", "));
    }
    setStatus(stRes);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(patch: Partial<AppSettings>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Échec de sauvegarde");
      } else {
        setSettings(data.settings);
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2000);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (!settings) {
    return (
      <div className="admin-root">
        <main className="admin-shell">Chargement...</main>
      </div>
    );
  }

  const realModeActive = settings.derivAccountType === "real" && settings.realTradingConfirmed;

  return (
    <div className="admin-root">
      <main className="admin-shell">
        <div className="admin-topbar">
          <div className="admin-brand">
            <span className="dot" />
            TradeSk Admin
          </div>
          <button onClick={logout} className="btn btn-ghost">Déconnexion</button>
        </div>

        {realModeActive && (
          <div className="banner banner-danger">
            🔴🔴🔴 TRADING RÉEL ACTIF — ARGENT VÉRITABLE 🔴🔴🔴
          </div>
        )}

        {(savedAt || saving || error) && (
          <div className={`toast ${error ? "toast-err" : "toast-ok"}`}>
            {error || (saving ? "Sauvegarde..." : "Enregistré ✓")}
          </div>
        )}

        <section className="card">
          <h2 className="card-title">
            Statut compte
            {status?.enabled && (
              <span className={`pill ${status.realMode ? "pill-real" : "pill-demo"}`}>
                {status.realMode ? "réel" : "demo"}
              </span>
            )}
          </h2>
          {!status?.enabled && <p className="card-sub">Exécution démo/réelle désactivée.</p>}
          {status?.enabled && status.error && (
            <p className="toast toast-err">Erreur : {status.error}</p>
          )}
          {status?.enabled && status.account && (
            <div>
              <div className="stat-line"><span>Solde</span><b>{status.account.walletBalance.toFixed(2)}</b></div>
              <div className="stat-line"><span>Disponible</span><b>{status.account.availableBalance.toFixed(2)}</b></div>
              <div className="stat-line">
                <span>PnL non réalisé</span>
                <b style={{ color: status.account.unrealizedProfit >= 0 ? "var(--green)" : "var(--red)" }}>
                  {status.account.unrealizedProfit >= 0 ? "+" : ""}
                  {status.account.unrealizedProfit.toFixed(2)}
                </b>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="field-label" style={{ margin: "0 0 6px" }}>
                  Positions ouvertes ({status.positions?.length ?? 0})
                </div>
                {status.positions?.map((p, i) => (
                  <div key={i} className="pos-item">
                    • {p.symbol} @ {p.entryPrice} (
                    {p.unrealizedProfit >= 0 ? "+" : ""}
                    {p.unrealizedProfit.toFixed(2)})
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={load} className="btn" style={{ marginTop: 14 }}>Rafraîchir</button>
        </section>

        <section className="card">
          <h2 className="card-title">Bot crypto</h2>
          <p className="card-sub">BTC/ETH/SOL... via Binance Futures</p>

          <label className="field-label">Paires tradées</label>
          <input
            className="input"
            value={pairsInput}
            onChange={(e) => setPairsInput(e.target.value)}
            onBlur={() =>
              save({
                analyzePairs: pairsInput.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean),
              })
            }
            placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
          />
          <p className="field-help">Séparées par des virgules.</p>

          <label className="field-label">Timeframe</label>
          <select
            className="input"
            value={settings.analyzeTimeframe}
            onChange={(e) => save({ analyzeTimeframe: e.target.value })}
          >
            {["15m", "30m", "1h", "2h", "4h", "1d"].map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>

          <label className="field-label">Cooldown entre 2 signaux (minutes)</label>
          <input
            type="number" className="input"
            value={settings.analyzeCooldownMinutes}
            onChange={(e) => setSettings({ ...settings, analyzeCooldownMinutes: Number(e.target.value) })}
            onBlur={() => save({ analyzeCooldownMinutes: settings.analyzeCooldownMinutes })}
          />

          <label className="field-label">Expiration auto d&apos;un signal (heures)</label>
          <input
            type="number" className="input"
            value={settings.autoExpireHours}
            onChange={(e) => setSettings({ ...settings, autoExpireHours: Number(e.target.value) })}
            onBlur={() => save({ autoExpireHours: settings.autoExpireHours })}
          />
        </section>

        <section className="card">
          <h2 className="card-title">Bot SMC classique</h2>
          <p className="card-sub">XAUUSD / V100 — publication continue</p>

          <label className="field-label">Cooldown anti-spam (minutes)</label>
          <input
            type="number" className="input"
            value={settings.smcCooldownMinutes}
            onChange={(e) => setSettings({ ...settings, smcCooldownMinutes: Number(e.target.value) })}
            onBlur={() => save({ smcCooldownMinutes: settings.smcCooldownMinutes })}
          />

          <div className="toggle-row" style={{ marginTop: 14 }}>
            <div>
              <div className="toggle-label">Poster &quot;scan terminé&quot; même sans setup</div>
            </div>
            <Toggle on={settings.smcPostEmpty} onChange={(v) => save({ smcPostEmpty: v })} />
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Sélecteur SMC</h2>
          <p className="card-sub">3 créneaux/jour, publication score-gated</p>

          <label className="field-label">Seuil de publication immédiate (0-100)</label>
          <input
            type="number" className="input"
            value={settings.smcSelectorThreshold}
            onChange={(e) => setSettings({ ...settings, smcSelectorThreshold: Number(e.target.value) })}
            onBlur={() => save({ smcSelectorThreshold: settings.smcSelectorThreshold })}
          />
          <p className="field-help">
            Un setup ≥ ce score est publié immédiatement. Sinon, le meilleur setup du créneau
            est publié en fin de fenêtre.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">Exécution des trades</h2>

          <div className="toggle-row">
            <div className="toggle-label">Exécution automatique</div>
            <Toggle on={settings.demoExecution} onChange={(v) => save({ demoExecution: v })} />
          </div>
          <div className="toggle-row">
            <div>
              <div className="toggle-label">1 position max par symbole</div>
              <div className="toggle-sub">Anti-doublon — désactiver n&apos;est pas recommandé.</div>
            </div>
            <Toggle
              on={settings.demoOnePositionPerSymbol}
              onChange={(v) => save({ demoOnePositionPerSymbol: v })}
            />
          </div>

          <label className="field-label">Provider</label>
          <select
            className="input"
            value={settings.demoProvider}
            onChange={(e) => save({ demoProvider: e.target.value as AppSettings["demoProvider"] })}
          >
            <option value="auto">auto (Deriv en priorité)</option>
            <option value="deriv">deriv</option>
            <option value="binance">binance</option>
          </select>

          <label className="field-label">Montant par trade</label>
          <input
            type="number" className="input"
            value={settings.demoNotionalUsdt}
            onChange={(e) => setSettings({ ...settings, demoNotionalUsdt: Number(e.target.value) })}
            onBlur={() => save({ demoNotionalUsdt: settings.demoNotionalUsdt })}
          />

          <label className="field-label">Levier / multiplicateur</label>
          <input
            type="number" className="input"
            value={settings.demoLeverage}
            onChange={(e) => setSettings({ ...settings, demoLeverage: Number(e.target.value) })}
            onBlur={() => save({ demoLeverage: settings.demoLeverage })}
          />
          <p className="field-help">
            Pour Deriv Multipliers, ajusté automatiquement à la valeur acceptée la plus proche.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">Templates Telegram</h2>
          <p className="card-sub">
            Tokens <code>{"{comme_ça}"}</code> remplacés au moment de l&apos;envoi. Vide = format par défaut.
          </p>

          {(
            [
              ["cryptoSignalTemplate", "Signal bot crypto (BTC/ETH/SOL...)"],
              ["xauSignalTemplate", "Signal XAUUSD (SMC)"],
              ["v100SignalTemplate", "Signal V100 (SMC)"],
            ] as const
          ).map(([key, title]) => (
            <div key={key} style={{ marginTop: 16 }}>
              <div className="row">
                <label className="field-label" style={{ margin: 0 }}>{title}</label>
                <button
                  className="reset-link"
                  onClick={() => save({ [key]: "" } as Partial<AppSettings>)}
                >
                  Réinitialiser au défaut
                </button>
              </div>
              <textarea
                className="input"
                value={settings[key]}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                onBlur={() => save({ [key]: settings[key] } as Partial<AppSettings>)}
              />
              <p className="field-help">
                Tokens dispo : {TEMPLATE_TOKENS[key].map((t) => `{${t}}`).join(", ")}
              </p>
            </div>
          ))}
        </section>

        <section className="card danger">
          <h2 className="card-title" style={{ color: "var(--red-bright)" }}>⚠️ Zone dangereuse — Argent réel</h2>
          <p className="card-sub">
            Les DEUX réglages ci-dessous doivent être activés ensemble pour trader en argent
            réel. Un seul suffit à rester en sécurité en démo.
          </p>

          <label className="field-label">Type de compte</label>
          <select
            className="input"
            value={settings.derivAccountType}
            onChange={(e) => {
              if (e.target.value === "real" && !realConfirmStep) {
                setRealConfirmStep(true);
                return;
              }
              save({ derivAccountType: e.target.value as AppSettings["derivAccountType"] });
              setRealConfirmStep(false);
            }}
          >
            <option value="demo">demo</option>
            <option value="real">real</option>
          </select>

          {realConfirmStep && (
            <div className="banner banner-danger" style={{ marginTop: 12, textAlign: "left" }}>
              <p style={{ margin: "0 0 10px" }}>Confirme : tu vas activer le compte RÉEL (argent véritable).</p>
              <button
                className="btn"
                style={{ background: "#fff", color: "var(--red)", marginRight: 8 }}
                onClick={() => { save({ derivAccountType: "real" }); setRealConfirmStep(false); }}
              >
                Oui, je confirme
              </button>
              <button
                className="btn btn-ghost"
                style={{ borderColor: "#fff", color: "#fff" }}
                onClick={() => setRealConfirmStep(false)}
              >
                Annuler
              </button>
            </div>
          )}

          <div className="toggle-row" style={{ marginTop: 14 }}>
            <div className="toggle-label">Je confirme vouloir trader en argent réel</div>
            <Toggle
              on={settings.realTradingConfirmed}
              onChange={(v) => {
                if (v && !confirm("Confirmer l'activation du trading en argent RÉEL ?")) return;
                save({ realTradingConfirmed: v });
              }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
