"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Upload, Link as LinkIcon, FileText, Video, Trash2, CheckCircle, Clock, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ProfessorCourses() {
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [ytLink, setYtLink] = useState("");
  const [materials, setMaterials] = useState<any[]>([]);
  const [modalType, setModalType] = useState<string | null>(null);
  const [modalData, setModalData] = useState<any>(null);
  const [newCourseName, setNewCourseName] = useState("");

  const handleCreateCourse = async () => {
    if (!newCourseName.trim()) return;
    try {
      const res = await api.post("/professor/courses", { name: newCourseName });
      setCourses([...courses, res]);
      setSelectedCourse(res);
      setModalType(null);
      setNewCourseName("");
    } catch (err) {
      console.error("Create course failed", err);
    }
  };

  useEffect(() => {
    api.get("/professor/courses").then((data) => {
      setCourses(data);
      if (data.length > 0) setSelectedCourse(data[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      api.get(`/professor/courses/${selectedCourse.id}/materials`).then(setMaterials).catch(() => {});
    }
  }, [selectedCourse]);

  const generateQuiz = async (mat: any) => {
    setUploading(true);
    try {
      const res = await api.post("/professor/generate-questions", { material_id: mat.id });
      setModalType("quiz");
      setModalData({ questions: res.questions, mat_id: mat.id });
    } catch (err) {
      console.error("Quiz gen failed", err);
    } finally {
      setUploading(false);
    }
  };

  const showHeatmap = async (mat: any) => {
    setUploading(true);
    try {
      const res = await api.get(`/professor/materials/${mat.id}/heatmap`);
      setModalType("heatmap");
      setModalData({ mat, heatmap: res });
    } catch (err) {
      console.error("Heatmap failed", err);
    } finally {
      setUploading(false);
    }
  };

  const publishAssessment = async () => {
    if (!modalData || !selectedCourse) return;
    setUploading(true);
    try {
      await api.post("/professor/assessment", {
        title: `Viva: ${materials.find((m: any) => m.id === modalData.mat_id)?.title || "AI Quiz"}`,
        course_id: selectedCourse.id,
        material_id: modalData.mat_id,
        objective: "Evaluate student's depth of understanding based on the material.",
        config: { questions: modalData.questions }
      });
      setModalType(null);
      alert("Assessment published to students!");
    } catch (err) {
      console.error("Publish failed", err);
      alert("Failed to publish assessment.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCourse) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("course_id", selectedCourse.id);

    try {
      await api.post("/professor/upload", formData);
      // Refresh materials
      api.get(`/professor/courses/${selectedCourse.id}/materials`).then(setMaterials);
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  const handleYtSubmit = async () => {
    if (!ytLink.trim() || !selectedCourse) return;
    setUploading(true);
    try {
      await api.post("/professor/upload/youtube", { url: ytLink, course_id: selectedCourse.id });
      setYtLink("");
      api.get(`/professor/courses/${selectedCourse.id}/materials`).then(setMaterials);
    } catch (err) {
      console.error("YT sync failed", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 40 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Course Materials</h1>
          <p style={{ color: "var(--text-secondary)" }}>Manage shared knowledge indices for your students.</p>
        </div>
        
        <div style={{ display: "flex", gap: 12 }}>
          <button 
            onClick={() => setModalType("create_course")}
            className="btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <Plus size={16} /> Create Course
          </button>
          <select 
            value={selectedCourse?.id} 
            onChange={(e) => setSelectedCourse(courses.find(c => c.id === parseInt(e.target.value)))}
            className="glass"
            style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card)", fontSize: 14, outline: "none" }}
          >
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 40 }}>
        {/* Materials List */}
        <section>
          <div style={{ display: "grid", gap: 12 }}>
            <AnimatePresence mode="popLayout">
              {materials.map((mat, i) => (
                <motion.div 
                  key={mat.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass"
                  style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {mat.source === 'youtube' ? <Video size={18} color="#ef4444" /> : <FileText size={18} color="var(--accent)" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mat.title}</h3>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{mat.source === 'youtube' ? 'Video Transcript' : 'PDF Document'} • {new Date(mat.created_at).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {mat.status === 'processed' ? (
                      <span className="tag tag-green"><CheckCircle size={10} style={{ marginRight: 4 }} /> Indexed</span>
                    ) : (
                      <span className="tag tag-amber"><Clock size={10} style={{ marginRight: 4 }} /> Processing</span>
                    )}
                    
                    <button 
                      onClick={() => generateQuiz(mat)}
                      style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      title="AI Quiz Draft"
                    >
                      <Plus size={14} /> 🪄
                    </button>

                    <button 
                      onClick={() => showHeatmap(mat)}
                      style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer" }}
                      title="Engagement Heatmap"
                    >
                      🔥
                    </button>

                    <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><Trash2 size={16} /></button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {materials.length === 0 && (
              <div style={{ padding: 60, textAlign: "center", border: "2px dashed var(--border)", borderRadius: 20, color: "var(--text-muted)" }}>
                <p>No materials uploaded for this course yet.</p>
              </div>
            )}
          </div>
        </section>

        {/* Upload Sidebar */}
        <aside>
          <div className="glass-strong" style={{ padding: 24, position: "sticky", top: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Ingest Content</h3>
            
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase" }}>Upload Documents</label>
              <div 
                onClick={() => document.getElementById('faculty-upload')?.click()}
                style={{ height: 120, border: "2px dashed var(--border)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", transition: "all 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
              >
                <Upload size={24} color="var(--text-muted)" />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{uploading ? 'Processing...' : 'Click to upload PDF/PPTX'}</span>
                <input type="file" id="faculty-upload" hidden onChange={handleFileUpload} disabled={uploading} />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase" }}>YouTube Lecture</label>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1, position: "relative" }}>
                   <input 
                    type="text" 
                    placeholder="Paste link..." 
                    className="chat-input"
                    value={ytLink}
                    onChange={(e) => setYtLink(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", background: "rgba(0,0,0,0.03)", borderRadius: 8, fontSize: 13 }}
                  />
                  <LinkIcon size={14} style={{ position: "absolute", right: 10, top: 12, opacity: 0.3 }} />
                </div>
                <button 
                  onClick={handleYtSubmit}
                  disabled={uploading || !ytLink}
                  className="btn-primary" 
                  style={{ padding: 10, borderRadius: 8 }}
                >
                  Go
                </button>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Transcripts are automatically extracted and indexed into the course graph.</p>
            </div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {modalType && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}
            onClick={() => setModalType(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass-strong"
              style={{ width: "100%", maxWidth: 600, maxHeight: "80vh", overflowY: "auto", padding: 32, position: "relative" }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => setModalType(null)} style={{ position: "absolute", top: 20, right: 20, background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-muted)" }}>×</button>
              
              {modalType === 'create_course' && (
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Create New Course</h2>
                  <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>Establish a new shared knowledge index for your students.</p>
                  
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Course Name</label>
                    <input 
                      type="text" 
                      className="chat-input"
                      placeholder="e.g., CS101: Intro to AI"
                      value={newCourseName}
                      onChange={(e) => setNewCourseName(e.target.value)}
                      style={{ width: "100%", padding: 14 }}
                    />
                  </div>
                  
                  <button 
                    onClick={handleCreateCourse}
                    className="btn-primary" 
                    style={{ width: "100%", padding: 14 }}
                  >
                    Create Course
                  </button>
                </div>
              )}

              {modalType === 'quiz' && (
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>AI Quiz Draft</h2>
                  <div style={{ display: "grid", gap: 20 }}>
                    {modalData.questions.map((q: any, i: number) => (
                      <div key={i} style={{ padding: 16, background: "rgba(0,0,0,0.03)", borderRadius: 12 }}>
                        <p style={{ fontWeight: 600, marginBottom: 8 }}>{i+1}. {q.question}</p>
                        {q.type === 'mcq' && (
                          <div style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--text-secondary)" }}>
                            {q.options.map((opt: string) => <div key={opt}>• {opt}</div>)}
                          </div>
                        )}
                        <p style={{ fontSize: 12, marginTop: 12, color: "var(--accent)", fontWeight: 700 }}>Answer: {q.answer}</p>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={publishAssessment}
                    disabled={uploading}
                    className="btn-primary" 
                    style={{ width: "100%", marginTop: 32, padding: 14 }}
                  >
                    {uploading ? "Publishing..." : "Create Assessment from Draft"}
                  </button>
                </div>
              )}

              {modalType === 'heatmap' && (
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Engagement Heatmap</h2>
                  <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>Hotspots where students asked the most questions in {modalData.mat.title}</p>
                  
                  <div style={{ display: "grid", gap: 10 }}>
                    {modalData.heatmap.sort((a:any, b:any) => b.hits - a.hits).map((h: any) => (
                      <div key={h.page} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <span style={{ width: 60, fontSize: 13, fontWeight: 700 }}>Page {h.page}</span>
                        <div style={{ flex: 1, height: 12, background: "rgba(0,0,0,0.05)", borderRadius: 6, overflow: "hidden" }}>
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, (h.hits / (modalData.heatmap[0]?.hits || 1)) * 100)}%` }}
                            style={{ height: "100%", background: "linear-gradient(90deg, #f97316, #ef4444)" }}
                          />
                        </div>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{h.hits} hits</span>
                      </div>
                    ))}
                    {modalData.heatmap.length === 0 && <p style={{ textAlign: "center", padding: 40 }}>No engagement data collected yet.</p>}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
