"use client";
import { useState, useEffect, use } from "react";
import { api } from "@/lib/api";
import { BookOpen, FileText, ChevronLeft, Calendar, Download, Search } from "lucide-react";
import { motion } from "framer-motion";

export default function CourseDetail({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"materials" | "assignments">("materials");
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    api.get(`/profile/courses/${courseId}`)
      .then(setCourse)
      .catch(console.error)
      .finally(() => setLoading(false));

    api.get(`/chat/assignments?course_id=${courseId}`).then(setAssignments).catch(() => {});
  }, [courseId]);

  if (loading) return <div style={{ padding: 40 }}>Loading curriculum...</div>;
  if (!course) return <div style={{ padding: 40 }}>Course not found or access denied.</div>;

  return (
    <div className="fade-in">
      <button 
        onClick={() => window.location.href = "/dashboard/courses"}
        style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", marginBottom: 32, fontSize: 14 }}
      >
        <ChevronLeft size={16} /> Back to Courses
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span className="tag tag-blue">Institutional Curriculum</span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>ID: {courseId}</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, marginBottom: 8 }}>{course.name}</h1>
          <p style={{ fontSize: 16, color: "var(--text-secondary)" }}>{course.teacher} \u2022 Section {course.section}</p>
        </div>
        <button 
          onClick={() => window.location.href = `/chat/new?prompt=I want to discuss the curriculum for ${course.name}. What are the key concepts?`}
          className="btn-primary" 
          style={{ padding: "12px 24px", display: "flex", alignItems: "center", gap: 10 }}
        >
          <Search size={18} /> Neural Deep Dive
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 32, marginBottom: 32, borderBottom: "1px solid var(--border)" }}>
        <button 
          onClick={() => setActiveTab("materials")}
          style={{ padding: "0 0 16px 0", background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700, color: activeTab === "materials" ? "var(--accent)" : "var(--text-muted)", borderBottom: activeTab === "materials" ? "2px solid var(--accent)" : "none" }}
        >
          Curriculum Materials
        </button>
        <button 
          onClick={() => setActiveTab("assignments")}
          style={{ padding: "0 0 16px 0", background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700, color: activeTab === "assignments" ? "var(--accent)" : "var(--text-muted)", borderBottom: activeTab === "assignments" ? "2px solid var(--accent)" : "none" }}
        >
          Assignments & Vivas
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 40 }}>
        {/* Tab Content */}
        <section>
          {activeTab === "materials" ? (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>Course Materials</h2>
              <div style={{ display: "grid", gap: 16 }}>
                {course.materials.map((m: any) => (
                  <motion.div 
                    key={m.id} 
                    whileHover={{ x: 6 }}
                    className="glass" 
                    style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(139, 92, 246, 0.05)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FileText size={22} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 700 }}>{m.title}</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                          <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                            <Calendar size={12} /> {new Date(m.created_at).toLocaleDateString()}
                          </span>
                          <span className="tag" style={{ fontSize: 10, padding: "1px 6px" }}>{m.type.toUpperCase()}</span>
                        </div>
                      </div>
                    </div>
                    <button className="btn-ghost" style={{ padding: 10 }}>
                      <Download size={18} />
                    </button>
                  </motion.div>
                ))}
                {course.materials.length === 0 && (
                  <div style={{ padding: 48, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 16 }}>
                    <p style={{ color: "var(--text-muted)" }}>No materials have been posted for this course yet.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>Socratic Assessments</h2>
              <div style={{ display: "grid", gap: 16 }}>
                {assignments.map((a: any) => (
                  <div key={a.id} className="glass" style={{ padding: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{a.title}</h3>
                      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{a.objectives_count} Learning Objectives</p>
                    </div>
                    <button 
                      onClick={async () => {
                        const { thread_id } = await api.post(`/chat/assignments/${a.id}/start`);
                        window.location.href = `/chat/${thread_id}`;
                      }}
                      className="btn-primary" 
                      style={{ padding: "8px 16px", fontSize: 14 }}
                    >
                      Start Viva
                    </button>
                  </div>
                ))}
                {assignments.length === 0 && (
                  <div style={{ padding: 48, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 16 }}>
                    <p style={{ color: "var(--text-muted)" }}>No active assessments for this course.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Course Info / Stats */}
        <aside>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>Learning Stats</h2>
          <div className="glass" style={{ padding: 24, marginBottom: 24 }}>
             <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Class Average Mastery</p>
             <h3 style={{ fontSize: 28, fontWeight: 900, color: "var(--success)" }}>82%</h3>
             <div style={{ width: "100%", height: 6, background: "rgba(0,0,0,0.05)", borderRadius: 3, marginTop: 12 }}>
                <div style={{ width: "82%", height: "100%", background: "var(--success)", borderRadius: 3 }} />
             </div>
          </div>
          
          <div className="glass" style={{ padding: 24 }}>
             <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Curriculum Insights</h4>
             <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
                <li style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
                   <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
                   {assignments.length} Available Assessments
                </li>
                <li style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
                   <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
                   {course.materials.length} Materials Synced
                </li>
             </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
