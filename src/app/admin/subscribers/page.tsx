"use client";

import { useEffect, useState } from "react";

type Subscriber = {
  id: string;
  chatId: string;
  label: string;
  type: "channel" | "dm";
  feed: "crypto" | "smc" | "both";
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
};

export default function SubscribersPage() {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [chatId, setChatId] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<"channel" | "dm">("dm");
  const [feed, setFeed] = useState<"crypto" | "smc" | "both">("both");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/subscribers").then((r) => r.json());
    if (res.ok) setSubs(res.subscribers);
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    setError(null);
    if (!chatId.trim()) {
      setError("chat_id requis");
      return;
    }
    const res = await fetch("/api/admin/subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, label, type, feed, expiresAt: expiresAt || null }),
    });
    const data = await res.json();
    if (data.ok) {
      setSubs(data.subscribers);
      setChatId("");
      setLabel("");
      setExpiresAt("");
    } else {
      setError(data.error || "Échec");
    }
  }

  async function toggleActive(s: Subscriber) {
    const res = await fetch("/api/admin/subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id: s.id, patch: { active: !s.active } }),
    });
    const data = await res.json();
    if (data.ok) setSubs(data.subscribers);
  }

  async function del(id: string) {
    if (!confirm("Supprimer cet abonné ?")) return;
    const res = await fetch("/api/admin/subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await res.json();
    if (data.ok) setSubs(data.subscribers);
  }

  function isExpired(s: Subscriber) {
    return s.expiresAt ? new Date(s.expiresAt) < new Date() : false;
  }

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Abonnés</h1>
      </div>

      <div className="banner banner-info">
        Envoyés EN PLUS du canal principal — celui-ci n&apos;est pas affecté. Pour un chat
        privé (DM), l&apos;abonné doit d&apos;abord envoyer <code>/monid</code> au bot pour
        récupérer son chat_id et te le donner (Telegram interdit à un bot d&apos;écrire en
        premier à quelqu&apos;un).
      </div>

      <section className="card">
        <h2 className="card-title">Ajouter un abonné</h2>

        <label className="field-label" style={{ marginTop: 0 }}>chat_id</label>
        <input className="input" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789 ou -1001234567890" />

        <label className="field-label">Nom / repère</label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex: Jean D. (abo mensuel)" />

        <div className="row" style={{ marginTop: 4 }}>
          <div style={{ flex: 1 }}>
            <label className="field-label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as "channel" | "dm")}>
              <option value="dm">Chat privé (DM)</option>
              <option value="channel">Canal</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="field-label">Flux</label>
            <select className="input" value={feed} onChange={(e) => setFeed(e.target.value as typeof feed)}>
              <option value="both">Crypto + SMC</option>
              <option value="crypto">Crypto seul</option>
              <option value="smc">SMC seul</option>
            </select>
          </div>
        </div>

        <label className="field-label">Expire le (optionnel)</label>
        <input type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />

        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={add}>Ajouter</button>
        {error && <p className="toast toast-err" style={{ marginTop: 10 }}>{error}</p>}
      </section>

      <section className="card">
        <h2 className="card-title">Liste ({subs.length})</h2>
        {subs.length === 0 && <p className="card-sub">Aucun abonné.</p>}
        {subs.map((s) => {
          const expired = isExpired(s);
          return (
            <div key={s.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <div className="row">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {s.label} <span className="pill" style={{ marginLeft: 6 }}>{s.type}</span>{" "}
                    <span className="pill" style={{ marginLeft: 4 }}>{s.feed}</span>
                    {expired && <span className="pill pill-real" style={{ marginLeft: 4 }}>expiré</span>}
                  </div>
                  <div className="field-help">chat_id: {s.chatId}{s.expiresAt ? ` · expire ${s.expiresAt}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div className={`switch ${s.active && !expired ? "on" : ""}`} role="switch" onClick={() => toggleActive(s)} />
                  <button className="btn btn-ghost" onClick={() => del(s.id)}>Suppr.</button>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
