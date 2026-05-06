"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { BarChart3, Users, BookOpen, GraduationCap, ArrowUpRight, Clock, ChevronRight, FileText } from "lucide-react";
import { motion } from "framer-motion";

export default function ProfessorAnalytics() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<any>(null);

  useEffect(() => {
    api.get("/professor/analytics/overview")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const openReport = (id: number) => {
    api.get(`/professor/viva/results/${id}`).then(setSelectedResult).catch(console.error);
  };

  if (loading) return <div style={{ padding: 40 }}>Analyzing institutional performance...</div>;
  if (!data) return <div style={{ padding: 40 }}>Failed to load analytics.</div>;

  return (
    <div className="fade-in" style={{ padding: "0 20px" }}>
      <div style={{ marginBottom: 48 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>Pedagogical Insights</h1>
        <p style={{ color: "var(--text-secondary)" }}>Real-time analytics across your institutional courses.</p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 48 }}>
        <div className="glass" style={{ padding: 24, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(139, 92, 246, 0.1)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <GraduationCap size={28} />
          </div>
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Avg. Course Mastery</p>
            <h2 style={{ fontSize: 24, fontWeight: 800 }}>{data.avg_mastery}%</h2>
          </div>
        </div>
        <div className="glass" style={{ padding: 24, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(6, 182, 212, 0.1)", color: "var(--cyan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users size={28} />
          </div>
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Total Students</p>
            <h2 style={{ fontSize: 24, fontWeight: 800 }}>{data.total_students}</h2>
          </div>
        </div>
        <div className="glass" style={{ padding: 24, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(16, 185, 129, 0.1)", color: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen size={28} />
          </div>
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Active Courses</p>
            <h2 style={{ fontSize: 24, fontWeight: 800 }}>{data.total_courses}</h2>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 40 }}>
        {/* Viva Submissions */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>Recent Viva Submissions</h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={14} /> Last updated 2m ago
            </span>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {data.recent_results.map((res: any) => (
              <motion.div 
                key={res.id}
                whileHover={{ x: 6 }}
                onClick={() => openReport(res.id)}
                className="glass"
                style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(139, 92, 246, 0.05)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>{res.student_name}</h3>
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{res.assessment_title}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: res.grade >= 70 ? "var(--success)" : "var(--amber)" }}>{res.grade}%</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>AI Score</div>
                  </div>
                  <ChevronRight size={18} style={{ opacity: 0.3 }} />
                </div>
              </motion.div>
            ))}
            {data.recent_results.length === 0 && (
              <div style={{ padding: 48, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 16 }}>
                <p style={{ color: "var(--text-muted)" }}>No Viva assessments have been submitted yet.</p>
              </div>
            )}
          </div>
        </section>

        {/* Report Modal / Sidebar */}
        <aside>
          {selectedResult ? (
            <div className="glass fade-in" style={{ padding: 24, border: "2px solid var(--accent)" }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>Viva Report</h3>
                  <button onClick={() => setSelectedResult(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>✕</button>
               </div>
               
               <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>{selectedResult.student_name}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{selectedResult.student_email}</p>
               </div>

               <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ padding: 16, background: "rgba(139, 92, 246, 0.03)", borderRadius: 12 }}>
                     <p style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>Strengths</p>
                     <ul style={{ paddingLeft: 16, fontSize: 13, color: "var(--text-secondary)" }}>
                        {selectedResult.report.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                     </ul>
                  </div>
                  <div style={{ padding: 16, background: "rgba(245, 158, 11, 0.03)", borderRadius: 12 }}>
                     <p style={{ fontSize: 12, color: "var(--amber)", fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>Knowledge Gaps</p>
                     <ul style={{ paddingLeft: 16, fontSize: 13, color: "var(--text-secondary)" }}>
                        {selectedResult.report.gaps.map((g: string, i: number) => <li key={i}>{g}</li>)}
                     </ul>
                  </div>
                  <div style={{ padding: 16, background: "rgba(0,0,0,0.02)", borderRadius: 12 }}>
                     <p style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>Assisted Grading Note</p>
                     <p style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic" }}>
                        "{selectedResult.report.grading_note}"
                     </p>
                  </div>
               </div>

               <button className="btn-primary" style={{ width: "100%", marginTop: 24, padding: 12 }}>
                  Verify & Sync Grade
               </button>
            </div>
          ) : (
            <div className="glass" style={{ padding: 32, textAlign: "center", opacity: 0.6 }}>
               <FileText size={48} style={{ margin: "0 auto 16px", display: "block", color: "var(--text-muted)" }} />
               <p style={{ fontSize: 14 }}>Select a student to view their AI-generated performance report and assisted grading.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
