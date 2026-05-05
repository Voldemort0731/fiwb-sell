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
        setCourses(data.filter(c => c.source === "classroom"));
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
    // If it's a manual upload or we have it locally, we want the /view endpoint directly
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
      {/* Restored Profile Header */}
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

      {/* Digital Twin Content */}
      {activeTab === "profile" && (
        <div className="fade-in" style={{ maxWidth: 1000, margin: "0 auto" }}>
          {/* Conversation Summaries */}
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

          {/* Conceptual Milestones */}
          {twin?.profile && twin.profile.length > 0 && (
            <>
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
            </>
          )}
        </div>
      )}

      {/* Courses Tab */}
      {activeTab === "courses" && (
        <div className="fade-in" style={{ maxWidth: 900 }}>
          {courses.length === 0 ? (
            <div className="glass" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              <p>No courses returned by the local database yet.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
              {courses.map((c) => (
                <Link key={c.id} href={`/courses/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="glass hover-lift" style={{ padding: 24, height: "100%" }}>
                    <span style={{ fontSize: 24, display: "block", marginBottom: 12 }}>{c.source === "drive" ? "📁" : "🎓"}</span>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{c.name}</h3>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>{c.teacher || "Institutional Course"}</p>
                    <span className={c.source === "drive" ? "tag tag-amber" : "tag tag-cyan"}>{c.source}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Documents Tab */}
      {activeTab === "documents" && (
        <div className="fade-in" style={{ maxWidth: 1000 }}>
          {syncedMaterials.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
              <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>No synced documents found</p>
              <p style={{ fontSize: 13 }}>Sync Classroom or Drive to populate this list.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {syncedMaterials.map((mat: any) => {
                const isFolder = mat.type === "folder";
                const canOpen = !!(mat.source_link || mat.external_id);
                return (
                  <div
                    key={mat.id}
                    className="glass hover-lift"
                    onClick={() => canOpen && openMaterial(mat)}
                    style={{
                      padding: 20,
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      cursor: canOpen ? "pointer" : "default",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        background: isFolder ? "rgba(234, 179, 8, 0.15)" : "rgba(6, 182, 212, 0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                      }}>
                        {isFolder ? "📁" : mat.source === "classroom" ? "🎓" : "📄"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 600, lineHeight: 1.35, marginBottom: 4,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}>{mat.title}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                            color: "var(--text-muted)", textTransform: "uppercase",
                            background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: 4
                          }}>{mat.source}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                            color: "var(--text-muted)", textTransform: "uppercase",
                            background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: 4
                          }}>{isFolder ? "Folder" : mat.type || "File"}</span>
                        </div>
                      </div>
                      {canOpen && <span style={{ color: "var(--text-muted)", fontSize: 14, flexShrink: 0 }}>↗</span>}
                    </div>
                    {mat.preview && (
                      <p style={{
                        fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, margin: 0,
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>{mat.preview}</p>
                    )}
                    <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em", marginTop: "auto" }}>
                      {canOpen ? "CLICK TO OPEN SOURCE ↗" : "NO LINK AVAILABLE"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Uploads Tab */}
      {activeTab === "uploads" && (
        <div className="fade-in" style={{ maxWidth: 1000 }}>
          {manualUploads.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📤</div>
              <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>No manual uploads yet</p>
              <p style={{ fontSize: 13 }}>Use the manual upload button on the home page to add documents.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {manualUploads.map((mat: any) => {
                return (
                  <div
                    key={mat.id}
                    className="glass hover-lift"
                    onClick={() => openMaterial(mat)}
                    style={{
                      padding: 20,
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      transition: "all 0.2s",
                      position: "relative"
                    }}
                  >
                    <button 
                      onClick={(e) => handleDeleteMaterial(e, mat.id)}
                      style={{
                        position: "absolute", top: 12, right: 12,
                        background: "rgba(239, 68, 68, 0.1)", border: "none",
                        width: 28, height: 28, borderRadius: 6, color: "#ef4444",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", zIndex: 10, opacity: 0, transition: "opacity 0.2s"
                      }}
                      className="delete-btn"
                      title="Delete document"
                    >
                      <Trash2 size={14} />
                    </button>
                    <style jsx>{`
                      .glass:hover .delete-btn { opacity: 1 !important; }
                    `}</style>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        background: "rgba(139, 92, 246, 0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                      }}>
                        📄
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 600, lineHeight: 1.35, marginBottom: 4,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}>{mat.title}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                            color: "var(--text-muted)", textTransform: "uppercase",
                            background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: 4
                          }}>Manual</span>
                          <span style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                            color: "var(--text-muted)", textTransform: "uppercase",
                            background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: 4
                          }}>{mat.type || "File"}</span>
                        </div>
                      </div>
                      <span style={{ color: "var(--text-muted)", fontSize: 14, flexShrink: 0 }}>↗</span>
                    </div>
                    {mat.preview && (
                      <p style={{
                        fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, margin: 0,
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>{mat.preview}</p>
                    )}
                    <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em", marginTop: "auto" }}>
                      OPEN DOCUMENT ↗
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
