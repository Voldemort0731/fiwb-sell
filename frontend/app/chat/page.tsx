"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import GoogleDrivePicker from "@/components/GoogleDrivePicker";

export default function ChatHome() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleNewChat = () => {
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/chat/new?prompt=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/chat/new");
    }
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post("/integrations/upload", formData);
      alert(`Successfully uploaded "${file.name}"! You can find it in your Digital Twin under "Uploads".`);
    } catch (err) {
      console.error("Manual upload failed:", err);
      alert("Failed to upload document. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleDriveFilesSelected = async (fileIds: string[]) => {
    if (fileIds.length === 0) return;
    setSyncingDrive(true);
    try {
      await api.post("/integrations/drive/sync", { file_ids: fileIds });
      alert(`Successfully queued ${fileIds.length} files for synchronization! They will appear in your context shortly.`);
    } catch (err) {
      console.error("Drive sync failed:", err);
      alert("Failed to start Drive sync. Please try again.");
    } finally {
      setSyncingDrive(false);
    }
  };

  const [syncingClassroom, setSyncingClassroom] = useState(false);
  const [heading, setHeading] = useState("How can I help you today?");
  const [placeholder, setPlaceholder] = useState("Message FIWB...");

  const HEADINGS = [
    "What can I help you ace?",
    "Where do we start today?",
    "What shall we figure out?"
  ];

  const PLACEHOLDERS = [
    "Let's Cook",
    "Ask me anything about your courses...",
    "Start with a topic, a doubt, or a file..."
  ];

  useEffect(() => {
    const hIdx = Math.floor(Math.random() * HEADINGS.length);
    const pIdx = Math.floor(Math.random() * PLACEHOLDERS.length);
    setHeading(HEADINGS[hIdx]);
    setPlaceholder(PLACEHOLDERS[pIdx]);
  }, []);

  const handleRefreshClassroom = async () => {
    setSyncingClassroom(true);
    try {
      await api.post("/integrations/sync/classroom");
      alert("Classroom synchronization started in the background. Your course materials will be updated shortly.");
    } catch (err) {
      console.error("Classroom sync failed:", err);
      alert("Failed to start Classroom sync. Please ensure your Google account is connected.");
    } finally {
      setSyncingClassroom(false);
    }
  };

  const firstName = user?.name?.split(" ")[0] || "there";
  const [announcements, setAnnouncements] = useState<any[]>([]);

  useEffect(() => {
    // Fetch latest reinforcement plans/announcements from enrolled courses
    api.get("/profile/announcements").then(setAnnouncements).catch(() => {});
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px", background: "transparent" }}>
        {/* Hidden file input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleManualUpload} 
          style={{ display: "none" }} 
        />

        {/* AI Spotlight Section */}
        <div className="fade-in" style={{ textAlign: "center", width: "100%", maxWidth: 820 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20 }}>
              <img src="/logo.png" alt="FIWB" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }} />
            </div>
            <h1 className="claude-home-title" style={{ fontSize: 52, fontWeight: 500, letterSpacing: "0.04em", lineHeight: 1.2 }}>{heading}</h1>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: 16.5, marginBottom: 36, fontWeight: 500 }}>
            Search your Drive, Classroom, courses, or start a new chat, {firstName}.
          </p>
          
          {/* Input bar */}
          <div style={{ maxWidth: 800, margin: "0 auto", position: "relative" }}>
            <div style={{
              display: "flex", alignItems: "center",
              padding: "14px 14px 14px 24px",
              borderRadius: 28,
              border: "1.5px solid rgba(70,54,38,0.14)",
              background: "#fffdf8",
              boxShadow: "0 24px 64px rgba(72,54,35,0.13), 0 0 0 0.5px rgba(72,54,35,0.08)",
              transition: "all 0.2s ease",
            }}>
              <input 
                type="text" 
                placeholder={placeholder} 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNewChat();
                }}
                style={{ flex: 1, background: "none", border: "none", color: "var(--text-primary)", outline: "none", fontSize: 17, fontFamily: "inherit", fontWeight: 500 }}
              />
              <button onClick={handleNewChat} className="btn-primary" style={{ padding: "13px 22px", borderRadius: 18, display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
                Start chat <span style={{ fontSize: 18 }}>↑</span>
              </button>
            </div>
          </div>

          {/* Quick action pills */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
            <GoogleDrivePicker
              onFilesSelected={handleDriveFilesSelected}
              triggerElement={(openPicker) => (
                <button 
                  onClick={openPicker} 
                  className="glass hover-lift" 
                  disabled={syncingDrive}
                  style={{ padding: "10px 20px", borderRadius: 999, border: "1px solid rgba(70,54,38,0.16)", cursor: "pointer", color: "var(--text-secondary)", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, opacity: syncingDrive ? 0.5 : 1, boxShadow: "0 2px 8px rgba(70,54,38,0.06)", transition: "all 0.2s", background: "rgba(255,252,244,0.85)" }}
                >
                  {syncingDrive ? "⏳ Syncing..." : "📁 Sync Drive"}
                </button>
              )}
            />
            <button 
              onClick={handleRefreshClassroom} 
              className="glass hover-lift" 
              disabled={syncingClassroom}
              style={{ padding: "10px 20px", borderRadius: 999, border: "1px solid rgba(70,54,38,0.16)", cursor: "pointer", color: "var(--text-secondary)", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, opacity: syncingClassroom ? 0.5 : 1, boxShadow: "0 2px 8px rgba(70,54,38,0.06)", background: "rgba(255,252,244,0.85)" }}
            >
              {syncingClassroom ? "⏳ Syncing..." : "🎓 Refresh Classroom"}
            </button>
            
            <button 
              onClick={() => {
                const id = prompt("Enter Course ID to join:");
                if (id) {
                  api.post(`/professor/courses/${id}/enroll`)
                    .then(() => alert("Successfully joined course!"))
                    .catch(() => alert("Failed to join course. Check the ID."));
                }
              }} 
              className="glass hover-lift" 
              style={{ padding: "10px 20px", borderRadius: 999, border: "1px solid rgba(70,54,38,0.16)", cursor: "pointer", color: "var(--text-secondary)", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 2px 8px rgba(70,54,38,0.06)", background: "rgba(255,252,244,0.85)" }}
            >
              🔗 Join Course
            </button>
            
            <button 
              onClick={triggerFileUpload} 
              className="glass hover-lift" 
              disabled={uploading}
              style={{ padding: "10px 20px", borderRadius: 999, border: "1px solid rgba(70,54,38,0.16)", cursor: "pointer", color: "var(--text-secondary)", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, opacity: uploading ? 0.5 : 1, boxShadow: "0 2px 8px rgba(70,54,38,0.06)", background: "rgba(255,252,244,0.85)" }}
            >
              {uploading ? "⏳ Uploading..." : "📎 Upload Document"}
            </button>
          </div>

          {/* Announcements */}
          {announcements.length > 0 && (
            <div style={{ marginTop: 56, textAlign: "left" }}>
              <h2 style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 18 }}>
                📣 Strategic Course Reinforcements
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
                {announcements.map((ann) => (
                  <div key={ann.id} className="glass" style={{ padding: 20, borderLeft: "4px solid var(--accent-3)", boxShadow: "0 4px 16px rgba(70,54,38,0.06)", borderRadius: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-3)" }}>{ann.course_name}</span>
                      <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{new Date(ann.created_at).toLocaleDateString()}</span>
                    </div>
                    <h3 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 8, color: "var(--text-primary)" }}>{ann.title}</h3>
                    <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>{ann.content_preview}</p>
                    <button 
                      onClick={() => router.push(`/profile/materials/${ann.id}`)}
                      className="btn-ghost" 
                      style={{ fontSize: 12.5, padding: "7px 14px", fontWeight: 600 }}
                    >
                      View Reinforcement Plan →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
    </div>
  </div>
  );
}
