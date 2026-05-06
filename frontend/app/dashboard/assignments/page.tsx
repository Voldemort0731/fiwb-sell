"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { ClipboardList, Play, CheckCircle, Clock, AlertCircle, ChevronRight, FileText, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter } from "next/navigation";

export default function StudentAssignments() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const router = useRouter();

  const fetchAssignments = () => {
    api.get("/chat/assignments").then(setAssignments).catch(() => {});
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const startViva = async (id: number) => {
    try {
      const { thread_id } = await api.post(`/chat/assignments/${id}/start`);
      router.push(`/chat/${thread_id}`);
    } catch (err) {
      console.error("Failed to start viva", err);
    }
  };

  const viewReport = async (id: number) => {
    setLoadingReport(true);
    try {
      const report = await api.get(`/chat/assignments/${id}/report`);
      setSelectedReport(report);
    } catch (err) {
      console.error("Failed to load report", err);
      alert("Report not ready yet. Please wait for AI analysis to complete.");
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: "0 auto", padding: "40px 0" }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Course Assessments</h1>
          <p style={{ color: "var(--text-secondary)" }}>Complete your evaluations through Socratic Viva sessions.</p>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {assignments.length > 0 ? assignments.map((a) => (
            <div key={a.id} className="glass" style={{ padding: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ClipboardList size={20} color="var(--accent)" />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{a.title}</h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{a.course_name} • {a.objectives_count} Objectives</p>
                </div>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                {a.status === 'completed' ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ textAlign: "right" }}>
                      <span className="tag tag-green"><CheckCircle size={10} style={{ marginRight: 4 }} /> Completed</span>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Score: {a.score}%</p>
                    </div>
                    <button 
                      onClick={() => viewReport(a.id)}
                      className="btn-ghost"
                      style={{ padding: "8px 12px", fontSize: 13, border: "1px solid var(--border)" }}
                    >
                      View Report
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => startViva(a.id)}
                    className="btn-primary" 
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Play size={14} /> Start Viva
                  </button>
                )}
              </div>
            </div>
          )) : (
            <div className="glass" style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>
               <Clock size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
               <p>No active assignments at the moment. Keep building your Digital Twin!</p>
            </div>
          )}
        </div>
        
        <div style={{ marginTop: 40, padding: 24, background: "rgba(216,163,93,0.05)", borderRadius: 16, border: "1px solid rgba(216,163,93,0.1)", display: "flex", gap: 16 }}>
          <AlertCircle size={20} color="var(--accent-3)" style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>How Viva Works</h4>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Assessments in FIWB are conversational. The AI will ask you questions to gauge your depth of understanding. 
              There are no static forms—your reasoning, clarity, and ability to handle edge cases determine your mastery score.
            </p>
          </div>
        </div>

        {/* Report Modal */}
        {selectedReport && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="glass-strong" 
               style={{ width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", padding: 40, position: "relative", borderRadius: 24 }}
             >
                <button onClick={() => setSelectedReport(null)} style={{ position: "absolute", top: 24, right: 24, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                  <X size={24} />
                </button>
                
                <div style={{ marginBottom: 32 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <span className="tag tag-green">Assessment Complete</span>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{new Date(selectedReport.created_at).toLocaleDateString()}</span>
                  </div>
                  <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>{selectedReport.assessment_title}</h2>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 40, fontWeight: 900, color: selectedReport.grade >= 70 ? "var(--success)" : "var(--amber)" }}>{selectedReport.grade}%</span>
                    <span style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 600 }}>Mastery Grade</span>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 24 }}>
                   <div style={{ padding: 24, background: "rgba(139, 92, 246, 0.04)", borderRadius: 16, border: "1px solid rgba(139, 92, 246, 0.1)" }}>
                      <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Key Strengths</h4>
                      <ul style={{ paddingLeft: 16, display: "grid", gap: 10 }}>
                        {selectedReport.report.strengths.map((s: string, i: number) => (
                          <li key={i} style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{s}</li>
                        ))}
                      </ul>
                   </div>

                   <div style={{ padding: 24, background: "rgba(245, 158, 11, 0.04)", borderRadius: 16, border: "1px solid rgba(245, 158, 11, 0.1)" }}>
                      <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Knowledge Gaps</h4>
                      <ul style={{ paddingLeft: 16, display: "grid", gap: 10 }}>
                        {selectedReport.report.gaps.map((g: string, i: number) => (
                          <li key={i} style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{g}</li>
                        ))}
                      </ul>
                   </div>

                   <div style={{ padding: 24, background: "rgba(0,0,0,0.02)", borderRadius: 16 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>AI Mentor Feedback</h4>
                      <div className="prose-ai" style={{ fontSize: 14, color: "var(--text-secondary)", fontStyle: "italic", lineHeight: 1.6 }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedReport.report.grading_note}</ReactMarkdown>
                      </div>
                   </div>
                </div>
                
                <button 
                  onClick={() => setSelectedReport(null)}
                  className="btn-primary" 
                  style={{ width: "100%", marginTop: 32, padding: 14 }}
                >
                  Continue Learning Journey
                </button>
             </motion.div>
          </div>
        )}
      </div>
  );
}
