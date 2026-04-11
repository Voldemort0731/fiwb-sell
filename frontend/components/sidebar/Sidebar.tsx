"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

interface Thread { id: number; title: string; updated_at: string; }

const NAV_ITEMS = [
  { href: "/chat", label: "Home", icon: "⌂" },
  { href: "/chat/new", label: "New Chat", icon: "✦" },
  { href: "/integrations", label: "My Courses", icon: "📚" },
  { href: "/profile", label: "Digital Twin", icon: "🧠" },
];

function ThreadItem({ t, pathname, setShowProfile, refreshThreads }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [isHovered, setIsHovered] = useState(false);
  const router = useRouter();

  const handleRename = async () => {
    if (!title.trim() || title === t.title) {
      setIsEditing(false);
      setTitle(t.title);
      return;
    }
    try {
      await api.patch(`/chat/threads/${t.id}`, { title });
      setIsEditing(false);
      refreshThreads();
    } catch (e) {
      console.error("Rename failed", e);
      setTitle(t.title);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this chat and all its memories?")) return;
    try {
      await api.delete(`/chat/threads/${t.id}`);
      refreshThreads();
      if (pathname === `/chat/${t.id}`) {
        router.push("/chat");
      }
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  return (
    <div 
      className={`sidebar-nav-item ${pathname === `/chat/${t.id}` ? "active" : ""}`}
      style={{ fontSize: 13, position: "relative", display: "flex", alignItems: "center", paddingRight: isHovered ? "50px" : "12px", transition: "padding 0.2s" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link 
        href={`/chat/${t.id}`} 
        onClick={() => { if(!isEditing) setShowProfile(false) }}
        style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, textDecoration: "none", color: "inherit", overflow: "hidden" }}
      >
        <span style={{ fontSize: 12, flexShrink: 0 }}>💬</span>
        {isEditing ? (
          <input 
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") { setIsEditing(false); setTitle(t.title); }
            }}
            style={{ flex: 1, minWidth: 0, padding: 0, background: "transparent", border: "none", outline: "none", color: "inherit", fontSize: "inherit", borderBottom: "1px solid var(--primary)" }}
            onClick={(e) => e.preventDefault()}
          />
        ) : (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
        )}
      </Link>
      
      {isHovered && !isEditing && (
        <div style={{ position: "absolute", right: 8, display: "flex", gap: 2, background: pathname === `/chat/${t.id}` ? "var(--bg-secondary)" : "transparent" }}>
          <button 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 4, opacity: 0.6 }}
            title="Rename"
          >
            ✏️
          </button>
          <button 
            onClick={handleDelete}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 4, opacity: 0.6 }}
            title="Delete"
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [showProfile, setShowProfile] = useState(false);

  const fetchThreads = async () => {
    try {
      const data = await api.get("/chat/threads");
      if (Array.isArray(data)) setThreads(data);
    } catch (err) {
      console.error("Sidebar: Failed to fetch threads", err);
    }
  };

  useEffect(() => {
    fetchThreads();
    const interval = setInterval(fetchThreads, 10000);
    return () => clearInterval(interval);
  }, []);

  // Group threads by date
  const today = new Date().toDateString();
  const dNow = new Date().getTime();
  const yesterday = new Date(dNow - 86400000).toDateString();
  const grouped: Record<string, Thread[]> = { Today: [], Yesterday: [], Earlier: [] };
  threads.forEach((t) => {
    const d = new Date(t.updated_at).toDateString();
    if (d === today) grouped.Today.push(t);
    else if (d === yesterday) grouped.Yesterday.push(t);
    else grouped.Earlier.push(t);
  });

  return (
    <div className="sidebar" style={{ width: collapsed ? 64 : 260 }}>
      {/* Header */}
      <div style={{ padding: collapsed ? "16px 12px" : "16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#8b5cf6,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🧠</div>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }} className="gradient-text">FIWB</span>
          </div>
        )}
        {collapsed && <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#8b5cf6,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧠</div>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: 4, borderRadius: 6, flexShrink: 0 }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* User Avatar */}
      {user && (
        <div
          style={{ padding: collapsed ? "12px 12px" : "12px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: "1px solid var(--border)", flexShrink: 0, position: "relative" }}
          onClick={() => setShowProfile(!showProfile)}
        >
          <img src={user.picture || "/avatar.png"} alt={user.name} style={{ width: 32, height: 32, borderRadius: 99, border: "2px solid var(--border)", flexShrink: 0 }} />
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</p>
              </div>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▼</span>
            </>
          )}
          {/* Profile dropdown */}
          {showProfile && !collapsed && (
            <div style={{ position: "absolute", top: "100%", left: 8, right: 8, zIndex: 100, background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 25px rgba(0,0,0,0.08)" }}>
              <button onClick={() => router.push("/profile")} style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", textAlign: "left", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                🧠 Digital Twin
              </button>
              <button onClick={() => { logout(); router.push("/"); }} style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", color: "#f87171", cursor: "pointer", textAlign: "left", fontSize: 13, display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)" }}>
                ↪ Log Out
              </button>
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <div style={{ padding: "8px", flexShrink: 0 }}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-nav-item ${(pathname === item.href || (item.href !== "/chat" && pathname.startsWith(item.href))) ? "active" : ""}`}
            title={collapsed ? item.label : undefined}
            onClick={() => setShowProfile(false)}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </div>

      {/* Thread History */}
      {!collapsed && (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
          {Object.entries(grouped).map(([label, items]) =>
            items.length > 0 ? (
              <div key={label}>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "12px 8px 4px" }}>{label}</p>
                {items.map((t) => (
                  <ThreadItem key={t.id} t={t} pathname={pathname} setShowProfile={setShowProfile} refreshThreads={fetchThreads} />
                ))}
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
