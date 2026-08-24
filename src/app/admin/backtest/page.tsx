"use client";

import { useEffect, useState } from "react";
import "../admin.css";

type Trade = {
  time: number;
  direction: "LONG" | "SHORT";
  entry: number;
  outcome: "TP" | "SL" | "OPEN_AT_END";
  r: number;
};
type Result = {
  pair: string;
  timeframe: string;
  bars: number;
  trades: Trade[];
  winrate: number | null;
  avgR: number;
  sumR: number;
  maxDrawdownR: number;
};

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

export default function BacktestPage() {
  const [pairs, setPairs] = useState<string[]>([]);
  const [pair, setPair] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("1h");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/backtest?pair=${pair}&timeframe=${timeframe}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Échec");
      } else {
        setPairs(data.pairs);
        setResult(data.result);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run();
  }, []);

  return (
    <div className="admin-root">
      <main className="admin-shell">
        <div className="admin-topbar">
          <div className="admin-brand"><span className="dot" />Backtest</div>
        </div>

        <div className="banner banner-info">
          Rejoue la vraie logique du bot crypto (EMA20/50 + RSI + pullback) sur données
          historiques réelles 2024. Paires forex majeures (pas les paires live du bot),
          pour valider la stratégie elle-même.
        </div>

        <section className="card">
          <div className="row">
            <div style={{ flex: 1 }}>
              <label className="field-label" style={{ marginTop: 0 }}>Paire</label>
              <select className="input" value={pair} onChange={(e) => setPair(e.target.value)}>
                {(pairs.length ? pairs : [pair]).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label" style={{ marginTop: 0 }}>Timeframe</label>
              <select className="input" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={run} disabled={loading}>
            {loading ? "Calcul..." : "Lancer le backtest"}
          </button>
          {error && <p className="toast toast-err" style={{ marginTop: 10 }}>{error}</p>}
        </section>

        {result && (
          <section className="card">
            <h2 className="card-title">
              {result.pair} · {result.timeframe} · {result.bars} bougies
            </h2>
            <div className="stat-line"><span>Trades clos</span><b>{result.trades.filter((t) => t.outcome !== "OPEN_AT_END").length}</b></div>
            <div className="stat-line">
              <span>Winrate</span>
              <b>{result.winrate === null ? "n/a" : `${Math.round(result.winrate * 100)}%`}</b>
            </div>
            <div className="stat-line">
              <span>R moyen</span>
              <b style={{ color: result.avgR >= 0 ? "var(--green)" : "var(--red)" }}>
                {result.avgR >= 0 ? "+" : ""}{result.avgR.toFixed(2)}R
              </b>
            </div>
            <div className="stat-line">
              <span>Somme R</span>
              <b style={{ color: result.sumR >= 0 ? "var(--green)" : "var(--red)" }}>
                {result.sumR >= 0 ? "+" : ""}{result.sumR.toFixed(2)}R
              </b>
            </div>
            <div className="stat-line"><span>Drawdown max</span><b>{result.maxDrawdownR.toFixed(2)}R</b></div>

            <div className="field-label" style={{ marginTop: 18 }}>
              Derniers trades ({Math.min(100, result.trades.length)})
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 8 }}>
              {result.trades.slice().reverse().map((t, i) => (
                <div key={i} className="pos-item" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{new Date(t.time).toISOString().slice(0, 10)} · {t.direction} @ {t.entry.toFixed(5)}</span>
                  <span style={{ color: t.r > 0 ? "var(--green)" : t.r < 0 ? "var(--red)" : "var(--text-faint)" }}>
                    {t.outcome} {t.r !== 0 ? `${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R` : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
