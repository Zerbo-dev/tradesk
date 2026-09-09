"use client";

import { useEffect, useState } from "react";

type Rules = Record<string, number>;

export default function LearningPage() {
  const [rules, setRulesState] = useState<Rules | null>(null);
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [lossStreak, setLossStreak] = useState(0);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<{ summary: string; insights: string[] } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function load() {
    const res = await fetch("/api/admin/rules").then((r) => r.json());
    if (res.ok) {
      setRulesState(res.rules);
      setPausedUntil(res.pausedUntil || null);
      setLossStreak(res.lossStreak);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(patch: Rules) {
    const res = await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch }),
    });
    const data = await res.json();
    if (data.ok) {
      setRulesState(data.rules);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    }
  }

  async function runNow() {
    setRunning(true);
    setReport(null);
    try {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const data = await res.json();
      if (data.ok) {
        setRulesState(data.rules);
        setReport(data.report);
      }
    } finally {
      setRunning(false);
    }
  }

  async function unpause() {
    await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpause" }),
    });
    load();
  }

  if (!rules) return <p>Chargement...</p>;
  const frozen = rules.learning_enabled < 1;
  const isPaused = pausedUntil && new Date(pausedUntil) > new Date();

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Apprentissage</h1>
      </div>

      <div className="banner banner-info">
        Ces règles sont les mêmes que celles ajustées automatiquement par la commande
        Telegram <code>/learn</code> — modifier ici équivaut à modifier là-bas, aucune
        divergence possible.
      </div>

      {isPaused && (
        <div className="banner banner-danger">
          Bot en pause jusqu&apos;au {new Date(pausedUntil!).toLocaleString("fr-FR")}
          <div style={{ marginTop: 8 }}>
            <button className="btn" style={{ background: "#fff", color: "var(--red)" }} onClick={unpause}>
              Lever la pause maintenant
            </button>
          </div>
        </div>
      )}

      {savedAt && <div className="toast toast-ok">Enregistré ✓</div>}

      <section className="card">
        <h2 className="card-title">Lancer maintenant</h2>
        <div className="stat-line"><span>Loss streak actuelle</span><b>{lossStreak}</b></div>
        <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={runNow} disabled={running}>
          {running ? "Analyse..." : "Lancer /learn maintenant"}
        </button>
        {report && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <p style={{ color: "var(--text-soft)" }}>{report.summary}</p>
            {report.insights.map((ins, i) => (
              <p key={i} className="field-help">• {ins}</p>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Réglages</h2>

        <div className="toggle-row">
          <div>
            <div className="toggle-label">Apprentissage actif</div>
            <div className="toggle-sub">Désactivé = /learn et cette page ne changent plus rien automatiquement.</div>
          </div>
          <div
            className={`switch ${!frozen ? "on" : ""}`}
            role="switch"
            aria-checked={!frozen}
            onClick={() => save({ learning_enabled: frozen ? 1 : 0 })}
          />
        </div>

        <label className="field-label">Confiance minimum pour publier (2-5)</label>
        <input type="number" step="0.5" min={2} max={5} className="input" value={rules.min_confidence}
          onChange={(e) => setRulesState({ ...rules, min_confidence: Number(e.target.value) })}
          onBlur={() => save({ min_confidence: rules.min_confidence })} />

        <label className="field-label">Max trades/jour</label>
        <input type="number" min={1} className="input" value={rules.max_trades_per_day}
          onChange={(e) => setRulesState({ ...rules, max_trades_per_day: Number(e.target.value) })}
          onBlur={() => save({ max_trades_per_day: rules.max_trades_per_day })} />

        <label className="field-label">Pause après N pertes d&apos;affilée</label>
        <input type="number" min={1} className="input" value={rules.pause_after_loss_streak}
          onChange={(e) => setRulesState({ ...rules, pause_after_loss_streak: Number(e.target.value) })}
          onBlur={() => save({ pause_after_loss_streak: rules.pause_after_loss_streak })} />

        <label className="field-label">Durée de la pause (heures)</label>
        <input type="number" min={1} className="input" value={rules.pause_hours}
          onChange={(e) => setRulesState({ ...rules, pause_hours: Number(e.target.value) })}
          onBlur={() => save({ pause_hours: rules.pause_hours })} />

        <label className="field-label">Risque par trade par défaut (%)</label>
        <input type="number" step="0.1" min={0.1} className="input" value={rules.risk_pct_default}
          onChange={(e) => setRulesState({ ...rules, risk_pct_default: Number(e.target.value) })}
          onBlur={() => save({ risk_pct_default: rules.risk_pct_default })} />

        <label className="field-label">Risque par trade après une pause (%)</label>
        <input type="number" step="0.1" min={0.1} className="input" value={rules.risk_pct_after_drawdown}
          onChange={(e) => setRulesState({ ...rules, risk_pct_after_drawdown: Number(e.target.value) })}
          onBlur={() => save({ risk_pct_after_drawdown: rules.risk_pct_after_drawdown })} />
      </section>
    </>
  );
}
