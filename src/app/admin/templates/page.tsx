"use client";

import { useEffect, useState } from "react";

type Templates = {
  cryptoSignalTemplate: string;
  xauSignalTemplate: string;
  v100SignalTemplate: string;
  orderOpenedTemplate: string;
  orderClosedTemplate: string;
  orderErrorTemplate: string;
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
  orderOpenedTemplate: ["realBadge", "direction", "pair", "qty", "entryPrice"],
  orderClosedTemplate: ["realBadge", "pair", "direction", "pnl", "rMultiple"],
  orderErrorTemplate: ["realBadge", "pair", "detail"],
};

const SAMPLE_DATA: Record<string, Record<string, string>> = {
  cryptoSignalTemplate: {
    pair: "BTCUSDT", timeframe: "1h", direction: "LONG", directionEmoji: "🟢",
    price: "64250.5", ema20: "64100", ema50: "63800", rsi: "58.2", changePct: "+1.3",
    entryLow: "64100", entryHigh: "64300", stopLoss: "63900", tp1: "64600", tp2: "64900",
    tradeLines: "Entrée : 64100 – 64300\nSL : 63900\nTP1 : 64600\nTP2 : 64900",
    setup: "trend_pullback", confidenceStars: "★★★★☆",
    rationale: "EMA20 > EMA50 · RSI 58.2 · pullback tendance haussière",
    signalIdLine: "ID #1234",
  },
  xauSignalTemplate: {
    direction: "BUY", directionEmoji: "BUY 🟢", timeframe: "M5 avec confirmation M3",
    setup: "FVG + Liquidité", entryLow: "2650.10", entryHigh: "2652.40",
    stopLoss: "2648.00", tp1: "2655.00", tp2: "2658.50", tp3: "2662.00",
    rr: "1:2.0", time: "10/09/2026 14:30 GMT+0",
  },
  v100SignalTemplate: {
    direction: "SELL", directionEmoji: "SELL 🔴", timeframe: "M15",
    setup: "SMC - Zone OTE + FVG", oteLow: "612.40", oteHigh: "615.80",
    entryLow: "613.00", entryHigh: "614.20", stopLoss: "617.00", slNote: "*Au-dessus OTE*",
    tp1: "608.00", tp2: "604.50", tp3: "601.00", rr: "1:2.1",
    time: "10/09/2026 14:30 GMT+0", confluence: "OTE + FVG · biais M30/M15 SELL",
  },
  orderOpenedTemplate: {
    realBadge: "💰 DEMO", direction: "LONG", pair: "ETHUSDT", qty: "50", entryPrice: "2450.30",
  },
  orderClosedTemplate: {
    realBadge: "💰 DEMO", pair: "#1234 ETHUSDT", direction: "LONG",
    pnl: "+12.40 USDT", rMultiple: "~+1.80R",
  },
  orderErrorTemplate: {
    realBadge: "DEMO", pair: "ETHUSDT", detail: "Trading is not offered for this asset.",
  },
};

function renderPreview(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match
  );
}

export default function TemplatesPage() {
  const [settings, setSettings] = useState<Templates | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState<Record<string, boolean>>({});

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

  const groups: [string, string][] = [
    ["cryptoSignalTemplate", "Signal bot crypto (BTC/ETH/SOL...)"],
    ["xauSignalTemplate", "Signal XAUUSD (SMC)"],
    ["v100SignalTemplate", "Signal V100 (SMC)"],
    ["orderOpenedTemplate", "Ordre ouvert (démo + réel)"],
    ["orderClosedTemplate", "Ordre clôturé (recap)"],
    ["orderErrorTemplate", "Erreur d'ouverture d'ordre"],
  ];

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Templates Telegram</h1>
      </div>
      {savedAt && <div className="toast toast-ok">Enregistré ✓</div>}

      <div className="banner banner-info">
        Tokens <code>{"{comme_ça}"}</code> remplacés à l&apos;envoi. Vide = format par défaut.
        Clique &quot;Aperçu&quot; pour voir le rendu avec des données d&apos;exemple.
      </div>

      <section className="card">
        {groups.map(([key, title]) => (
          <div key={key} style={{ marginTop: 20 }}>
            <div className="row">
              <label className="field-label" style={{ margin: 0 }}>{title}</label>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="reset-link"
                  onClick={() => setShowPreview({ ...showPreview, [key]: !showPreview[key] })}
                >
                  {showPreview[key] ? "Masquer l'aperçu" : "Aperçu"}
                </button>
                <button className="reset-link" onClick={() => save({ [key]: "" } as Partial<Templates>)}>
                  Réinitialiser au défaut
                </button>
              </div>
            </div>
            <textarea
              className="input"
              value={settings[key] as string}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
              onBlur={() => save({ [key]: settings[key] } as Partial<Templates>)}
            />
            <p className="field-help">Tokens : {TEMPLATE_TOKENS[key].map((t) => `{${t}}`).join(", ")}</p>

            {showPreview[key] && (
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: "var(--bg-elevated)",
                  borderRadius: 9,
                  fontSize: 12.5,
                  fontFamily: "ui-monospace, monospace",
                  whiteSpace: "pre-wrap",
                  color: "var(--text-soft)",
                }}
              >
                {renderPreview(settings[key] as string, SAMPLE_DATA[key] || {})}
              </div>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
