"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuthStore } from "@/lib/auth-store";

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
  const [driveMaterials, setDriveMaterials] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"profile" | "courses" | "drive">("profile");
  const [threads, setThreads] = useState<any[]>([]);

  useEffect(() => {
    api.get("/profile/digital-twin").then(setTwin).catch(() => {});
    api.get("/profile/courses").then((data: any[]) => {
      if (Array.isArray(data)) {
        setCourses(data.filter(c => c.source === "classroom"));
      }
    }).catch(() => {});
    api.get("/chat/threads").then(setThreads).catch(() => {});
    api.get("/profile/materials").then((mats: any[]) => {
      if (Array.isArray(mats)) {
        setDriveMaterials(mats.filter((m: any) => m.source === "drive" && m.type === "folder"));
      }
    }).catch(() => {});
  }, []);

  const openDriveDoc = (mat: any) => {
    // Folders open in Drive folder view; files open in file view
    if (!mat.external_id) return;
    const url = mat.type === "folder"
      ? `https://drive.google.com/drive/folders/${mat.external_id}`
      : `https://drive.google.com/file/d/${mat.external_id}/view`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const tabs = [
    { id: "profile", label: "🧠 Digital Twin" },
    { id: "courses", label: "📚 Courses" },
    { id: "drive", label: `📁 Drive Files${driveMaterials.length ? ` (${driveMaterials.length})` : ""}` },
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
        <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 40 }}>
          <div>
            {/* Conversation Summaries */}
            <div style={{ marginBottom: 48 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Recent Explorations</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {threads.length ? threads.slice(0, 5).map((t) => (
                  <Link key={t.id} href={`/chat/${t.id}`} className="glass hover-lift" style={{ display: "block", textDecoration: "none", padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{t.title}</h3>
                        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Last active {new Date(t.updated_at).toLocaleDateString()}</p>
                      </div>
                      <span style={{ fontSize: 12, opacity: 0.5 }}>→</span>
                    </div>
                  </Link>
                )) : (
                  <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No recent conversations found.</p>
                )}
              </div>
            </div>

            {/* Conceptual Milestones */}
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Conceptual Milestones</h2>
            {twin?.profile.length ? (
              <div style={{ display: "grid", gap: 16 }}>
                {twin.profile.map((p, i) => (
                  <div key={i} className="glass" style={{ padding: 24, borderLeft: "4px solid var(--accent)" }}>
                    <div className="prose-ai" style={{ fontSize: 14.5 }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{p}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="glass" style={{ padding: 40, textAlign: "center", opacity: 0.6 }}>
                <p>Engage in chats to build your intellectual profile.</p>
              </div>
            )}
          </div>

          {/* Sidebar: Intelligence Recommendations */}
          <div>
            <div className="glass" style={{ padding: 24, position: "sticky", top: 20 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20 }}>Recommendations</h2>
              <div style={{ display: "grid", gap: 20 }}>
                <div style={{ padding: 16, background: "rgba(139,92,246,0.05)", borderRadius: 12, border: "1px solid rgba(139,92,246,0.1)" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--accent)" }}>Next Strategy</p>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Based on your recent focus on {threads[0]?.title || "new topics"}, your twin recommends exploring counter-examples to strengthen your mental model.
                  </p>
                </div>
                <div style={{ padding: 16, background: "rgba(6,182,212,0.05)", borderRadius: 12, border: "1px solid rgba(6,182,212,0.1)" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#06b6d4" }}>Growth Signal</p>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    High conceptual density detected in your last 3 sessions. Consider a synthesis session to solidify these links.
                  </p>
                </div>
                <Link href="/chat" className="btn-primary" style={{ textAlign: "center", textDecoration: "none", fontSize: 13, padding: "12px" }}>Start Socratic Session</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Courses Tab */}
      {activeTab === "courses" && (
        <div className="fade-in" style={{ maxWidth: 900 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {courses.map((c) => (
              <Link key={c.id} href={`/courses/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="glass hover-lift" style={{ padding: 24, height: "100%" }}>
                  <span style={{ fontSize: 24, display: "block", marginBottom: 12 }}>🎓</span>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{c.name}</h3>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>{c.teacher || "Institutional Course"}</p>
                  <span className="tag tag-cyan">{c.source}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {/* Drive Files Tab */}
      {activeTab === "drive" && (
        <div className="fade-in" style={{ maxWidth: 1000 }}>
          {driveMaterials.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
              <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>No Drive files synced yet</p>
              <p style={{ fontSize: 13 }}>Use the Google Drive picker in the chat or integrations page to sync files.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {driveMaterials.map((mat: any) => {
                const isFolder = mat.type === "folder";
                const canOpen = !!mat.external_id;
                return (
                  <div
                    key={mat.id}
                    className="glass hover-lift"
                    onClick={() => canOpen && openDriveDoc(mat)}
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
                        {isFolder ? "📁" : "📄"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 600, lineHeight: 1.35, marginBottom: 4,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}>{mat.title}</div>
                        <span style={{
                          fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                          color: "var(--text-muted)", textTransform: "uppercase",
                          background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: 4
                        }}>{isFolder ? "Folder" : mat.type || "File"}</span>
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
                      {canOpen ? "CLICK TO OPEN IN GOOGLE DRIVE ↗" : "NO LINK AVAILABLE"}
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
