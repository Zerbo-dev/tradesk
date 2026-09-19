"use client";

import { useEffect, useState } from "react";

type Admin = { id: string; chatId: string; label: string; createdAt: string };
type DerivStatus = { connected: boolean; expiresAt: number | null; expiresInSeconds: number | null; hasRefreshToken: boolean };

export default function TeamPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [chatId, setChatId] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [derivStatus, setDerivStatus] = useState<DerivStatus | null>(null);

  async function load() {
    const res = await fetch("/api/admin/admins").then((r) => r.json());
    if (res.ok) setAdmins(res.admins);
    const ds = await fetch("/api/admin/deriv-status").then((r) => r.json());
    if (ds.ok) setDerivStatus(ds.status);
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
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, label }),
    });
    const data = await res.json();
    if (data.ok) {
      setAdmins(data.admins);
      setChatId("");
      setLabel("");
    } else {
      setError(data.error || "Échec");
    }
  }

  async function del(id: string) {
    if (!confirm("Retirer cet admin ?")) return;
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await res.json();
    if (data.ok) setAdmins(data.admins);
  }

  const expiresInMin = derivStatus?.expiresInSeconds != null ? Math.round(derivStatus.expiresInSeconds / 60) : null;
  const soonExpired = expiresInMin !== null && expiresInMin < 10;

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ fontFamily: "var(--display)", fontSize: 22 }}>Équipe & connexions</h1>
      </div>

      <section className="card">
        <h2 className="card-title">Connexion Deriv</h2>
        {!derivStatus?.connected && (
          <>
            <p className="toast toast-err">Aucune session Deriv active — les ordres ne peuvent pas être passés.</p>
            <a className="btn btn-primary" href="/api/auth/deriv/start" style={{ display: "inline-block", marginTop: 8 }}>
              Se connecter à Deriv
            </a>
          </>
        )}
        {derivStatus?.connected && (
          <>
            <div className="stat-line">
              <span>Statut</span>
              <b style={{ color: soonExpired ? "var(--red)" : "var(--green)" }}>
                {soonExpired ? "⚠️ Expire bientôt" : "✅ Connecté"}
              </b>
            </div>
            <div className="stat-line">
              <span>Access token expire dans</span>
              <b>{expiresInMin !== null ? `${expiresInMin} min` : "n/a"}</b>
            </div>
            <div className="stat-line">
              <span>Refresh automatique</span>
              <b>{derivStatus.hasRefreshToken ? "✅ actif" : "⚠️ absent — reconnexion manuelle requise"}</b>
            </div>
            <p className="field-help">
              L&apos;access token se rafraîchit tout seul tant que le refresh token est valide.
              Si tu vois des erreurs répétées ou &quot;aucun refresh token&quot;, reconnecte-toi.
            </p>
            <a className="btn" href="/api/auth/deriv/start" style={{ display: "inline-block", marginTop: 8 }}>
              Se reconnecter
            </a>
          </>
        )}
        <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={load}>Rafraîchir</button>
      </section>

      <section className="card">
        <h2 className="card-title">Admins Telegram (alertes)</h2>
        <p className="card-sub">
          En plus de ADMIN_IDS (variable d&apos;env). Un admin doit d&apos;abord envoyer{" "}
          <code>/monid</code> au bot pour récupérer son chat_id.
        </p>

        <label className="field-label" style={{ marginTop: 0 }}>chat_id</label>
        <input className="input" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" />
        <label className="field-label">Nom</label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex: Ben (co-admin)" />
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={add}>Ajouter</button>
        {error && <p className="toast toast-err" style={{ marginTop: 10 }}>{error}</p>}

        <div style={{ marginTop: 16 }}>
          {admins.length === 0 && <p className="card-sub">Aucun admin supplémentaire.</p>}
          {admins.map((a) => (
            <div key={a.id} className="row" style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.label}</div>
                <div className="field-help">chat_id: {a.chatId}</div>
              </div>
              <button className="btn btn-ghost" onClick={() => del(a.id)}>Retirer</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
