"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { BookOpen, Plus, Search, CheckCircle, GraduationCap } from "lucide-react";
import { motion } from "framer-motion";

export default function MyCourses() {
  const [enrolled, setEnrolled] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const e = await api.get("/profile/courses");
      setEnrolled(e);
      const a = await api.get("/profile/courses/discover");
      setAvailable(a);
    } catch (err) {
      console.error("Failed to fetch courses", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEnroll = async (courseId: number) => {
    try {
      await api.post(`/professor/courses/${courseId}/enroll`);
      alert("Enrolled successfully! You can now chat with materials from this course.");
      fetchData();
    } catch (err) {
      console.error("Enrollment failed", err);
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 0" }}>
        <div style={{ marginBottom: 48 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Course Management</h1>
          <p style={{ color: "var(--text-secondary)" }}>Manage your institutional curriculum and sync neural data.</p>
        </div>

        {/* My Enrolled Courses */}
        <section style={{ marginBottom: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>My Curriculum</h2>
            <span className="tag tag-blue">{enrolled.length} Active</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
            {enrolled.map((c) => (
              <motion.div 
                key={c.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -4, boxShadow: "0 20px 40px rgba(0,0,0,0.06)" }}
                onClick={() => window.location.href = `/dashboard/courses/${c.id}`}
                className="glass hover-lift" 
                style={{ padding: 24, borderLeft: "4px solid var(--accent)", cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(139, 92, 246, 0.1)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <BookOpen size={20} />
                  </div>
                  <CheckCircle size={18} color="var(--success)" />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{c.name}</h3>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>{c.teacher || "Institutional Faculty"} \u2022 Section {c.section || "A"}</p>
                <p style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Click to view curriculum →</p>
              </motion.div>
            ))}
            {enrolled.length === 0 && !loading && (
              <div style={{ gridColumn: "1 / -1", padding: 48, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 16 }}>
                <p style={{ color: "var(--text-muted)" }}>You haven't joined any courses yet. Discover available courses below.</p>
              </div>
            )}
          </div>
        </section>

        {/* Discover New Courses */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Discover Courses</h2>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {available.map((c) => (
              <div key={c.id} className="glass" style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <GraduationCap size={22} color="var(--text-muted)" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</h3>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{c.teacher || "Professor Admin"} \u2022 Section {c.section}</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleEnroll(c.id)}
                  className="btn-ghost" 
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", border: "1px solid var(--border)" }}
                >
                  <Plus size={16} /> Join Course
                </button>
              </div>
            ))}
            {available.length === 0 && !loading && (
              <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>No new courses available at this time.</p>
            )}
          </div>
        </section>
      </div>
  );
}
