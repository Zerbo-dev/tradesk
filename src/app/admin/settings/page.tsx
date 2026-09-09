"use client";

import { useEffect, useState } from "react";

type AppSettings = {
  analyzePairs: string[];
  analyzeTimeframe: string;
  analyzeCooldownMinutes: number;
  autoExpireHours: number;
  cryptoPriceSource: "binance" | "deriv";
  smcCooldownMinutes: number;
  smcPostEmpty: boolean;
  smcSelectorThreshold: number;
  demoExecution: boolean;
  demoProvider: "auto" | "deriv" | "binance";
  demoNotionalUsdt: number;
  demoLeverage: number;
  demoOnePositionPerSymbol: boolean;
  [key: string]: unknown;
};

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <div className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} />;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pairsInput, setPairsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((d) => {
      if (d.ok) {
        setSettings(d.settings);
        setPairsInput(d.settings.analyzePairs.join(", "));
      }
    });
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
      if (!res.ok || !data.ok) setError(data.error || "Échec de sauvegarde");
      else {
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

  if (!settings) return <p>Chargement...</p>;

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Réglages bots</h1>
      </div>

      {(savedAt || saving || error) && (
        <div className={`toast ${error ? "toast-err" : "toast-ok"}`}>
          {error || (saving ? "Sauvegarde..." : "Enregistré ✓")}
        </div>
      )}

      <section className="card">
        <h2 className="card-title">Bot crypto</h2>
        <p className="card-sub">BTC/ETH/SOL...</p>

        <label className="field-label" style={{ marginTop: 0 }}>Paires tradées</label>
        <input
          className="input"
          value={pairsInput}
          onChange={(e) => setPairsInput(e.target.value)}
          onBlur={() => save({ analyzePairs: pairsInput.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean) })}
          placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
        />
        <p className="field-help">Séparées par des virgules.</p>

        <label className="field-label">Timeframe</label>
        <select className="input" value={settings.analyzeTimeframe} onChange={(e) => save({ analyzeTimeframe: e.target.value })}>
          {["15m", "30m", "1h", "2h", "4h", "1d"].map((tf) => <option key={tf} value={tf}>{tf}</option>)}
        </select>

        <label className="field-label">Cooldown entre 2 signaux (minutes)</label>
        <input type="number" className="input" value={settings.analyzeCooldownMinutes}
          onChange={(e) => setSettings({ ...settings, analyzeCooldownMinutes: Number(e.target.value) })}
          onBlur={() => save({ analyzeCooldownMinutes: settings.analyzeCooldownMinutes })} />

        <label className="field-label">Expiration auto d&apos;un signal (heures)</label>
        <input type="number" className="input" value={settings.autoExpireHours}
          onChange={(e) => setSettings({ ...settings, autoExpireHours: Number(e.target.value) })}
          onBlur={() => save({ autoExpireHours: settings.autoExpireHours })} />

        <label className="field-label">Source des prix</label>
        <select className="input" value={settings.cryptoPriceSource}
          onChange={(e) => save({ cryptoPriceSource: e.target.value as AppSettings["cryptoPriceSource"] })}>
          <option value="deriv">Deriv (même source que l&apos;exécution, recommandé)</option>
          <option value="binance">Binance</option>
        </select>
        <p className="field-help">Deriv évite l&apos;écart entre le prix du signal et celui de l&apos;exécution.</p>
      </section>

      <section className="card">
        <h2 className="card-title">Bot SMC classique</h2>
        <p className="card-sub">XAUUSD / V100 — publication continue</p>

        <label className="field-label" style={{ marginTop: 0 }}>Cooldown anti-spam (minutes)</label>
        <input type="number" className="input" value={settings.smcCooldownMinutes}
          onChange={(e) => setSettings({ ...settings, smcCooldownMinutes: Number(e.target.value) })}
          onBlur={() => save({ smcCooldownMinutes: settings.smcCooldownMinutes })} />

        <div className="toggle-row" style={{ marginTop: 14 }}>
          <div className="toggle-label">Poster &quot;scan terminé&quot; même sans setup</div>
          <Toggle on={settings.smcPostEmpty} onChange={(v) => save({ smcPostEmpty: v })} />
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Sélecteur SMC</h2>
        <p className="card-sub">3 créneaux/jour, publication score-gated</p>

        <label className="field-label" style={{ marginTop: 0 }}>Seuil de publication immédiate (0-100)</label>
        <input type="number" className="input" value={settings.smcSelectorThreshold}
          onChange={(e) => setSettings({ ...settings, smcSelectorThreshold: Number(e.target.value) })}
          onBlur={() => save({ smcSelectorThreshold: settings.smcSelectorThreshold })} />
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
          <Toggle on={settings.demoOnePositionPerSymbol} onChange={(v) => save({ demoOnePositionPerSymbol: v })} />
        </div>

        <label className="field-label">Provider</label>
        <select className="input" value={settings.demoProvider}
          onChange={(e) => save({ demoProvider: e.target.value as AppSettings["demoProvider"] })}>
          <option value="auto">auto (Deriv en priorité)</option>
          <option value="deriv">deriv</option>
          <option value="binance">binance</option>
        </select>

        <label className="field-label">Montant par trade</label>
        <input type="number" className="input" value={settings.demoNotionalUsdt}
          onChange={(e) => setSettings({ ...settings, demoNotionalUsdt: Number(e.target.value) })}
          onBlur={() => save({ demoNotionalUsdt: settings.demoNotionalUsdt })} />

        <label className="field-label">Levier / multiplicateur</label>
        <input type="number" className="input" value={settings.demoLeverage}
          onChange={(e) => setSettings({ ...settings, demoLeverage: Number(e.target.value) })}
          onBlur={() => save({ demoLeverage: settings.demoLeverage })} />
        <p className="field-help">Pour Deriv Multipliers, ajusté automatiquement à la valeur acceptée la plus proche.</p>
      </section>
    </>
  );
}
