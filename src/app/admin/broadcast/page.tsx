"use client";

import { useState } from "react";

export default function BroadcastPage() {
  const [feed, setFeed] = useState<"crypto" | "smc" | "both">("both");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!message.trim()) {
      setError("Message vide");
      return;
    }
    if (!confirm(`Envoyer ce message à tous les abonnés (${feed}) ?`)) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feed, message }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setError(data.error || "Échec");
      else {
        setResult({ sent: data.sent, failed: data.failed });
        setMessage("");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Broadcast</h1>
      </div>

      <div className="banner banner-info">
        Envoie un message manuel, immédiatement, à tes abonnés — pas lié à un signal
        automatique (ex: annonce, maintenance, actu).
      </div>

      <section className="card">
        <label className="field-label" style={{ marginTop: 0 }}>Destinataires</label>
        <select className="input" value={feed} onChange={(e) => setFeed(e.target.value as typeof feed)}>
          <option value="both">Tous les abonnés (crypto + SMC)</option>
          <option value="crypto">Abonnés crypto seulement</option>
          <option value="smc">Abonnés SMC seulement</option>
        </select>

        <label className="field-label">Message</label>
        <textarea
          className="input"
          style={{ minHeight: 140 }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ton message ici..."
        />

        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={send} disabled={sending}>
          {sending ? "Envoi..." : "Envoyer maintenant"}
        </button>

        {error && <p className="toast toast-err" style={{ marginTop: 10 }}>{error}</p>}
        {result && (
          <p className="toast toast-ok" style={{ marginTop: 10 }}>
            Envoyé à {result.sent} abonné(s).
            {result.failed.length > 0 && ` Échecs : ${result.failed.join(", ")}`}
          </p>
        )}
      </section>
    </>
  );
}
