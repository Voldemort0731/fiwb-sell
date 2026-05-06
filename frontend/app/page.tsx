"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";

function LoginInner() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setToken, setUser } = useAuthStore();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8002";

  const login = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async (codeResponse) => {
      setLoading(true);
      setError("");
      try {
        // Exchange code with backend
        const res = await api.post("/auth/login", { code: codeResponse.code });
        // Expected response: { token: "...", user: { ... } }
        setToken(res.token);
        setUser(res.user);
        
        // Ensure fresh user stats are fetched and we redirect
        const me = await api.get("/auth/me");
        setUser(me);
        if (me.role === "professor") router.push("/professor");
        else router.push("/chat");
      } catch (err: any) {
        console.error("Login failed:", err);
        setError("Failed to complete Google authentication.");
        setLoading(false);
      }
    },
    onError: (err) => {
      console.error("Google logic failed:", err);
      setError("Google sign-in popup failed or was blocked.");
    },
    scope: "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.announcements.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.readonly openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
  });

  return (
    <div style={{ position: "relative", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {/* Ambient orbs */}
      <div className="orb" style={{ width: 500, height: 500, background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)", top: "-100px", left: "-100px" }} />
      <div className="orb" style={{ width: 400, height: 400, background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)", bottom: "-80px", right: "-80px" }} />

      <div className="glass-strong slide-up" style={{ width: 440, padding: "48px 40px", textAlign: "center", position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, boxShadow: "0 8px 24px rgba(139,92,246,0.4)"
          }}>🧠</div>
          <span style={{ fontSize: 26, fontWeight: 700 }} className="gradient-text">FIWB</span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: "var(--text-primary)" }}>
          Welcome to your Digital Twin
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6, marginBottom: 36 }}>
          Your Neural Academic Assistant that evolves with every interaction — powered by Socratic mentoring and institutional intelligence.
        </p>

        {/* Features */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 36, textAlign: "left" }}>
          {[
            { icon: "🎓", label: "Syncs with Google Classroom" },
            { icon: "📁", label: "Indexes your Google Drive materials" },
            { icon: "🔮", label: "Builds a Digital Twin from your learning" },
            { icon: "⚡", label: "Streaming Socratic AI mentor" },
          ].map((f) => (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <span style={{ fontSize: 18 }}>{f.icon}</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{f.label}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => login()}
          disabled={loading}
          className="btn-primary"
          style={{ width: "100%", padding: "14px 20px", fontSize: 15, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: loading ? 0.7 : 1 }}
          id="google-login-btn"
        >
          {loading ? (
            <div style={{ width: 20, height: 20, border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {error && (
          <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12, padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </p>
        )}

        <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 20, lineHeight: 1.5, marginBottom: 24 }}>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          By continuing, you authorize FIWB to access your Google Workspace data for personalized tutoring.
        </p>

        <div style={{ paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>
           <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Faculty & Administration</p>
           <button 
            onClick={() => login()}
            className="btn-ghost" 
            style={{ width: "100%", padding: "12px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
           >
             🎓 Professor Portal Login
           </button>
        </div>
      </div>
    </div>
  );
}

export default function RootPage() {
  const { token, user } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    if (token) {
      // If we have a token but no user, fetch user first
      if (!user) {
        api.get("/auth/me")
          .then((u) => {
            useAuthStore.getState().setUser(u);
            if (!u.role_finalized) router.replace("/onboarding");
            else if (u.role === "professor") router.replace("/professor");
            else router.replace("/chat");
          })
          .catch(() => {
            // If token is invalid, clear it
            useAuthStore.getState().logout();
          });
      } else {
        if (!user.role_finalized) router.replace("/onboarding");
        else if (user.role === "professor") router.replace("/professor");
        else router.replace("/chat");
      }
    } else {
      console.log("[RootPage] Fetching auth config from:", "/auth/config");
      api.get("/auth/config")
        .then((cfg) => {
          console.log("[RootPage] Config received:", cfg);
          if (cfg?.client_id) setClientId(cfg.client_id);
          else setConfigError("Backend returned invalid configuration.");
        })
        .catch((err) => {
          console.error("[RootPage] Failed to fetch auth config:", err);
          setConfigError("Cannot connect to backend service. Please ensure it's running on port 8002.");
        });
    }
  }, [token, user, router]);

  if (!mounted || token) return null;
  
  if (configError) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", marginBottom: 24 }}>
          ⚠️
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Connection Failure</h1>
        <p style={{ color: "var(--text-secondary)", maxWidth: 400, marginBottom: 32 }}>{configError}</p>
        <button onClick={() => window.location.reload()} className="btn-primary" style={{ padding: "12px 24px" }}>Retry Connection</button>
      </div>
    );
  }

  if (!clientId) {
    return (
      <div style={{ position: "relative", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <LoginInner />
    </GoogleOAuthProvider>
  );
}
