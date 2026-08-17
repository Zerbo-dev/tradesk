"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "../admin.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Échec de connexion");
        setLoading(false);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Erreur réseau");
      setLoading(false);
    }
  }

  return (
    <div className="admin-root">
      <main className="login-shell">
        <div className="admin-brand" style={{ marginBottom: 20 }}>
          <span className="dot" />
          TradeSk Admin
        </div>
        <div className="login-card">
          <form onSubmit={onSubmit}>
            <label className="field-label" style={{ marginTop: 0 }}>Mot de passe</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !password}
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 16, height: 40 }}
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
            {error && <p className="toast toast-err" style={{ marginTop: 14, width: "100%" }}>{error}</p>}
          </form>
        </div>
      </main>
    </div>
  );
}
