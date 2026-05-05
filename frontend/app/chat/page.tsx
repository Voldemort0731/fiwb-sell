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

  const suggestions = [
    { icon: "✦", label: "Explain a concept", prompt: "Can you explain recursion using a simple analogy?" },
    { icon: "⌁", label: "Summarize material", prompt: "Summarize my latest course materials for me" },
    { icon: "?", label: "Quiz me", prompt: "Quiz me on recent topics from my courses" },
    { icon: "📅", label: "Check deadlines", prompt: "What assignments are due soon based on my Classroom sync?" },
  ];

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
      <div className="fade-in" style={{ textAlign: "center", width: "100%", maxWidth: 800 }}>
        <div style={{ marginBottom: 14 }}>
           <h1 className="claude-home-title" style={{ fontSize: 54, fontWeight: 500, letterSpacing: "0.04em", lineHeight: 1.2 }}>{heading}</h1>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 16, marginBottom: 34 }}>Search your Drive, Classroom, courses, or start a new chat, {firstName}.</p>
        
        <div style={{ maxWidth: 780, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "10px 10px 10px 22px", borderRadius: 24, border: "1px solid rgba(70,54,38,0.11)", background: "#fffdf7", boxShadow: "0 22px 60px rgba(72,54,35,0.11)" }}>
            <input 
              type="text" 
              placeholder={placeholder} 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNewChat();
              }}
              style={{ flex: 1, background: "none", border: "none", color: "var(--text-primary)", outline: "none", fontSize: 17 }}
            />
            <button onClick={handleNewChat} className="btn-primary" style={{ padding: "12px 18px", borderRadius: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
              Start chat <span style={{ fontSize: 18 }}>↑</span>
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <GoogleDrivePicker
            onFilesSelected={handleDriveFilesSelected}
            triggerElement={(openPicker) => (
              <button 
                onClick={openPicker} 
                className="glass hover-lift" 
                disabled={syncingDrive}
                style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-primary)", fontSize: 14, display: "flex", alignItems: "center", gap: 8, opacity: syncingDrive ? 0.5 : 1, boxShadow: "none" }}
              >
                {syncingDrive ? "Syncing..." : "Sync Drive"}
              </button>
            )}
          />
          <button 
            onClick={handleRefreshClassroom} 
            className="glass hover-lift" 
            disabled={syncingClassroom}
            style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-primary)", fontSize: 14, display: "flex", alignItems: "center", gap: 8, opacity: syncingClassroom ? 0.5 : 1, boxShadow: "none" }}
          >
            {syncingClassroom ? "Syncing..." : "Refresh Classroom"}
          </button>
          
          <button 
            onClick={triggerFileUpload} 
            className="glass hover-lift" 
            disabled={uploading}
            style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-primary)", fontSize: 14, display: "flex", alignItems: "center", gap: 8, opacity: uploading ? 0.5 : 1, boxShadow: "none" }}
          >
            {uploading ? "Uploading..." : "Manual Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
