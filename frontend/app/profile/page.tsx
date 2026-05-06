"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuthStore } from "@/lib/auth-store";
import { Trash2 } from "lucide-react";

interface DigitalTwin {
  user: { email: string; name: string; picture: string };
  profile: string[];
  recent_memories: string[];
  stats: { total_slm_tokens: number; total_llm_tokens: number; total_cost_usd: number };
}

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [twin, setTwin] = useState<DigitalTwin | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"profile" | "courses" | "documents" | "uploads">("profile");
  const [threads, setThreads] = useState<any[]>([]);

  const fetchMaterials = () => {
    api.get("/profile/materials").then((mats: any[]) => {
      if (Array.isArray(mats)) setMaterials(mats);
    }).catch(() => {});
  };

  useEffect(() => {
    api.get("/profile/digital-twin").then(setTwin).catch(() => {});
    api.get("/profile/courses").then((data: any[]) => {
      if (Array.isArray(data)) {
        setCourses(data);
      }
    }).catch(() => {});
    api.get("/chat/threads").then(setThreads).catch(() => {});
    fetchMaterials();
  }, []);

  const handleDeleteMaterial = async (e: React.MouseEvent, matId: number) => {
    e.stopPropagation();
    if (!confirm("Do you want to delete this from your Memory?")) return;
    try {
      await api.delete(`/profile/materials/${matId}`);
      fetchMaterials();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const openMaterial = async (mat: any) => {
    if (mat.source === "manual_upload" || mat.file_content_exists || (!mat.external_id && mat.source_link?.includes("/proxy/drive/"))) {
      try {
        const { token } = await api.get(`/profile/proxy/drive/${mat.id}/token`);
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";
        const viewUrl = `${backendUrl}/profile/proxy/drive/${mat.id}/view?token=${token}`;
        window.open(viewUrl, "_blank", "noopener,noreferrer");
        return;
      } catch (err) {
        console.error("Failed to get view token:", err);
      }
    }

    let url = mat.source_link;
    if (!url && mat.external_id) {
       url = mat.type === "folder"
          ? `https://drive.google.com/drive/folders/${mat.external_id}`
          : `https://drive.google.com/file/d/${mat.external_id}/view`;
    }

    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const syncedMaterials = materials.filter(m => m.source !== "manual_upload");
  const manualUploads = materials.filter(m => m.source === "manual_upload");

  const tabs = [
    { id: "profile", label: "Digital Twin" },
    { id: "courses", label: `Courses${courses.length ? ` (${courses.length})` : ""}` },
    { id: "documents", label: `Documents${syncedMaterials.length ? ` (${syncedMaterials.length})` : ""}` },
    { id: "uploads", label: `Uploads${manualUploads.length ? ` (${manualUploads.length})` : ""}` },
  ] as const;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "40px 48px" }}>
        {/* Profile Header */}
        <div className="fade-in" style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
          <div style={{ position: "relative" }}>
            <img
              src={user?.picture || "/avatar.png"}
              alt={user?.name}
              style={{ width: 64, height: 64, borderRadius: 99, border: "2px solid var(--border)" }}
            />
            <div style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: 99, background: "linear-gradient(135deg,#8b5cf6,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, border: "2px solid var(--bg-primary)" }}>🧠</div>
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>{user?.name}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{user?.email}</p>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <span className="tag tag-purple">Digital Twin Active</span>
              <span className="tag tag-cyan">{courses.length} Courses</span>
              <span className="tag tag-amber">{syncedMaterials.length} Syncs</span>
              <span className="tag tag-purple">{manualUploads.length} Uploads</span>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div style={{ display: "flex", gap: 32, marginBottom: 40, borderBottom: "1px solid var(--border)" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "0 0 16px 0", fontSize: 15, fontWeight: 600,
                color: activeTab === tab.id ? "var(--accent)" : "var(--text-muted)",
                borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "profile" && (
          <div className="fade-in" style={{ maxWidth: 1000 }}>
            <div style={{ marginBottom: 48 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Recent Explorations</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {threads.length ? threads.slice(0, 10).map((t) => (
                  <Link key={t.id} href={`/chat/${t.id}`} className="glass hover-lift" style={{ display: "block", textDecoration: "none", padding: "20px 24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{t.title}</h3>
                        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Last active {new Date(t.updated_at).toLocaleDateString()}</p>
                      </div>
                      <span style={{ fontSize: 14, opacity: 0.5 }}>→</span>
                    </div>
                  </Link>
                )) : (
                  <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No recent conversations found.</p>
                )}
              </div>
            </div>

            {twin?.profile && twin.profile.length > 0 && (
              <div style={{ marginBottom: 48 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Conceptual Milestones</h2>
                <div style={{ display: "grid", gap: 16 }}>
                  {twin.profile.map((p, i) => (
                    <div key={i} className="glass" style={{ padding: 24, borderLeft: "4px solid var(--accent)" }}>
                      <div className="prose-ai" style={{ fontSize: 14.5 }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{p}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Synchronized Curriculum Section */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
               <div>
                 <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Current Curriculum</h2>
                 <div style={{ display: "grid", gap: 12 }}>
                   {courses.slice(0, 3).map(c => (
                     <Link key={c.id} href={`/dashboard/courses/${c.id}`} className="glass hover-lift" style={{ display: "block", textDecoration: "none", padding: 16 }}>
                        <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{c.name}</h4>
                        <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.teacher}</p>
                     </Link>
                   ))}
                   {courses.length > 3 && <p style={{ fontSize: 12, color: "var(--accent)", cursor: "pointer" }} onClick={() => setActiveTab("courses")}>+ {courses.length - 3} more courses</p>}
                 </div>
               </div>
               <div>
                 <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Neural Knowledge Base</h2>
                 <div style={{ display: "grid", gap: 12 }}>
                   {materials.slice(0, 3).map(m => (
                     <div key={m.id} className="glass" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 18 }}>{m.type === "folder" ? "📁" : "📄"}</div>
                        <div style={{ minWidth: 0 }}>
                           <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</h4>
                           <p style={{ fontSize: 10, color: "var(--text-muted)" }}>Synced from {m.source}</p>
                        </div>
                     </div>
                   ))}
                   {materials.length > 3 && <p style={{ fontSize: 12, color: "var(--accent)", cursor: "pointer" }} onClick={() => setActiveTab("documents")}>+ {materials.length - 3} more syncs</p>}
                 </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === "courses" && (
          <div className="fade-in" style={{ maxWidth: 900 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
              {courses.map((c) => (
                <Link key={c.id} href={`/dashboard/courses/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="glass hover-lift" style={{ padding: 24, height: "100%" }}>
                    <span style={{ fontSize: 24, display: "block", marginBottom: 12 }}>{c.source === "drive" ? "📁" : "🎓"}</span>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{c.name}</h3>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>{c.teacher || "Institutional Course"}</p>
                    <span className={c.source === "drive" ? "tag tag-amber" : "tag tag-cyan"}>{c.source}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="fade-in" style={{ maxWidth: 1000 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {syncedMaterials.map((mat: any) => (
                <div key={mat.id} className="glass hover-lift" onClick={() => openMaterial(mat)} style={{ padding: 20, borderRadius: 12, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(6, 182, 212, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                      {mat.type === "folder" ? "📁" : "📄"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mat.title}</div>
                      <span className="tag tag-cyan" style={{ fontSize: 9 }}>{mat.source}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "uploads" && (
          <div className="fade-in" style={{ maxWidth: 1000 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {manualUploads.map((mat: any) => (
                <div key={mat.id} className="glass hover-lift" onClick={() => openMaterial(mat)} style={{ padding: 20, borderRadius: 12, cursor: "pointer", position: "relative" }}>
                   <button onClick={(e) => handleDeleteMaterial(e, mat.id)} style={{ position: "absolute", top: 12, right: 12, background: "rgba(239, 68, 68, 0.1)", border: "none", width: 28, height: 28, borderRadius: 6, color: "#ef4444", cursor: "pointer" }}>
                    <Trash2 size={14} />
                  </button>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(139, 92, 246, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📄</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mat.title}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
