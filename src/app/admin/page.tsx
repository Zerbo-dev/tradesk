"use client";

import { useEffect, useState } from "react";

type StatusResponse = {
  ok: boolean;
  enabled: boolean;
  realMode: boolean;
  account?: { walletBalance: number; availableBalance: number; unrealizedProfit: number } | null;
  positions?: { symbol: string; entryPrice: number; unrealizedProfit: number }[];
  error?: string;
};

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / range) * 28}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className="sparkline" viewBox="0 0 100 32" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={up ? "var(--green)" : "var(--red)"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  async function load() {
    const stRes = await fetch("/api/admin/status").then((r) => r.json());
    setStatus(stRes);
  }

  useEffect(() => {
    load();
  }, []);

  const positions = status?.positions ?? [];
  const totalUPnl = positions.reduce((s, p) => s + p.unrealizedProfit, 0);
  const walletHistory = status?.account
    ? [status.account.walletBalance - totalUPnl, status.account.walletBalance]
    : [];

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Dashboard</h1>
        {status?.enabled && (
          <span className={`pill ${status.realMode ? "pill-real" : "pill-demo"}`}>
            {status.realMode ? "🔴 réel" : "demo"}
          </span>
        )}
      </div>

      {status?.realMode && <div className="banner banner-danger">🔴 TRADING RÉEL ACTIF — ARGENT VÉRITABLE</div>}

      {!status?.enabled && (
        <div className="banner banner-info">
          Exécution désactivée. Active-la dans <a href="/admin/settings" style={{ color: "var(--green-bright)" }}>Réglages bots</a>.
        </div>
      )}

      {status?.enabled && status.error && <p className="toast toast-err">{status.error}</p>}

      {status?.enabled && status.account && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Solde</div>
            <div className="kpi-value">{status.account.walletBalance.toFixed(2)}</div>
            <Sparkline values={walletHistory} />
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Disponible</div>
            <div className="kpi-value">{status.account.availableBalance.toFixed(2)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">PnL non réalisé</div>
            <div className="kpi-value" style={{ color: totalUPnl >= 0 ? "var(--green)" : "var(--red)" }}>
              {totalUPnl >= 0 ? "+" : ""}{totalUPnl.toFixed(2)}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Positions ouvertes</div>
            <div className="kpi-value">{positions.length}</div>
          </div>
        </div>
      )}

      {positions.length > 0 && (
        <section className="card">
          <h2 className="card-title">Positions en cours</h2>
          {positions.map((p, i) => (
            <div key={i} className="stat-line">
              <span>{p.symbol} @ {p.entryPrice}</span>
              <b style={{ color: p.unrealizedProfit >= 0 ? "var(--green)" : "var(--red)" }}>
                {p.unrealizedProfit >= 0 ? "+" : ""}{p.unrealizedProfit.toFixed(2)}
              </b>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2 className="card-title">Accès rapide</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn" href="/admin/settings">Réglages bots</a>
          <a className="btn" href="/admin/templates">Templates Telegram</a>
          <a className="btn" href="/admin/subscribers">Abonnés</a>
          <a className="btn" href="/admin/backtest">Lancer un backtest</a>
        </div>
      </section>
    </>
  );
}
