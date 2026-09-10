"use client";

import { useEffect, useState } from "react";

type Trade = {
  source: "crypto" | "smc";
  id: string;
  pair: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: string;
  closedAt: string | null;
  outcome: "TP" | "SL" | "OPEN" | "UNKNOWN";
  realizedR: number | null;
  realizedPnl: number | null;
  mfePrice: number | null;
  mfeR: number | null;
};

type Stats = {
  total: number;
  winrate: number | null;
  sumR: number;
  avgR: number;
  tradesWithR: number;
};

export default function HistoryPage() {
  const [days, setDays] = useState(30);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/history?days=${days}`);
      const data = await res.json();
      if (!res.ok || !data.ok) setError(data.error || "Échec");
      else {
        setTrades(data.trades);
        setStats(data.stats);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Historique réel</h1>
      </div>

      <div className="banner banner-info">
        Vrais ordres placés chez Deriv (bot crypto + sélecteur SMC) — pas de simulation.
        Pour chaque SL touché, &quot;Meilleur point atteint&quot; montre le prix le plus
        favorable observé avant la clôture, via l&apos;historique réel Deriv : ça répond à
        &quot;si mon TP avait été placé là, ce trade aurait-il été gagnant ?&quot;
      </div>

      <section className="card">
        <div className="row">
          <div style={{ flex: 1 }}>
            <label className="field-label" style={{ marginTop: 0 }}>Période (jours)</label>
            <input type="number" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
          <button className="btn btn-primary" style={{ alignSelf: "flex-end", height: 36 }} onClick={load} disabled={loading}>
            {loading ? "Chargement..." : "Rafraîchir"}
          </button>
        </div>
        {error && <p className="toast toast-err" style={{ marginTop: 10 }}>{error}</p>}
      </section>

      {stats && (
        <section className="card">
          <h2 className="card-title">Résumé</h2>
          <div className="stat-line"><span>Trades clos (TP/SL)</span><b>{stats.total}</b></div>
          <div className="stat-line">
            <span>Winrate</span>
            <b>{stats.winrate === null ? "n/a" : `${Math.round(stats.winrate * 100)}%`}</b>
          </div>
          <div className="stat-line">
            <span>Somme R (crypto, {stats.tradesWithR} trades)</span>
            <b style={{ color: stats.sumR >= 0 ? "var(--green)" : "var(--red)" }}>
              {stats.sumR >= 0 ? "+" : ""}{stats.sumR.toFixed(2)}R
            </b>
          </div>
          <p className="field-help">
            Les trades SMC (XAUUSD/V100) ont un PnL en $ affiché par ligne, pas inclus dans
            cette somme R (unités différentes).
          </p>
        </section>
      )}

      <section className="card">
        <h2 className="card-title">Trades ({trades.length})</h2>
        {trades.length === 0 && <p className="card-sub">Aucun trade réel trouvé sur cette période.</p>}
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          {trades.map((t) => (
            <div key={t.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <div className="row">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {t.pair} <span className="pill" style={{ marginLeft: 6 }}>{t.source}</span>{" "}
                    {t.direction}
                  </div>
                  <div className="field-help">
                    {new Date(t.closedAt || t.openedAt).toLocaleString("fr-FR")} · entrée {t.entryPrice}
                    {t.stopLoss != null ? ` · SL ${t.stopLoss}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: t.outcome === "TP" ? "var(--green)" : t.outcome === "SL" ? "var(--red)" : "var(--text-faint)" }}>
                    {t.outcome}
                    {t.realizedR != null ? ` ${t.realizedR >= 0 ? "+" : ""}${t.realizedR.toFixed(2)}R` : ""}
                    {t.realizedR == null && t.realizedPnl != null ? ` ${t.realizedPnl >= 0 ? "+" : ""}${t.realizedPnl.toFixed(2)}$` : ""}
                  </div>
                  {t.outcome === "SL" && t.mfeR != null && (
                    <div style={{ fontSize: 11.5, color: "var(--amber, #d0a85e)", marginTop: 2 }}>
                      Meilleur point atteint : {t.mfePrice?.toFixed(5)} (~+{t.mfeR.toFixed(2)}R possible)
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
