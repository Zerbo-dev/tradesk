"use client";

import { useEffect, useState } from "react";

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
  totalClosedTrades: number;
  winrate: number | null;
  avgR: number;
  sumR: number;
  maxDrawdownR: number;
};

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
const DERIV_PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

export default function BacktestPage() {
  const [source, setSource] = useState<"forex" | "deriv">("deriv");
  const [pairs, setPairs] = useState<string[]>([]);
  const [pair, setPair] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [days, setDays] = useState(180);
  const [cache, setCache] = useState<{ cached: boolean; bars: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkCache() {
    if (source !== "deriv") return;
    const res = await fetch(`/api/admin/backtest?source=deriv-status&pair=${pair}&timeframe=${timeframe}`);
    const data = await res.json();
    if (data.ok) setCache(data);
  }

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair, timeframe, days }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setError(data.error || "Échec téléchargement");
      else await checkCache();
    } catch {
      setError("Erreur réseau");
    } finally {
      setDownloading(false);
    }
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/backtest?source=${source}&pair=${pair}&timeframe=${timeframe}`);
      const data = await res.json();
      if (!res.ok || !data.ok) setError(data.error || "Échec");
      else {
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
    if (source === "deriv") {
      setPair((p) => (DERIV_PAIRS.includes(p) ? p : "BTCUSDT"));
      checkCache();
    } else {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (source === "deriv") checkCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, timeframe]);

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Backtest</h1>
      </div>

      <div className="banner banner-info">
        Rejoue la vraie logique du bot crypto (EMA20/50 + RSI + pullback), en appliquant
        les mêmes règles que le live (page Apprentissage) : confiance minimum, cooldown,
        limite de trades/jour, pause après pertes d&apos;affilée. Deriv = vraies paires du
        bot (BTC/ETH/SOL). Forex = dataset de référence (7 majeures).
      </div>

      <section className="card">
        <label className="field-label" style={{ marginTop: 0 }}>Source</label>
        <select className="input" value={source} onChange={(e) => setSource(e.target.value as "forex" | "deriv")}>
          <option value="deriv">Deriv — vraies paires du bot</option>
          <option value="forex">Forex historique (référence)</option>
        </select>

        <div className="row" style={{ marginTop: 4 }}>
          <div style={{ flex: 1 }}>
            <label className="field-label">Paire</label>
            <select className="input" value={pair} onChange={(e) => setPair(e.target.value)}>
              {(source === "deriv" ? DERIV_PAIRS : pairs.length ? pairs : [pair]).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="field-label">Timeframe</label>
            <select className="input" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </div>
        </div>

        {source === "deriv" && (
          <div style={{ marginTop: 10, padding: 12, background: "var(--bg-elevated)", borderRadius: 9 }}>
            <div className="row">
              <span style={{ fontSize: 12.5 }}>
                {cache?.cached ? `✅ En cache : ${cache.bars} bougies` : "⚠️ Aucun historique en cache"}
              </span>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <input type="number" className="input" style={{ width: 90 }} value={days} onChange={(e) => setDays(Number(e.target.value))} />
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>jours</span>
              <button className="btn" onClick={download} disabled={downloading}>
                {downloading ? "Téléchargement..." : "Télécharger l'historique"}
              </button>
            </div>
            <p className="field-help">
              Connexion publique séparée de la session de trading — n&apos;interrompt jamais un trade en cours.
            </p>
          </div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={run} disabled={loading}>
          {loading ? "Calcul..." : "Lancer le backtest"}
        </button>
        {error && <p className="toast toast-err" style={{ marginTop: 10 }}>{error}</p>}
      </section>

      {result && (
        <section className="card">
          <h2 className="card-title">{result.pair} · {result.timeframe} · {result.bars} bougies</h2>
          <div className="stat-line"><span>Trades clos (total)</span><b>{result.totalClosedTrades}</b></div>
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
            Derniers trades affichés ({result.trades.length} sur {result.totalClosedTrades} au total)
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
    </>
  );
}
