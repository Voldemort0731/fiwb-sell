"use client";

import { useState, useEffect } from "react";
import { Heart, Activity, AlertTriangle, Smile, Frown, BookOpen, RefreshCw, Sparkles } from "lucide-react";
import { api } from "@/lib/api";

interface TraitBreakdown {
  Attentive: number;
  Confused: number;
  Frustrated: number;
  Disengaged: number;
  Neutral: number;
}

interface TopicMoodItem {
  topic: string;
  mood: string;
  understanding: number;
  confusion: number;
  samples: number;
}

interface WellbeingData {
  wellbeing_score: number;
  burnout_risk: string;
  cognitive_fatigue: string;
  stress_index: number;
  flourishing_score: number;
  dominant_weekly_mood: string;
  total_frames_analyzed: number;
  trait_breakdown: TraitBreakdown;
  topic_mood_matrix: TopicMoodItem[];
  recommendations: string[];
}

export default function MentalWellbeingWidget() {
  const [data, setData] = useState<WellbeingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWellbeing = async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await api.get("/vision/wellbeing");
      setData(json);
    } catch (err: any) {
      setError(err.message || "Could not load mental wellbeing status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWellbeing();
  }, []);

  if (loading) {
    return (
      <div className="glass" style={{ padding: 24, borderRadius: 16, textAlign: "center" }}>
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Analyzing real-time cognitive traits & wellbeing...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass" style={{ padding: 24, borderRadius: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ color: "#f87171", fontSize: 15, margin: 0, fontWeight: 700 }}>Mental Wellbeing Monitor</h3>
          <button onClick={fetchWellbeing} className="btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
        <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 8 }}>
          Start your webcam facial HUD to record live emotional traits across topics.
        </p>
      </div>
    );
  }

  const getRiskColor = (risk: string) => {
    if (risk === "High") return "#ef4444";
    if (risk === "Moderate") return "#f59e0b";
    return "#10b981";
  };

  return (
    <div
      className="glass"
      style={{
        padding: 24,
        borderRadius: 20,
        background: "rgba(15, 23, 42, 0.75)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
        marginBottom: 32,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              padding: 8,
              borderRadius: 10,
              background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Heart size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: "#f8fafc", margin: 0 }}>
              Student Mental Wellbeing & Cognitive Resilience
            </h3>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
              Longitudinal tracking of emotional traits, study stamina & stress indicators
            </p>
          </div>
        </div>
        <button
          onClick={fetchWellbeing}
          style={{
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            color: "#cbd5e1",
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <RefreshCw size={13} /> Sync Wellbeing
        </button>
      </div>

      {/* Primary KPI Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            borderRadius: 12,
            padding: 14,
            border: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <span style={{ fontSize: 11, textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
            Flourishing Score
          </span>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#10b981", marginTop: 4 }}>
            {data.flourishing_score} <span style={{ fontSize: 13, color: "#64748b" }}>/ 10</span>
          </div>
          <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>Overall cognitive health</p>
        </div>

        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            borderRadius: 12,
            padding: 14,
            border: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <span style={{ fontSize: 11, textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
            Burnout Risk
          </span>
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: getRiskColor(data.burnout_risk),
              marginTop: 4,
            }}
          >
            {data.burnout_risk}
          </div>
          <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>Stress strain metric</p>
        </div>

        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            borderRadius: 12,
            padding: 14,
            border: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <span style={{ fontSize: 11, textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
            Cognitive Fatigue
          </span>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#cbd5e1", marginTop: 4 }}>
            {data.cognitive_fatigue}
          </div>
          <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>Attention capacity</p>
        </div>

        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            borderRadius: 12,
            padding: 14,
            border: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <span style={{ fontSize: 11, textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
            Dominant Mood
          </span>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#a855f7", marginTop: 6, whiteSpace: "nowrap" }}>
            {data.dominant_weekly_mood}
          </div>
          <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>
            Based on {data.total_frames_analyzed} log samples
          </p>
        </div>
      </div>

      {/* Emotional Trait Breakdown & Recommendations Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Trait breakdown */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: 12,
            padding: 16,
            border: "1px solid rgba(255, 255, 255, 0.05)",
          }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: "0 0 12px" }}>
            Facial & Emotional Trait Distribution
          </h4>

          {Object.entries(data.trait_breakdown).map(([trait, pct]) => {
            const barColors: Record<string, string> = {
              Attentive: "#10b981",
              Confused: "#f59e0b",
              Frustrated: "#ef4444",
              Disengaged: "#64748b",
              Neutral: "#3b82f6",
            };
            const col = barColors[trait] || "#3b82f6";
            return (
              <div key={trait} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#cbd5e1", marginBottom: 3 }}>
                  <span>{trait}</span>
                  <span style={{ fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: 6, width: "100%", background: "rgba(255, 255, 255, 0.06)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 3, transition: "width 0.5s ease" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Recommendations */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: 12,
            padding: 16,
            border: "1px solid rgba(255, 255, 255, 0.05)",
          }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={14} color="#38bdf8" /> Personalized Mental Health Insights
          </h4>

          {data.recommendations.map((rec, idx) => (
            <div
              key={idx}
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 12,
                color: "#e2e8f0",
                lineHeight: 1.4,
                marginBottom: 8,
                borderLeft: "3px solid #38bdf8",
              }}
            >
              {rec}
            </div>
          ))}
        </div>
      </div>

      {/* Topic vs Mood Matrix */}
      {data.topic_mood_matrix.length > 0 && (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: 12,
            padding: 16,
            border: "1px solid rgba(255, 255, 255, 0.05)",
          }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <BookOpen size={14} color="#a855f7" /> Topic & Mood Linkage Matrix
          </h4>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {data.topic_mood_matrix.map((tm, idx) => (
              <div
                key={idx}
                style={{
                  background: "rgba(255, 255, 255, 0.04)",
                  borderRadius: 10,
                  padding: 12,
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: "#f8fafc", marginBottom: 4 }}>
                  {tm.topic}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                  <span>Dominant Mood:</span>
                  <span style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(168, 85, 247, 0.2)", color: "#c084fc", fontWeight: 600 }}>
                    {tm.mood}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#cbd5e1" }}>
                  <span>Avg Understanding: <strong style={{ color: "#10b981" }}>{tm.understanding}%</strong></span>
                  <span>Avg Confusion: <strong style={{ color: "#f59e0b" }}>{tm.confusion}%</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
