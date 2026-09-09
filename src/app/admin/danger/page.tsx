"use client";

import { useEffect, useState } from "react";

type Settings = {
  derivAccountType: "demo" | "real";
  realTradingConfirmed: boolean;
  [key: string]: unknown;
};

export default function DangerPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [realConfirmStep, setRealConfirmStep] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((d) => d.ok && setSettings(d.settings));
  }, []);

  async function save(patch: Partial<Settings>) {
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.ok) setSettings(data.settings);
  }

  if (!settings) return <p>Chargement...</p>;
  const realModeActive = settings.derivAccountType === "real" && settings.realTradingConfirmed;

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22, color: "var(--red-bright)" }}>🔴 Zone réelle</h1>
      </div>

      {realModeActive && <div className="banner banner-danger">🔴🔴🔴 TRADING RÉEL ACTIF — ARGENT VÉRITABLE 🔴🔴🔴</div>}

      <section className="card danger">
        <p className="card-sub">
          Les DEUX réglages ci-dessous doivent être activés ensemble pour trader en argent
          réel. Un seul suffit à rester en sécurité en démo.
        </p>

        <label className="field-label">Type de compte</label>
        <select
          className="input"
          value={settings.derivAccountType}
          onChange={(e) => {
            if (e.target.value === "real" && !realConfirmStep) { setRealConfirmStep(true); return; }
            save({ derivAccountType: e.target.value as Settings["derivAccountType"] });
            setRealConfirmStep(false);
          }}
        >
          <option value="demo">demo</option>
          <option value="real">real</option>
        </select>

        {realConfirmStep && (
          <div className="banner banner-danger" style={{ marginTop: 12, textAlign: "left" }}>
            <p style={{ margin: "0 0 10px" }}>Confirme : tu vas activer le compte RÉEL (argent véritable).</p>
            <button className="btn" style={{ background: "#fff", color: "var(--red)", marginRight: 8 }}
              onClick={() => { save({ derivAccountType: "real" }); setRealConfirmStep(false); }}>
              Oui, je confirme
            </button>
            <button className="btn btn-ghost" style={{ borderColor: "#fff", color: "#fff" }}
              onClick={() => setRealConfirmStep(false)}>
              Annuler
            </button>
          </div>
        )}

        <div className="toggle-row" style={{ marginTop: 14 }}>
          <div className="toggle-label">Je confirme vouloir trader en argent réel</div>
          <div
            className={`switch ${settings.realTradingConfirmed ? "on" : ""}`}
            role="switch"
            aria-checked={settings.realTradingConfirmed}
            onClick={() => {
              const v = !settings.realTradingConfirmed;
              if (v && !confirm("Confirmer l'activation du trading en argent RÉEL ?")) return;
              save({ realTradingConfirmed: v });
            }}
          />
        </div>
      </section>
    </>
  );
}
