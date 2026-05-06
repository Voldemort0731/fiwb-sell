"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Users, BookOpen, AlertCircle, TrendingDown, CheckCircle2, FileText, GraduationCap } from "lucide-react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MasteryGraph from "@/components/MasteryGraph";

export default function ProfessorDashboard() {
  const [stats, setStats] = useState<any>({ total_students: 0, avg_mastery: 0, critical_concepts: 0, course_mastery: [] });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [insight, setInsight] = useState<string>("");
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [courseHistory, setCourseHistory] = useState<any[]>([]);
  const [courseGraph, setCourseGraph] = useState<any>({ nodes: [], edges: [] });
  const [generatingPlan, setGeneratingPlan] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const [courses, setCourses] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [assessments, setAssessments] = useState<any[]>([]);

  const fetchCourses = async () => {
    try {
      const res = await api.get("/professor/courses");
      setCourses(res);
      if (res.length > 0 && !selectedCourse) {
        fetchCourseDetails(res[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch courses", err);
    }
  };

  const [materials, setMaterials] = useState<any[]>([]);

  const fetchCourseDetails = async (courseId: number) => {
    setSelectedCourse(courseId);
    try {
      const history = await api.get(`/professor/courses/${courseId}/analytics/history`);
      setCourseHistory(history);
      const graph = await api.get(`/professor/courses/${courseId}/mastery-graph`);
      setCourseGraph(graph);
      // Fetch assessments for this course
      const assessmentsRes = await api.get(`/professor/assessments`);
      setAssessments(assessmentsRes.filter((a: any) => a.course_id === courseId));
      // Fetch materials
      const mats = await api.get(`/professor/courses/${courseId}/materials`);
      setMaterials(mats);
    } catch (err) {
      console.error("Failed to fetch course details", err);
    }
  };

  useEffect(() => {
    fetchCourses();
    api.get("/professor/analytics/overview").then(setStats).catch(() => {});
    api.get("/professor/alerts").then(setAlerts).catch(() => {});
    api.get("/professor/insights").then(res => setInsight(res.insight)).catch(() => {});
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !uploadFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("course_id", selectedCourse.toString());
      formData.append("file", uploadFile);
      await api.post("/professor/upload", formData);
      alert("Success: Content synced to all registered students' Neural Knowledge Base.");
      setUploadFile(null);
      fetchCourseDetails(selectedCourse);
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleReinforcement = async (alert: any) => {
    setGeneratingPlan(alert.concept_name);
    try {
      await api.post(`/professor/courses/${alert.course_id}/reinforcement`, { concept: alert.concept_name });
      alert.deployed = true;
      setAlerts([...alerts]);
    } catch (err) {
      console.error("Failed to deploy plan", err);
    } finally {
      setGeneratingPlan(null);
    }
  };

  const currentCourse = courses.find(c => c.id === selectedCourse);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      {/* 🚀 Header & Course Selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
            {currentCourse ? currentCourse.name : "Institutional Dashboard"}
          </h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <select 
              value={selectedCourse || ""} 
              onChange={(e) => fetchCourseDetails(Number(e.target.value))}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, fontWeight: 600 }}
            >
              <option value="" disabled>Switch Course...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span style={{ fontSize: 14, color: "#666" }}>Section {currentCourse?.section || "N/A"} \u2022 Faculty Lead</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn-ghost">Export Reports</button>
          <button className="btn-primary" onClick={() => window.location.href = "/professor/assessment/build"}>+ New Assessment</button>
        </div>
      </div>

      {/* 🚀 Tabs */}
      <div style={{ display: "flex", gap: 32, borderBottom: "1px solid #eee" }}>
        {["overview", "curriculum", "assessments"].map((tab) => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ 
              padding: "12px 4px", 
              fontSize: 14, 
              fontWeight: 700, 
              textTransform: "capitalize",
              color: activeTab === tab ? "var(--accent)" : "#999",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer"
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 🚀 Tab Content */}
      <div className="fade-in">
        {activeTab === "overview" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 48 }}>
              {[
                { label: "Active Learners", value: stats.total_students, icon: <Users />, color: "#8b5cf6" },
                { label: "Avg Mastery Score", value: `${stats.avg_mastery}%`, icon: <BookOpen />, color: "#10b981" },
                { label: "Intervention Alerts", value: alerts.filter(a => !selectedCourse || a.course_id === selectedCourse).length, icon: <AlertCircle />, color: "#ef4444" },
              ].map((item, i) => (
                <div key={i} className="glass" style={{ padding: 24 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${item.color}10`, color: item.color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                    {item.icon}
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#999", marginBottom: 4 }}>{item.label}</p>
                  <h3 style={{ fontSize: 24, fontWeight: 900 }}>{item.value}</h3>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 40 }}>
              <section>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>AI Strategic Synthesis</h2>
                <div className="glass" style={{ padding: 32, minHeight: 200 }}>
                  <p style={{ fontSize: 15, lineHeight: 1.8, color: "#444", whiteSpace: "pre-wrap" }}>
                    {insight || "Select a course and upload materials to generate class-wide strategic insights."}
                  </p>
                </div>
              </section>
              <section>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>System Bottlenecks</h2>
                <div style={{ display: "grid", gap: 12 }}>
                  {alerts.filter(a => !selectedCourse || a.course_id === selectedCourse).map((alert, i) => (
                    <div key={i} className="glass" style={{ padding: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>{alert.concept_name}</span>
                        <span style={{ color: "#ef4444", fontWeight: 800, fontSize: 14 }}>{alert.avg_mastery}%</span>
                      </div>
                      <button 
                        onClick={() => handleReinforcement(alert)}
                        disabled={generatingPlan === alert.concept_name || alert.deployed}
                        className={alert.deployed ? "btn-ghost" : "btn-primary"} 
                        style={{ width: "100%", borderRadius: 8, padding: 8, fontSize: 12 }}
                      >
                        {alert.deployed ? "✓ Session Pushed" : "Push Reinforcement"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}

        {activeTab === "curriculum" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 40 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>Neural Knowledge Graph</h2>
                <div style={{ display: "flex", gap: 16, fontSize: 12, fontWeight: 600 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} /> High Mastery</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} /> Critical Gap</span>
                </div>
              </div>
              <div className="glass" style={{ height: 400, padding: 20, marginBottom: 40 }}>
                <MasteryGraph data={courseGraph} height="100%" />
              </div>

              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>Course Materials</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {materials.map((m) => (
                  <div key={m.id} className="glass" style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <FileText size={18} color="var(--accent)" />
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{m.title}</span>
                    </div>
                    <span className="tag" style={{ fontSize: 10 }}>{m.type.toUpperCase()}</span>
                  </div>
                ))}
                {materials.length === 0 && (
                  <p style={{ color: "#999", fontSize: 14, textAlign: "center", padding: 20 }}>No materials uploaded for this course.</p>
                )}
              </div>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div className="glass-strong" style={{ padding: 24, border: "2px solid var(--accent)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: "var(--accent)" }}>Knowledge Sync</h3>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 20, lineHeight: 1.5 }}>
                  Materials uploaded here are instantly indexed into the **Neural Memory** of all registered students.
                </p>
                <form onSubmit={handleUpload}>
                  <div style={{ marginBottom: 12 }}>
                    <input type="file" id="dash-upload" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
                    <label htmlFor="dash-upload" style={{ display: "block", padding: 12, border: "1px dashed #ddd", borderRadius: 10, textAlign: "center", cursor: "pointer", fontSize: 12 }}>
                      {uploadFile ? uploadFile.name : "Select Material (PDF/Doc)"}
                    </label>
                  </div>
                  <button disabled={isUploading || !uploadFile} className="btn-primary" style={{ width: "100%", borderRadius: 8 }}>
                    {isUploading ? "Syncing..." : "Push to Neural Lab"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {activeTab === "assessments" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>Deployed AI Assessments</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 24 }}>
              {assessments.map((a) => (
                <div key={a.id} className="glass" style={{ padding: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(139, 92, 246, 0.1)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <GraduationCap size={20} />
                    </div>
                    <span className="tag tag-blue">Socratic Viva</span>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{a.title}</h3>
                  <p style={{ fontSize: 12, color: "#666", marginBottom: 16, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.objective}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>{a.student_count || 0} Submissions</span>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 12px" }}>View Details</button>
                  </div>
                </div>
              ))}
              {assessments.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: 60, textAlign: "center", border: "1px dashed #ddd", borderRadius: 20 }}>
                  <p style={{ color: "#999" }}>No assessments deployed yet. Create one to begin AI-assisted grading.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
