"use client";
import { useEffect, useState, use, MouseEvent } from "react";
import { api } from "@/lib/api";
import Link from "next/link";

interface Attachment {
  type: "drive" | "video" | "link" | "form";
  file_type: string;
  title: string;
  url: string;
  file_id?: string;
  video_id?: string;
  thumbnail?: string;
  mime_type?: string;
}

interface Material {
  id: number;
  title: string;
  type: "assignment" | "announcement" | "material" | "file" | "folder";
  source: string;
  preview: string;
  full_text?: string;
  external_id?: string;
  parent_id?: string;
  source_link?: string;
  attachments?: Attachment[];
  created_at: string;
  due_date?: string;
}

interface Course {
  id: number;
  name: string;
  source: string;
  teacher?: string;
}

const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  assignment: { icon: "📝", label: "Assignment", color: "rgba(139, 92, 246, 0.15)" },
  announcement: { icon: "📢", label: "Announcement", color: "rgba(6, 182, 212, 0.15)" },
  material: { icon: "📚", label: "Resource", color: "rgba(16, 185, 129, 0.15)" },
  file: { icon: "📄", label: "File", color: "rgba(245, 158, 11, 0.15)" },
  folder: { icon: "📁", label: "Folder", color: "rgba(245, 158, 11, 0.1)" },
};

const ATTACHMENT_ICONS: Record<string, string> = {
  pdf: "📕",
  document: "📄",
  presentation: "📊",
  spreadsheet: "📈",
  image: "🖼️",
  youtube: "▶️",
  web: "🔗",
  google_form: "📋",
  file: "📎",
};

const ATTACHMENT_COLORS: Record<string, string> = {
  pdf: "#ef4444",
  document: "#3b82f6",
  presentation: "#f97316",
  spreadsheet: "#10b981",
  image: "#8b5cf6",
  youtube: "#ef4444",
  web: "#6366f1",
  google_form: "#10b981",
  file: "#6b7280",
};

function getAttachmentIcon(fileType: string) {
  return ATTACHMENT_ICONS[fileType] || ATTACHMENT_ICONS.file;
}

function getAttachmentColor(fileType: string) {
  return ATTACHMENT_COLORS[fileType] || ATTACHMENT_COLORS.file;
}

function getFileTypeBadge(fileType: string) {
  const badges: Record<string, string> = {
    pdf: "PDF", document: "Doc", presentation: "Slides",
    spreadsheet: "Sheet", image: "Image", youtube: "Video",
    web: "Link", google_form: "Form", file: "File",
  };
  return badges[fileType] || "File";
}

export default function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const [course, setCourse] = useState<Course | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "assignment" | "announcement" | "material" | "file">("all");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!courseId || courseId === "undefined" || courseId === "null") {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.get(`/profile/courses/${courseId}`),
      api.get(`/profile/courses/${courseId}/materials`)
    ]).then(([c, m]) => {
      if (c && !c.error) {
        setCourse(c);
        const classroomMats: Material[] = Array.isArray(m)
          ? m.filter((mat: Material) => mat.source === "classroom")
          : [];
        setMaterials(classroomMats);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [courseId]);

  const openAttachment = (att: Attachment, e: MouseEvent) => {
    e.stopPropagation();
    if (att.file_type === "pdf" && att.file_id) {
      window.open(`https://drive.google.com/file/d/${att.file_id}/preview`, "_blank", "noopener,noreferrer");
    } else if (att.url) {
      window.open(att.url, "_blank", "noopener,noreferrer");
    }
  };

  const openInClassroom = (mat: Material, e: MouseEvent) => {
    e.stopPropagation();
    if (mat.source_link) {
      window.open(mat.source_link, "_blank", "noopener,noreferrer");
    }
  };

  const tabs = [
    { id: "all", label: "ALL" },
    { id: "assignment", label: "ASSIGNMENTS" },
    { id: "announcement", label: "ANNOUNCEMENTS" },
    { id: "material", label: "RESOURCES" },
    { id: "file", label: "FILES" },
  ] as const;

  const filtered = materials.filter((m) => {
    const matchesTab = activeTab === "all" || m.type === activeTab;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || m.title.toLowerCase().includes(q) || (m.preview || "").toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  if (loading) return (
    <div style={{ padding: 60, color: "var(--text-muted)", background: "var(--bg-primary)", height: "100vh", display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 18 }}>⏳</span> Loading course...
    </div>
  );
  if (!course) return (
    <div style={{ padding: 60, background: "var(--bg-primary)", height: "100vh" }}>Course not found.</div>
  );

  const totalCount = materials.length;
  const assignmentCount = materials.filter(m => m.type === "assignment").length;
  const announcementCount = materials.filter(m => m.type === "announcement").length;
  const resourceCount = materials.filter(m => m.type === "material").length;
  const fileCount = materials.filter(m => m.type === "file").length;

  return (
    <div style={{
      height: "100vh",
      overflowY: "auto",
      padding: "40px 60px",
      background: "var(--bg-primary)",
      color: "var(--text-primary)",
      backgroundImage: "radial-gradient(var(--border) 1px, transparent 0)",
      backgroundSize: "40px 40px"
    }}>
      {/* Back Nav */}
      <Link href="/profile" style={{
        padding: "10px 14px",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: "var(--text-secondary)",
        textDecoration: "none",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.1em",
        marginBottom: 32,
        textTransform: "uppercase"
      }}>
        <span style={{ fontSize: 16 }}>←</span> Back to Dashboard
      </Link>

      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <span style={{
          background: "rgba(6, 182, 212, 0.1)", color: "#06b6d4",
          fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 4,
          letterSpacing: "0.1em", marginBottom: 12, display: "inline-block"
        }}>GOOGLE CLASSROOM</span>
        <h1 style={{ fontSize: 38, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>{course.name}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {course.teacher && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", background: "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#fff"
              }}>{course.teacher[0]}</div>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{course.teacher}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { n: totalCount, label: "total", color: "#06b6d4" },
              { n: assignmentCount, label: "assignments", color: "#8b5cf6" },
              { n: announcementCount, label: "announcements", color: "#06b6d4" },
              { n: resourceCount, label: "resources", color: "#10b981" },
              { n: fileCount, label: "files", color: "#f59e0b" },
            ].filter(b => b.n > 0).map(b => (
              <span key={b.label} style={{
                background: `${b.color}18`, border: `1px solid ${b.color}40`,
                color: b.color, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20
              }}>{b.n} {b.label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Bar + Search */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 28, borderBottom: "1px solid var(--border)", paddingBottom: 0
      }}>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                background: isActive ? "var(--accent)" : "transparent",
                border: "none", cursor: "pointer",
                padding: "9px 20px",
                borderRadius: "6px 6px 0 0",
                fontSize: 11, fontWeight: 700,
                color: isActive ? "#fff" : "var(--text-muted)",
                transition: "all 0.15s", letterSpacing: "0.05em"
              }}>{tab.label}</button>
            );
          })}
        </div>
        <div style={{ position: "relative", marginBottom: 8 }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14 }}>🔍</span>
          <input
            type="text"
            placeholder="Search materials..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              background: "var(--bg-secondary)", border: "1px solid var(--border)",
              borderRadius: 30, padding: "9px 16px 9px 38px",
              color: "var(--text-primary)", fontSize: 13, width: 240, outline: "none"
            }}
          />
        </div>
      </div>

      {/* Material Cards */}
      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 20 }}>
          {filtered.map(mat => {
            const meta = TYPE_META[mat.type] || TYPE_META["material"];
            const atts = Array.isArray(mat.attachments) ? mat.attachments : [];
            const hasClassroomLink = !!mat.source_link;

            return (
              <div
                key={mat.id}
                className="glass"
                style={{
                  padding: 20,
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {/* Card Header */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: meta.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, flexShrink: 0
                  }}>{meta.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, lineHeight: 1.35,
                      marginBottom: 4,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>{mat.title}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                        color: "var(--text-muted)", textTransform: "uppercase",
                        background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: 4
                      }}>{meta.label}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {new Date(mat.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      {mat.due_date && (
                        <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>
                          Due {new Date(mat.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                  {hasClassroomLink && (
                    <button
                      onClick={(e) => openInClassroom(mat, e)}
                      title="Open in Google Classroom"
                      style={{
                        background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)",
                        borderRadius: 8, padding: "6px 10px", cursor: "pointer",
                        fontSize: 11, fontWeight: 700, color: "#06b6d4", flexShrink: 0,
                        letterSpacing: "0.05em",
                      }}
                    >↗</button>
                  )}
                </div>

                {/* Preview Text */}
                {(mat.preview || mat.full_text) && (
                  <p style={{
                    fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55,
                    margin: 0,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                  }}>
                    {mat.preview || mat.full_text}
                  </p>
                )}

                {/* Attachments */}
                {atts.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                    <div style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
                      color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8
                    }}>
                      📎 Attachments ({atts.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {atts.map((att, idx) => {
                        const icon = getAttachmentIcon(att.file_type);
                        const color = getAttachmentColor(att.file_type);
                        const badge = getFileTypeBadge(att.file_type);
                        return (
                          <button
                            key={idx}
                            onClick={(e) => openAttachment(att, e)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              background: "var(--bg-secondary)",
                              border: "1px solid var(--border)",
                              borderRadius: 8, padding: "8px 12px",
                              cursor: "pointer", textAlign: "left",
                              transition: "all 0.15s",
                              width: "100%",
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLButtonElement).style.borderColor = color;
                              (e.currentTarget as HTMLButtonElement).style.background = `${color}15`;
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-secondary)";
                            }}
                          >
                            <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                            <span style={{
                              fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)",
                              flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                            }}>{att.title}</span>
                            <span style={{
                              fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                              color, textTransform: "uppercase",
                              background: `${color}20`, padding: "2px 6px", borderRadius: 4, flexShrink: 0
                            }}>{badge}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Footer */}
                {atts.length === 0 && !hasClassroomLink && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em", marginTop: "auto" }}>
                    NO ATTACHMENTS
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "100px 20px", color: "var(--text-muted)" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🕳️</div>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>No materials found</p>
      <p style={{ fontSize: 13 }}>Sync your Classroom to fetch assignments, announcements, and files.</p>
    </div>
  );
}
