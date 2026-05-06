"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Award, Target, Zap, Brain, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MasteryGraph from "@/components/MasteryGraph";
import { useRouter } from "next/navigation";

export default function StudentProgress() {
  const router = useRouter();
  const [mastery, setMastery] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<any>({ nodes: [], edges: [] });
  const [overall, setOverall] = useState({ mastery: 0, percentile: 50, velocity: "+0%" });

  useEffect(() => {
    api.get("/profile/mastery").then(setMastery).catch(() => {});
    api.get("/profile/mastery/history").then((data) => {
      if (!Array.isArray(data)) return;
      // Add a static target line to the history data
      const formatted = data.map((d: any) => ({ ...d, target: 80 }));
      setHistory(formatted);
    }).catch(() => {});
    api.get("/profile/mastery-graph").then(setGraphData).catch(() => {});
    api.get("/profile/stats").then(setOverall).catch(() => {});
  }, []);

  const getStatus = (score: number) => {
    if (score >= 0.8) return { status: 'strong', fill: '#1D9E75', text: '#085041', bg: '#E1F5EE' };
    if (score >= 0.6) return { status: 'good', fill: '#378ADD', text: '#0C447C', bg: '#E6F1FB' };
    if (score >= 0.4) return { status: 'growing', fill: '#EF9F27', text: '#633806', bg: '#FAEEDA' };
    return { status: 'weak', fill: '#E24B4A', text: '#501313', bg: '#FCEBEB' };
  };

  const handleReinforce = (conceptName: string) => {
    router.push(`/chat/new?prompt=I need help understanding ${encodeURIComponent(conceptName)}. Can we do a targeted review?`);
  };

  return (
    <div className="fade-in" style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 0" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>My Mastery Dashboard</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "#EAF3DE", color: "#3B6D11", fontWeight: 600 }}>Active Learning</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Evolving your Digital Twin through evidence-based learning.</p>
          </div>
          
          <div className="glass" style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 16 }}>
             <div style={{ textAlign: "right" }}>
               <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Overall Mastery</p>
               <p style={{ fontSize: 20, fontWeight: 800, color: "var(--accent)" }}>{overall.mastery}%</p>
             </div>
             <div style={{ width: 1, height: 32, background: "var(--border)" }} />
             <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, var(--accent), #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
               <Brain size={24} />
             </div>
          </div>
        </div>

        {/* Top Metrics Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 48 }}>
          <div className="glass" style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Mastery Percentile</p>
            <p style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{overall.percentile}%</p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>Top tier across cohort</p>
          </div>
          <div className="glass" style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Learning Velocity</p>
            <p style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{overall.velocity}</p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>7-day rolling average</p>
          </div>
          <div className="glass" style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Concepts Covered</p>
            <p style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{mastery.length}</p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>Extracted from memory</p>
          </div>
          <div className="glass" style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Engagement Score</p>
            <p style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>High</p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>Based on activity</p>
          </div>
        </div>

        {/* Mastery Graph Section */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>Neural Knowledge Graph</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Click any weak node to generate a reinforcement session</span>
          </div>
          <MasteryGraph data={graphData} height={400} onConceptClick={(name) => handleReinforce(name)} />
        </div>

        {/* Line Chart Section */}
        {history.length > 0 && (
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>Mastery over time</span>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-secondary)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 3, background: "#1D9E75", borderRadius: 2 }} /> Mastery</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 3, background: "#378ADD", border: "1px dashed #378ADD", borderRadius: 2 }} /> Target</span>
              </div>
            </div>
            
            <div className="glass" style={{ width: "100%", height: 260, padding: 20 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="session" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                    labelStyle={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 4 }}
                  />
                  <Line type="monotone" dataKey="mastery" stroke="#1D9E75" strokeWidth={3} dot={{ r: 4, fill: "#1D9E75" }} activeDot={{ r: 6 }} />
                  <Line type="stepAfter" dataKey="target" stroke="#378ADD" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Concept-Level Breakdown (Reference UI Style) */}
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Concept-level breakdown</div>
          <div className="glass" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            {mastery?.length > 0 ? mastery.map((m, i) => {
              const sc = getStatus(m.score);
              return (
                <div key={i} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{m.concept}</span>
                      <button 
                        onClick={() => handleReinforce(m.concept)} 
                        className="btn-ghost" 
                        style={{ fontSize: 10, padding: "2px 8px", height: "auto", border: "1px solid var(--border)", borderRadius: 6, opacity: 0.7 }}
                      >
                        Improve
                      </button>
                    </div>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: sc.bg, color: sc.text, fontWeight: 500 }}>{sc.status}</span>
                      <span style={{ color: "var(--text-secondary)", fontSize: 12, width: 36, textAlign: "right" }}>{Math.round(m.score * 100)}%</span>
                    </span>
                  </div>
                  <div style={{ background: "var(--bg-secondary, rgba(0,0,0,0.04))", borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${m.score * 100}%` }}
                      transition={{ duration: 1, delay: i * 0.1 }}
                      style={{ height: "100%", background: sc.fill, borderRadius: 4 }}
                    />
                  </div>
                </div>
              );
            }) : (
              <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "20px 0" }}>No concepts mastered yet. Start a chat session!</p>
            )}
          </div>
        </div>

        {/* What to focus on next */}
        {mastery.length > 0 && (
          <div style={{ marginTop: 40, borderTop: "1px solid var(--border)", paddingTop: 32 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>What to focus on next</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {mastery?.filter(m => m.score < 0.6).slice(0, 3).map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#E24B4A", flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Review: {m.concept}</span>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>Needs reinforcement. Current mastery is at {Math.round(m.score * 100)}%.</p>
                  </div>
                  <button onClick={() => handleReinforce(m.concept)} className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>
                    Strengthen ↗
                  </button>
                </div>
              ))}
              {mastery.filter(m => m.score < 0.6).length === 0 && (
                <div style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Great job! You have no weak concepts to review right now.</span>
                </div>
              )}
            </div>
          </div>
        )}

    </div>
  );
}
