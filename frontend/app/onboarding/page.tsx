"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { GraduationCap, BookOpen, Lock, ChevronRight, Check } from "lucide-react";

export default function Onboarding() {
  const { token, user, setUser, logout } = useAuthStore();
  const router = useRouter();
  const [role, setRole] = useState<"student" | "professor" | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      router.replace("/");
      return;
    }
    // Refresh user profile to ensure we have the latest finalized status
    api.get("/auth/me")
      .then(setUser)
      .catch(() => logout());
  }, [token, router, setUser, logout]);

  const handleFinalize = async () => {
    if (!role) return;
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/finalize-role", { role, password });
      if (user) {
        setUser({ ...user, role: res.role, role_finalized: true });
      }
      if (res.role === "professor") {
        router.push("/professor");
      } else {
        router.push("/chat");
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to set role. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-main)", overflow: "hidden" }}>
      <div className="glass-strong" style={{ width: "100%", maxWidth: 500, padding: 48, position: "relative", zIndex: 1 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12, textAlign: "center" }}>Complete your Profile</h1>
        <p style={{ color: "var(--text-secondary)", textAlign: "center", marginBottom: 40 }}>Welcome, {user?.name?.split(" ")[0]}. How will you be using FIWB today?</p>

        <div style={{ display: "grid", gap: 16, marginBottom: 32 }}>
          <button 
            onClick={() => { setRole("student"); setError(""); }}
            style={{ 
              display: "flex", alignItems: "center", gap: 16, padding: 24, borderRadius: 16, 
              background: role === "student" ? "rgba(139,92,246,0.1)" : "var(--bg-card)",
              border: `2px solid ${role === "student" ? "var(--accent)" : "var(--border)"}`,
              cursor: "pointer", textAlign: "left", transition: "all 0.2s ease"
            }}
          >
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
              <GraduationCap size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>I'm a Student</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Get a Socratic mentor and AI Digital Twin.</p>
            </div>
            {role === "student" && <Check size={20} color="var(--accent)" />}
          </button>

          <button 
            onClick={() => { setRole("professor"); setError(""); }}
            style={{ 
              display: "flex", alignItems: "center", gap: 16, padding: 24, borderRadius: 16, 
              background: role === "professor" ? "rgba(6,182,212,0.1)" : "var(--bg-card)",
              border: `2px solid ${role === "professor" ? "var(--accent-2)" : "var(--border)"}`,
              cursor: "pointer", textAlign: "left", transition: "all 0.2s ease"
            }}
          >
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(6,182,212,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-2)" }}>
              <BookOpen size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>I'm a Professor</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Access analytics, Viva tools, and heatmaps.</p>
            </div>
            {role === "professor" && <Check size={20} color="var(--accent-2)" />}
          </button>
        </div>

        {role === "professor" && (
          <div style={{ overflow: "hidden", marginBottom: 24 }}>
            <div style={{ position: "relative" }}>
              <Lock size={16} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input 
                type="password" 
                placeholder="Enter access password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: "100%", padding: "14px 14px 14px 44px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-card)", outline: "none", fontSize: 14 }}
              />
            </div>
          </div>
        )}

        {error && (
          <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 20, textAlign: "center", padding: "8px", background: "rgba(239,68,68,0.05)", borderRadius: 8 }}>
            {error}
          </p>
        )}

        <button 
          onClick={handleFinalize}
          disabled={!role || loading}
          className="btn-primary"
          style={{ width: "100%", padding: "16px", borderRadius: 14, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: (!role || loading) ? 0.6 : 1 }}
        >
          {loading ? "Saving..." : "Continue to Dashboard"}
          {!loading && <ChevronRight size={18} />}
        </button>
      </div>
    </div>
  );
}
