"use client";

import { useEffect, useState } from "react";

type Templates = {
  cryptoSignalTemplate: string;
  xauSignalTemplate: string;
  v100SignalTemplate: string;
  [key: string]: unknown;
};

const TEMPLATE_TOKENS: Record<string, string[]> = {
  cryptoSignalTemplate: [
    "pair", "timeframe", "direction", "directionEmoji", "price", "ema20", "ema50",
    "rsi", "changePct", "entryLow", "entryHigh", "stopLoss", "tp1", "tp2",
    "tradeLines", "setup", "confidenceStars", "rationale", "signalIdLine",
  ],
  xauSignalTemplate: ["direction", "directionEmoji", "timeframe", "setup", "entryLow", "entryHigh", "stopLoss", "tp1", "tp2", "tp3", "rr", "time"],
  v100SignalTemplate: ["direction", "directionEmoji", "timeframe", "setup", "oteLow", "oteHigh", "entryLow", "entryHigh", "stopLoss", "slNote", "tp1", "tp2", "tp3", "rr", "time", "confluence"],
};

export default function TemplatesPage() {
  const [settings, setSettings] = useState<Templates | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((d) => d.ok && setSettings(d.settings));
  }, []);

  async function save(patch: Partial<Templates>) {
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.ok) {
      setSettings(data.settings);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    }
  }

  if (!settings) return <p>Chargement...</p>;

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Templates Telegram</h1>
      </div>
      {savedAt && <div className="toast toast-ok">Enregistré ✓</div>}

      <section className="card">
        <p className="card-sub">
          Tokens <code>{"{comme_ça}"}</code> remplacés à l&apos;envoi. Vide = format par défaut.
        </p>

        {([
          ["cryptoSignalTemplate", "Signal bot crypto (BTC/ETH/SOL...)"],
          ["xauSignalTemplate", "Signal XAUUSD (SMC)"],
          ["v100SignalTemplate", "Signal V100 (SMC)"],
        ] as const).map(([key, title]) => (
          <div key={key} style={{ marginTop: 20 }}>
            <div className="row">
              <label className="field-label" style={{ margin: 0 }}>{title}</label>
              <button className="reset-link" onClick={() => save({ [key]: "" } as Partial<Templates>)}>
                Réinitialiser au défaut
              </button>
            </div>
            <textarea
              className="input"
              value={settings[key] as string}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
              onBlur={() => save({ [key]: settings[key] } as Partial<Templates>)}
            />
            <p className="field-help">Tokens : {TEMPLATE_TOKENS[key].map((t) => `{${t}}`).join(", ")}</p>
          </div>
        ))}
      </section>
    </>
  );
}
