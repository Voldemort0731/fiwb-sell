"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { usePathname } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8002";

// ─── Context label from route ────────────────────────────────────────────────
function detectContext(pathname: string): string {
  if (pathname.includes("/chat")) return "chat";
  if (pathname.includes("/practice")) return "practice_quiz";
  if (pathname.includes("/assignments")) return "assignment";
  if (pathname.includes("/viva")) return "viva";
  return "general_chat";
}

function detectTopic(pathname: string): string {
  if (pathname.includes("/chat")) return "Interactive Socratic Chat";
  if (pathname.includes("/practice")) return "Adaptive Practice Quiz";
  if (pathname.includes("/assignments")) return "Course Assignment";
  if (pathname.includes("/viva")) return "Oral Viva Voce Exam";
  return "General Academic Learning";
}

// ─── Emotion → Understanding / Confusion mapping ─────────────────────────────
function emotionToScores(emotion: string): { understanding: number; confusion: number } {
  const e = (emotion || "neutral").toLowerCase();
  const map: Record<string, { understanding: number; confusion: number }> = {
    happy:    { understanding: 88, confusion: 8  },
    neutral:  { understanding: 70, confusion: 18 },
    focused:  { understanding: 92, confusion: 5  },
    surprise: { understanding: 40, confusion: 60 },
    fear:     { understanding: 30, confusion: 72 },
    confused: { understanding: 25, confusion: 78 },
    sad:      { understanding: 40, confusion: 35 },
    disgust:  { understanding: 35, confusion: 42 },
    angry:    { understanding: 28, confusion: 65 },
  };
  return map[e] ?? { understanding: 60, confusion: 28 };
}

// ─── Generate AI Action Hint ──────────────────────────────────────────────────
function generateHint(
  understanding: number,
  confusion: number,
  context: string
): string {
  const contextLabel: Record<string, string> = {
    chat: "chat session",
    practice_quiz: "practice quiz",
    assignment: "assignment",
    viva: "Socratic viva",
    general_chat: "session",
  };
  const label = contextLabel[context] ?? "session";

  if (confusion > 60)
    return `High confusion detected in ${label} — AI will simplify with analogies and step-by-step breakdowns.`;
  if (confusion > 40)
    return `Moderate confusion in ${label} — consider asking for a different explanation angle or a quick hint.`;
  if (understanding > 80)
    return `Strong understanding detected — AI can increase depth and introduce advanced challenges.`;
  if (understanding > 60)
    return `Solid grasp in ${label} — maintaining current teaching pace. Keep going!`;
  return `Accumulating cognitive state window for ${label}…`;
}

// ─── Camera Consent Modal ─────────────────────────────────────────────────────
function ConsentModal({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, backdropFilter: "blur(10px)",
    }}>
      <div style={{
        background: "linear-gradient(145deg, #0c1220, #111a2e)",
        border: "1px solid rgba(56,189,248,0.3)",
        borderRadius: 16, padding: "32px 28px", maxWidth: 440, width: "90%",
        boxShadow: "0 0 60px rgba(56,189,248,0.12), 0 24px 60px rgba(0,0,0,0.7)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 40 }}>📷</span>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(16,185,129,0.15)", border: "1px solid #10b981",
            borderRadius: 20, padding: "3px 10px", marginLeft: 10,
            fontSize: 11, color: "#10b981", fontWeight: 700, verticalAlign: "middle",
          }}>
            <span style={{ width: 6, height: 6, background: "#10b981", borderRadius: "50%", display: "inline-block" }} />
            LIVE COGNITIVE MONITOR
          </div>
        </div>

        <h2 style={{ color: "#e2e8f0", textAlign: "center", margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>
          Enable DeepFace Learning Monitor
        </h2>
        <p style={{ color: "#64748b", textAlign: "center", fontSize: 13, lineHeight: 1.65, margin: "0 0 16px" }}>
          Real-time facial analysis builds your <strong style={{ color: "#38bdf8" }}>Understanding & Confusion Index</strong> to help the AI adapt its teaching style dynamically.
        </p>
        <div style={{
          background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)",
          borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#64748b", marginBottom: 20
        }}>
          <div style={{ marginBottom: 5 }}>✅ <strong style={{ color: "#94a3b8" }}>No video is stored.</strong> Only anonymized cognitive states are saved.</div>
          <div style={{ marginBottom: 5 }}>🔒 All data stays in your personal Memory Layer.</div>
          <div>🎯 AI adapts explanations based on your live confusion & understanding scores.</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onDecline} id="consent-decline" style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#64748b", cursor: "pointer", fontSize: 13,
          }}>Not now</button>
          <button onClick={onAccept} id="consent-accept" style={{
            flex: 2, padding: "10px 0", borderRadius: 8,
            background: "linear-gradient(135deg, #0ea5e9, #38bdf8)",
            border: "none", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700,
            boxShadow: "0 0 20px rgba(56,189,248,0.35)",
          }}>📡 Start Live Camera</button>
        </div>
      </div>
    </div>
  );
}

// ─── Metric Bar (Understanding / Confusion) ───────────────────────────────────
function MetricBar({ label, value, color, accent }: {
  label: string; value: number; color: string; accent: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>
          {value}%
        </span>
      </div>
      <div style={{ height: 7, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 4,
          transition: "width 1.2s ease",
          boxShadow: `0 0 8px ${color}66`,
        }} />
      </div>
    </div>
  );
}

// ─── Attribute Chip ────────────────────────────────────────────────────────────
function AttrChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8, padding: "8px 10px", minWidth: 0,
    }}>
      <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color ?? "#94a3b8" }}>
        {value || "——"}
      </div>
    </div>
  );
}

// ─── Main HUD ──────────────────────────────────────────────────────────────────
export default function FacialMonitorHUD() {
  const { token } = useAuthStore();
  const pathname = usePathname();

  // ─ Consent + mount guard ─────────────────────────
  const [consent, setConsent] = useState<"pending" | "granted" | "declined">("pending");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("facial_consent_v2");
    if (saved === "granted") setConsent("granted");
    else if (saved === "declined") setConsent("declined");
  }, []);

  // ─ Camera state ──────────────────────────────────
  const [isLive, setIsLive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  // ─ Rolling 2s window metrics ─────────────────────
  const WINDOW = 2;
  const [windowBuffer, setWindowBuffer] = useState<{ understanding: number; confusion: number }[]>([]);
  const [avgUnderstanding, setAvgUnderstanding] = useState(0);
  const [avgConfusion, setAvgConfusion] = useState(0);
  const [dominantEmotion, setDominantEmotion] = useState("——");
  const [windowState, setWindowState] = useState("Collecting initial samples… 🧘");
  const [aiHint, setAiHint] = useState("Accumulating 2-frame facial expression window…");

  // ─ Performance metrics ───────────────────────────
  const [latencyMs, setLatencyMs] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [lastSaved, setLastSaved] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);   // hidden — for frame capture
  const previewRef = useRef<HTMLVideoElement>(null); // visible — shown in HUD
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bufferRef = useRef<{ understanding: number; confusion: number }[]>([]);

  // ─ Only show when authenticated on non-public pages
  const isPublicPage = ["/", "/auth", "/onboarding"].some(p => pathname === p || pathname.startsWith("/auth"));
  const shouldRender = mounted && !isPublicPage && !!token;

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } });
      streamRef.current = stream;
      // Attach to hidden capture video immediately
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsLive(true);
      setCameraError(null);
    } catch (err: unknown) {
      setCameraError(err instanceof Error ? err.message : "Camera unavailable");
      setIsLive(false);
    }
  }, []);

  // Wire stream to preview video after isLive becomes true (previewRef is mounted by then)
  useEffect(() => {
    if (isLive && previewRef.current && streamRef.current) {
      previewRef.current.srcObject = streamRef.current;
      previewRef.current.play().catch(() => {});
    }
    if (!isLive && previewRef.current) {
      previewRef.current.srcObject = null;
    }
  }, [isLive]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setIsLive(false);
  }, []);

  const handleAccept = () => {
    localStorage.setItem("facial_consent_v2", "granted");
    setConsent("granted");
  };
  const handleDecline = () => {
    localStorage.setItem("facial_consent_v2", "declined");
    setConsent("declined");
  };

  const handleResetData = async () => {
    localFramesRef.current = 0;
    backendCallRef.current = 0;
    bufferRef.current = [];
    setLocalFrames(0);
    setWindowBuffer([]);
    setAvgUnderstanding(0);
    setAvgConfusion(0);
    setDominantEmotion("——");
    setWindowState("Data Reset 🔄");
    setAiHint("Data reset. Accumulating new 2-frame facial window...");
    if (token) {
      try {
        await fetch(`${API_BASE}/vision/reset`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        // silent
      }
    }
  };

  useEffect(() => {
    if (consent === "granted" && shouldRender) startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent, shouldRender]);

  // ─ Refs that always hold latest values (no stale closures) ──
  const isLiveRef = useRef(false);
  const tokenRef  = useRef(token);
  const pathRef   = useRef(pathname);
  // Keep them in sync
  useEffect(() => { isLiveRef.current = isLive; },    [isLive]);
  useEffect(() => { tokenRef.current  = token; },     [token]);
  useEffect(() => { pathRef.current   = pathname; },  [pathname]);

  // ─ Local frame tick counter (updates every 2s) ───────────
  const [localFrames, setLocalFrames] = useState(0);
  const [lastCapture, setLastCapture] = useState<string>("");
  const localFramesRef = useRef(0);

  // ─ Backend call counter (updates every 10s) ──────────────
  const backendCallRef = useRef(0); // counts calls since mount

  // ─ Stable analysis fn stored in a ref ───────────────────
  // This function is called by the interval; it always reads
  // the latest values from refs so there's no stale closure.
  const analysisFnRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    analysisFnRef.current = async () => {
      const video   = videoRef.current;
      const canvas  = canvasRef.current;
      const live    = isLiveRef.current;
      const tok     = tokenRef.current;
      const ctx_key = detectContext(pathRef.current);

      if (!live || !video || !canvas || !tok) return;
      if (video.readyState < 2) return; // not ready yet

      // ── 1. Local frame capture (every tick = 2s) ──────────
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = 320; canvas.height = 240;
      ctx.drawImage(video, 0, 0, 320, 240);

      localFramesRef.current += 1;
      setLocalFrames(localFramesRef.current);
      setLastCapture(new Date().toLocaleTimeString());

      // ── 2. Backend LLM call every tick = 2s ──────────────
      const frame_b64 = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
      const t0 = Date.now();

      try {
        const res = await fetch(`${API_BASE}/vision/analyze-frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
          body: JSON.stringify({
            frame_b64,
            context: ctx_key,
            topic: detectTopic(pathRef.current),
          }),
        });
        setLatencyMs(Date.now() - t0);

        if (!res.ok) return;
        const data = await res.json();
        const emotion: string = data.emotion || "neutral";
        setDominantEmotion(emotion.charAt(0).toUpperCase() + emotion.slice(1));
        setLastSaved(data.stored_in_supermemory || false);

        // Read real dynamic scores returned by backend Vision LLM
        const fallbackScores = emotionToScores(emotion);
        const scores = {
          understanding: typeof data.understanding_score === "number" ? data.understanding_score : fallbackScores.understanding,
          confusion: typeof data.confusion_score === "number" ? data.confusion_score : fallbackScores.confusion,
        };

        bufferRef.current = [...bufferRef.current, scores].slice(-WINDOW);
        const buf = bufferRef.current;
        const avgU = Math.round(buf.reduce((s, x) => s + x.understanding, 0) / buf.length);
        const avgC = Math.round(buf.reduce((s, x) => s + x.confusion, 0) / buf.length);
        setAvgUnderstanding(avgU);
        setAvgConfusion(avgC);
        setWindowBuffer([...buf]);

        if (data.actionable_insight) setAiHint(data.actionable_insight);
        else setAiHint(generateHint(avgU, avgC, ctx_key));

        if (avgC > 50)      setWindowState("⚡ High Confusion Detected");
        else if (avgC > 30) setWindowState("🤔 Moderate Confusion");
        else if (avgU > 75) setWindowState("✅ Strong Understanding");
        else if (avgU > 55) setWindowState("📖 Engaged Learning");
        else                setWindowState("😐 Neutral / Processing");
      } catch {
        // silent — keep last known state
      }
    };
  }); // no dep array — always up to date

  // ─ Start / stop the stable 2s interval ───────────────────
  useEffect(() => {
    if (!isLive) return;
    // Reset counters when starting
    localFramesRef.current = 0;
    backendCallRef.current  = 0;
    bufferRef.current = [];

    const id = setInterval(() => {
      analysisFnRef.current(); // always calls the latest fn
    }, 2_000);
    intervalRef.current = id;

    // Kick off immediately (don't wait 2s for first tick)
    setTimeout(() => analysisFnRef.current(), 300);

    return () => clearInterval(id);
  }, [isLive]);

  if (!shouldRender) return null;
  if (consent === "pending") return <ConsentModal onAccept={handleAccept} onDecline={handleDecline} />;
  if (consent === "declined") {
    return (
      <button id="hud-reenable" onClick={() => { localStorage.removeItem("facial_consent_v2"); setConsent("pending"); }}
        style={{
          position: "fixed", bottom: 20, left: 20, zIndex: 9000, cursor: "pointer",
          background: "rgba(12,18,32,0.9)", border: "1px solid rgba(56,189,248,0.3)",
          borderRadius: 20, padding: "6px 14px", color: "#64748b", fontSize: 11,
          backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 6
        }}>
        📡 <span>Enable Cognitive Monitor</span>
      </button>
    );
  }

  // ─ Minimized pill ────────────────────────────────
  if (minimized) {
    return (
      <div id="hud-minimized" onClick={() => setMinimized(false)} style={{
        position: "fixed", bottom: 20, left: 20, zIndex: 9000, cursor: "pointer",
        background: "rgba(12,18,32,0.92)", border: "1px solid rgba(56,189,248,0.35)",
        borderRadius: 20, padding: "6px 14px", display: "flex", alignItems: "center", gap: 8,
        backdropFilter: "blur(14px)", boxShadow: "0 0 20px rgba(56,189,248,0.1)",
      }}>
        {isLive && <span style={{ width: 7, height: 7, background: "#10b981", borderRadius: "50%", display: "inline-block", boxShadow: "0 0 6px #10b981" }} />}
        <span style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>COGNITIVE MONITOR</span>
        <span style={{ fontSize: 11, color: "#64748b" }}>U:{avgUnderstanding}% / C:{avgConfusion}%</span>
      </div>
    );
  }

  // ─ Confusion color ───────────────────────────────
  const confusionColor = avgConfusion > 60 ? "#ef4444" : avgConfusion > 40 ? "#f59e0b" : "#22c55e";
  const understandColor = avgUnderstanding > 70 ? "#10b981" : avgUnderstanding > 45 ? "#38bdf8" : "#f59e0b";
  const windowBufferFilled = windowBuffer.length >= 3;

  return (
    <>
      <video ref={videoRef} style={{ display: "none" }} muted playsInline />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div id="facial-hud-panel" style={{
        position: "fixed", bottom: 20, left: 20, zIndex: 9000,
        width: 280,
        background: "linear-gradient(160deg, #0c1220, #0f1929)",
        border: "1px solid rgba(56,189,248,0.25)",
        borderRadius: 14,
        boxShadow: "0 0 40px rgba(56,189,248,0.08), 0 16px 48px rgba(0,0,0,0.6)",
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
      }}>
        {/* ─ Header ─────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isLive ? (
              <span style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "rgba(16,185,129,0.12)", border: "1px solid #10b981",
                borderRadius: 20, padding: "2px 8px", fontSize: 10, color: "#10b981", fontWeight: 700,
              }}>
                <span style={{ width: 5, height: 5, background: "#10b981", borderRadius: "50%", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                LIVE CAMERA
              </span>
            ) : (
              <span style={{
                background: "rgba(239,68,68,0.12)", border: "1px solid #ef4444",
                borderRadius: 20, padding: "2px 8px", fontSize: 10, color: "#ef4444", fontWeight: 700,
              }}>OFFLINE</span>
            )}
            <span style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700, letterSpacing: 0.3 }}>
              DeepFace AI Studio
            </span>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button id="hud-reset" onClick={handleResetData} title="Reset Data"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: "2px 4px", color: "#64748b" }}>
              🔄
            </button>
            <button id="hud-toggle" onClick={() => isLive ? stopCamera() : startCamera()}
              title={isLive ? "Stop" : "Start"}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 4px", color: "#64748b" }}>
              {isLive ? "⏹" : "▶️"}
            </button>
            <button id="hud-min" onClick={() => setMinimized(true)} title="Minimize"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 4px", color: "#64748b" }}>
              ⬇️
            </button>
          </div>
        </div>

        {/* ─ Live camera preview ─ always in DOM, visibility toggled via CSS ─── */}
        <div style={{ position: "relative", height: 140, background: "#050a13", overflow: "hidden" }}>
          {/* Always-mounted preview video — stream attached via useEffect after isLive */}
          <video
            ref={previewRef}
            autoPlay muted playsInline
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              display: isLive ? "block" : "none",
              transform: "scaleX(-1)", // mirror like a selfie camera
            }}
          />

          {/* Offline / error placeholder */}
          {!isLive && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 28 }}>📷</span>
              {cameraError
                ? <span style={{ fontSize: 11, color: "#ef4444", textAlign: "center", padding: "0 12px" }}>{cameraError}</span>
                : <span style={{ fontSize: 11, color: "#475569" }}>Camera offline — press ▶️ to start</span>
              }
            </div>
          )}

          {/* live frame-count overlay — updates every 2s from canvas capture */}
          {isLive && (
            <div style={{
              position: "absolute", bottom: 6, right: 8,
              background: "rgba(0,0,0,0.65)", borderRadius: 4, padding: "2px 6px",
              fontSize: 10, color: "#38bdf8", fontWeight: 600,
            }}>
              {localFrames} frames captured
            </div>
          )}
          {/* last capture timestamp top-left */}
          {isLive && lastCapture && (
            <div style={{
              position: "absolute", top: 6, left: 8,
              background: "rgba(0,0,0,0.65)", borderRadius: 4, padding: "2px 6px",
              fontSize: 9, color: "#10b981", fontWeight: 600,
            }}>
              ⏱ {lastCapture}
            </div>
          )}
        </div>

        {/* ─ 5s window Cognitive State ──────────────────────── */}
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
              🔴 {WINDOW}-FRAME COGNITIVE STATE
            </span>
          </div>
          <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            {WINDOW}-Frame Average State
          </div>
          <div style={{
            fontSize: 13, fontWeight: 700, color: windowBufferFilled ? "#38bdf8" : "#64748b",
            marginBottom: 10,
          }}>
            {windowBufferFilled ? windowState : "Collecting initial samples… 🧘"}
          </div>

          {/* Understanding Index */}
          <MetricBar
            label={`${WINDOW}s Avg Understanding`}
            value={windowBufferFilled ? avgUnderstanding : 0}
            color={understandColor}
            accent={understandColor}
          />

          {/* Confusion Index */}
          <MetricBar
            label={`${WINDOW}s Avg Confusion`}
            value={windowBufferFilled ? avgConfusion : 0}
            color={confusionColor}
            accent={confusionColor}
          />

          {/* AI Action Hint */}
          <div style={{
            background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.15)",
            borderRadius: 8, padding: "8px 10px", marginBottom: 10,
          }}>
            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5 }}>
              {WINDOW}s Chatbot AI Action Hint
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.55 }}>
              {aiHint}
            </div>
          </div>
        </div>

        {/* ─ Attributes ─────────────────────────────────────── */}
        <div style={{ padding: "0 14px" }}>
          <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            {WINDOW}-Frame Averaged Attributes
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            <AttrChip label="Context" value={detectContext(pathname).replace("_", " ")} color="#38bdf8" />
            <AttrChip label="Dominant Emotion (avg)" value={dominantEmotion}
              color={dominantEmotion === "Confused" || dominantEmotion === "Angry" ? "#ef4444" : "#10b981"} />
          </div>
        </div>

        {/* ─ System Performance ─────────────────────────────── */}
        <div style={{
          padding: "8px 14px 10px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
            System Performance & Buffer
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "#475569" }}>
                Frames: <span style={{ color: "#38bdf8", fontWeight: 700 }}>{localFrames}</span>
              </span>
              <span style={{ fontSize: 10, color: "#475569" }}>
                API: <span style={{ color: latencyMs > 1000 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{latencyMs > 0 ? `${latencyMs}ms` : "pending"}</span>
              </span>
              <span style={{ fontSize: 10, color: "#475569" }}>
                Buffer: <span style={{ color: "#38bdf8", fontWeight: 700 }}>{windowBuffer.length}/{WINDOW}</span>
              </span>
            </div>
            {lastSaved && (
              <span style={{ fontSize: 10, color: "#818cf8", display: "flex", alignItems: "center", gap: 3 }}>
                🧠 Saved
              </span>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}
