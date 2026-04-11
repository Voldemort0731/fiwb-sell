"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import Link from "next/link";
import GoogleDrivePicker from "@/components/GoogleDrivePicker";

export default function ChatHome() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [query, setQuery] = useState("");

  const handleNewChat = () => {
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/chat/new?prompt=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/chat/new");
    }
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
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const suggestions = [
    { icon: "📖", label: "Explain a concept", prompt: "Can you explain recursion using a simple analogy?" },
    { icon: "📝", label: "Summarize material", prompt: "Summarize my latest course materials for me" },
    { icon: "🧪", label: "Quiz me", prompt: "Quiz me on recent topics from my courses" },
    { icon: "📅", label: "Check deadlines", prompt: "What assignments are due soon based on my Classroom sync?" },
  ];

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "60px 48px", background: "var(--bg-primary)" }}>
      {/* AI Spotlight Section */}
      <div className="fade-in" style={{ textAlign: "center", marginBottom: 60, marginTop: 40 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "8px 16px", borderRadius: 12, background: "rgba(139,92,246,0.1)", marginBottom: 16 }}>
           <span style={{ fontSize: 20 }}>⌘</span>
           <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em" }}>AI Spotlight Search</h1>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 17, marginBottom: 40, opacity: 0.8 }}>Search Drive, Classroom, or ask AI</p>
        
        <div style={{ maxWidth: 760, margin: "0 auto", position: "relative" }}>
          <div className="glass" style={{ display: "flex", alignItems: "center", padding: "8px 8px 8px 24px", borderRadius: 20, border: "1px solid var(--border)", boxShadow: "0 25px 50px rgba(0,0,0,0.12)" }}>
            <input 
              type="text" 
              placeholder="Search Drive, Classroom..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNewChat();
              }}
              style={{ flex: 1, background: "none", border: "none", color: "var(--text-primary)", outline: "none", fontSize: 18 }}
            />
            <button onClick={handleNewChat} className="btn-primary" style={{ padding: "14px 28px", borderRadius: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}>
              <span style={{ fontSize: 20 }}>✧</span> Ask AI
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 48 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", alignSelf: "center", marginRight: 12, opacity: 0.6 }}>Quick Actions:</span>
          <button onClick={handleNewChat} className="glass hover-lift" style={{ padding: "12px 24px", borderRadius: 14, border: "none", cursor: "pointer", color: "var(--text-primary)", fontSize: 15, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ opacity: 0.8, fontSize: 18 }}>💬</span> Chatbot
          </button>
          <GoogleDrivePicker
            onFilesSelected={handleDriveFilesSelected}
            triggerElement={(openPicker) => (
              <button 
                onClick={openPicker} 
                className="glass hover-lift" 
                disabled={syncingDrive}
                style={{ padding: "12px 24px", borderRadius: 14, border: "none", cursor: "pointer", color: "var(--text-primary)", fontSize: 15, display: "flex", alignItems: "center", gap: 10, opacity: syncingDrive ? 0.5 : 1 }}
              >
                <span style={{ opacity: 0.8, fontSize: 18 }}>{syncingDrive ? "⏳" : "☁️"}</span> 
                {syncingDrive ? "Syncing..." : "Sync Drive"}
              </button>
            )}
          />
          <button 
            onClick={handleRefreshClassroom} 
            className="glass hover-lift" 
            disabled={syncingClassroom}
            style={{ padding: "12px 24px", borderRadius: 14, border: "none", cursor: "pointer", color: "var(--text-primary)", fontSize: 15, display: "flex", alignItems: "center", gap: 10, opacity: syncingClassroom ? 0.5 : 1 }}
          >
            <span style={{ opacity: 0.8, fontSize: 18 }}>{syncingClassroom ? "⏳" : "🔄"}</span> 
            {syncingClassroom ? "Syncing..." : "Refresh Classroom"}
          </button>
        </div>
      </div>

      {/* Secondary Suggestions Grid */}
      <div className="slide-up" style={{ maxWidth: 760, margin: "0 auto", animationDelay: "0.2s" }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20, textAlign: "center" }}>Suggested Paradigms</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {suggestions.map((s) => (
            <button
              key={s.label}
              onClick={async () => {
                const thread = await api.post("/chat/threads", { title: s.prompt.slice(0, 50) });
                router.push(`/chat/${thread.id}?prompt=${encodeURIComponent(s.prompt)}`);
              }}
              className="glass hover-lift"
              style={{
                padding: "20px", textAlign: "left", cursor: "pointer", 
                display: "flex", alignItems: "flex-start", gap: 14, border: "1px solid var(--border)", borderRadius: 16
              }}
            >
              <span style={{ fontSize: 24 }}>{s.icon}</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{s.prompt}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
