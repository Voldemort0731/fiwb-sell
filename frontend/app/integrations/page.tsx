"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import GoogleDrivePicker from "@/components/GoogleDrivePicker";

interface IntegrationStatus {
  classroom: { synced: boolean; courses: number };
  drive: { synced: boolean; files: number };
  total_materials: number;
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    api.get("/integrations/status").then(setStatus).catch(() => {});
  }, []);

  const syncService = async (service: string) => {
    setSyncing(service);
    try {
      await api.post(`/integrations/sync/${service}`);
      setTimeout(() => {
        api.get("/integrations/status").then(setStatus).catch(() => {});
        setSyncing(null);
      }, 2000);
    } catch {
      setSyncing(null);
    }
  };

  const handleDriveFilesSelected = async (fileIds: string[]) => {
    setSyncing("drive");
    try {
      await api.post("/integrations/drive/sync", { file_ids: fileIds });
      setTimeout(() => {
        api.get("/integrations/status").then(setStatus).catch(() => {});
        setSyncing(null);
      }, 2000);
    } catch (e) {
      console.error(e);
      setSyncing(null);
    }
  };

  const integrations = [
    {
      id: "classroom", icon: "🎓", label: "Google Classroom",
      desc: "Sync courses, assignments, and announcements",
      synced: status?.classroom.synced,
      detail: status ? `${status.classroom.courses} courses synced` : "Not synced",
      color: "#4285F4",
    },
    {
      id: "drive", icon: "📁", label: "Google Drive",
      desc: "Index PDFs, Docs, and notes for AI retrieval",
      synced: status?.drive.synced,
      detail: status ? `${status.drive.files} files indexed` : "Not synced",
      color: "#0F9D58",
    },
  ];

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "40px 48px" }}>
      <div className="fade-in" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Integrations</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          Connect your academic platforms to power your Digital Twin.
          {status && <span className="tag tag-purple" style={{ marginLeft: 10 }}>{status.total_materials} materials indexed</span>}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, maxWidth: 800 }}>
        {integrations.map((intg, i) => (
          <div
            key={intg.id}
            className="glass slide-up"
            style={{ padding: 24, animationDelay: `${i * 0.06}s`, border: intg.synced ? "1px solid rgba(16,185,129,0.2)" : "1px solid var(--border)" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${intg.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, border: `1px solid ${intg.color}33`, flexShrink: 0 }}>
                {intg.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <p style={{ fontSize: 15, fontWeight: 600 }}>{intg.label}</p>
                  {intg.synced && <span className="tag tag-green" style={{ fontSize: 10 }}>✓ Active</span>}
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{intg.desc}</p>
              </div>
            </div>

            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>{intg.detail}</p>

            <div style={{ display: "flex", gap: 8 }}>
              {intg.id === "drive" ? (
                <GoogleDrivePicker
                  onFilesSelected={handleDriveFilesSelected}
                  triggerElement={(openPicker) => (
                    <button
                      className="btn-primary"
                      style={{ fontSize: 12, padding: "7px 14px", flex: 1 }}
                      disabled={syncing === intg.id}
                      onClick={openPicker}
                      id={`sync-${intg.id}-btn`}
                    >
                      {syncing === intg.id ? "Syncing…" : intg.synced ? "Select Files" : "Connect & Pick Files"}
                    </button>
                  )}
                />
              ) : (
                <button
                  className="btn-primary"
                  style={{ fontSize: 12, padding: "7px 14px", flex: 1 }}
                  disabled={syncing === intg.id}
                  onClick={() => syncService(intg.id)}
                  id={`sync-${intg.id}-btn`}
                >
                  {syncing === intg.id ? "Syncing…" : intg.synced ? "Sync Again" : "Connect & Sync"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Info note */}
      <div style={{ maxWidth: 800, marginTop: 24, padding: "14px 18px", borderRadius: 10, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text-primary)" }}>No Google verification required</strong> — while the app is in OAuth testing mode, you can use all Google integrations immediately by adding your Google account as a test user in the Google Cloud Console.
        </p>
      </div>
    </div>
  );
}
