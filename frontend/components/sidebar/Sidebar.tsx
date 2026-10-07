"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Pencil, Trash2, Plus } from "lucide-react";

interface Thread { id: number; title: string; folder_name?: string; updated_at: string; }
interface ThreadItemProps {
  t: Thread;
  pathname: string;
  setShowProfile: (show: boolean) => void;
  refreshThreads: () => void;
}
interface TreeNode {
  name: string;
  fullPath: string;
  children: Record<string, TreeNode>;
  threads: Thread[];
}

function ThreadItem({ t, pathname, setShowProfile, refreshThreads }: ThreadItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [isHovered, setIsHovered] = useState(false);
  const router = useRouter();

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("threadId", t.id.toString());
    e.dataTransfer.effectAllowed = "move";
  };

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
      draggable={!isEditing}
      onDragStart={handleDragStart}
      style={{ fontSize: 14.5, fontWeight: 500, position: "relative", display: "flex", alignItems: "center", paddingRight: isHovered && !isEditing ? "110px" : "12px", transition: "padding 0.2s", cursor: isEditing ? "text" : "grab" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link 
        href={`/chat/${t.id}`} 
        onClick={() => { if(!isEditing) setShowProfile(false) }}
        style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, textDecoration: "none", color: "inherit", overflow: "hidden" }}
      >
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
        <div style={{ position: "absolute", right: 6, display: "flex", gap: 4, background: "var(--bg-secondary)", padding: "2px 4px", borderRadius: 6, boxShadow: "-8px 0 12px var(--bg-secondary)" }}>
          <button 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
            style={{ background: "none", cursor: "pointer", fontSize: 11, padding: "2px 6px", opacity: 0.6, border: "1px solid var(--border)", borderRadius: 4 }}
            title="Rename"
          >
            Rename
          </button>
          <button 
            onClick={handleDelete}
            style={{ background: "none", cursor: "pointer", fontSize: 11, padding: "2px 6px", opacity: 0.6, border: "1px solid var(--border)", borderRadius: 4, color: "#ef4444" }}
            title="Delete"
          >
            Delete
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

  const NAV_ITEMS = user?.role === "professor" 
    ? [
        { href: "/professor", label: "Professor Portal" },
        { href: "/professor/courses", label: "My Courses" },
        { href: "/professor/analytics", label: "Institutional Analytics" },
        { href: "/professor/assessment/build", label: "Assessment Builder" },
      ]
    : [
        { href: "/chat", label: "Home" },
        { href: "/chat/new", label: "New Chat" },
        { href: "/dashboard/courses", label: "My Courses" },
        { href: "/dashboard/progress", label: "Mastery Dashboard" },
        { href: "/dashboard/practice", label: "Adaptive Practice" },
        { href: "/dashboard/assignments", label: "Assignments" },
        { href: "/profile", label: "Digital Twin" },
      ];

  const [threads, setThreads] = useState<Thread[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [customFolderNames, setCustomFolderNames] = useState<string[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [folderEditValue, setFolderEditValue] = useState("");

  // Helper to build a recursive tree from paths
  const buildTree = (threadList: Thread[], extraFolders: string[]) => {
    const root: Record<string, TreeNode> = {};

    const getOrCreateNode = (path: string) => {
      const parts = path.split("/");
      let current = root;
      let fullPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        fullPath = fullPath ? `${fullPath}/${part}` : part;
        if (!current[part]) {
          current[part] = { name: part, fullPath, children: {}, threads: [] };
        }
        if (i < parts.length - 1) {
          current = current[part].children;
        } else {
          return current[part];
        }
      }
      return null;
    };

    // Add empty explicit folders
    extraFolders.forEach(path => getOrCreateNode(path));

    // Distribute threads
    const chrono: { Today: Thread[], Yesterday: Thread[], Earlier: Thread[] } = { Today: [], Yesterday: [], Earlier: [] };
    const todayStr = new Date().toDateString();
    const yesterdayTime = new Date().getTime() - 86400000;
    const yesterdayStr = new Date(yesterdayTime).toDateString();

    threadList.forEach(t => {
      if (t.folder_name) {
        const node = getOrCreateNode(t.folder_name);
        if (node) node.threads.push(t);
      } else {
        const d = new Date(t.updated_at).toDateString();
        if (d === todayStr) chrono.Today.push(t);
        else if (d === yesterdayStr) chrono.Yesterday.push(t);
        else chrono.Earlier.push(t);
      }
    });

    return { tree: root, chrono };
  };

  const toggleFolder = (name: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

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

  const { tree, chrono } = buildTree(threads, customFolderNames);

  const onDropOnFolder = async (e: React.DragEvent, targetFolderPath: string | null) => {
    e.preventDefault();
    const threadId = e.dataTransfer.getData("threadId");
    const sourceFolderPath = e.dataTransfer.getData("sourceFolderPath");

    try {
      if (threadId) {
        // Moving a thread
        await api.patch(`/chat/threads/${threadId}`, { folder_name: targetFolderPath || "" });
      } else if (sourceFolderPath) {
        // Moving a folder
        if (targetFolderPath === sourceFolderPath || targetFolderPath?.startsWith(sourceFolderPath + "/")) {
          return; // Prevent circular drop
        }
        await api.patch("/chat/threads/folders/move", { source_folder: sourceFolderPath, target_folder: targetFolderPath || "" });
      }
      fetchThreads();
    } catch (err) {
      console.error("Drop failed", err);
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false);
      return;
    }
    const path = newFolderName.replace(/\//g, "-"); // Basic sanitation
    if (!customFolderNames.includes(path)) {
      setCustomFolderNames(prev => [...prev, path]);
    }
    setIsCreatingFolder(false);
    setNewFolderName("");
  };

  // RECURSIVE FOLDER COMPONENT
  const FolderNode = ({ node, depth }: { node: TreeNode, depth: number }) => {
    const isCollapsed = collapsedFolders.has(node.fullPath);
    const hasContent = Object.keys(node.children).length > 0 || node.threads.length > 0;

    return (
      <div 
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.05)'; }}
        onDragLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        onDrop={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).style.background = 'transparent'; onDropOnFolder(e, node.fullPath); }}
        style={{ borderRadius: 8, transition: "background 0.2s", marginBottom: 2 }}
      >
        <div 
          draggable
          onDragStart={(e) => { e.dataTransfer.setData("sourceFolderPath", node.fullPath); }}
          onClick={() => toggleFolder(node.fullPath)}
          className="folder-header"
          style={{ 
            display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", cursor: "pointer", borderRadius: 8,
            marginLeft: depth * 12 
          }}
        >
          <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </span>
          {editingFolder === node.fullPath ? (
            <input 
              autoFocus
              className="chat-input"
              value={folderEditValue}
              onChange={(e) => setFolderEditValue(e.target.value)}
              onBlur={() => handleRenameFolder(node.fullPath)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameFolder(node.fullPath)}
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1, padding: "2px 6px", fontSize: 13, background: "rgba(0,0,0,0.2)", borderRadius: 4, border: "1px solid var(--accent)", outline: "none", color: "#fff" }}
            />
          ) : (
            <>
              <span style={{ fontSize: 14, display: "flex", alignItems: "center", color: isCollapsed ? "var(--text-muted)" : "var(--accent)" }}>
                {isCollapsed ? <Folder size={14} /> : <FolderOpen size={14} />}
              </span>
              <span style={{ fontSize: 14.5, fontWeight: 600, color: isCollapsed ? "var(--text-muted)" : "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.name}
              </span>
              <button 
                onClick={(e) => { e.stopPropagation(); setEditingFolder(node.fullPath); setFolderEditValue(node.name); }}
                className="folder-edit-btn"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 4, opacity: 0, color: "var(--text-muted)" }}
              >
                <Pencil size={12} />
              </button>
            </>
          )}
        </div>

        {!isCollapsed && (
          <div style={{ marginLeft: depth * 12 }}>
            {/* Render subfolders */}
            {Object.values(node.children).map(child => (
              <FolderNode key={child.fullPath} node={child} depth={depth + 1} />
            ))}
            {/* Render threads */}
            <div style={{ paddingLeft: 18, borderLeft: "1px solid rgba(255,255,255,0.05)", marginLeft: 14 }}>
              {node.threads.map((t) => (
                <ThreadItem key={t.id} t={t} pathname={pathname} setShowProfile={setShowProfile} refreshThreads={fetchThreads} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleRenameFolder = async (oldName: string) => {
    const newName = folderEditValue.trim();
    if (!newName || newName === oldName) {
      setEditingFolder(null);
      return;
    }

    try {
      await api.patch("/chat/threads/folders/rename", { old_name: oldName, new_name: newName });
      
      // Update local state for folder list
      setCustomFolderNames(prev => prev.map(n => n === oldName ? newName : n));
      
      // Update collapse state if needed
      if (collapsedFolders.has(oldName)) {
        setCollapsedFolders(prev => {
          const next = new Set(prev);
          next.delete(oldName);
          next.add(newName);
          return next;
        });
      }

      setEditingFolder(null);
      fetchThreads(); // Refresh to get threads with new folder tags
    } catch (err) {
      console.error("Folder rename failed", err);
      setEditingFolder(null);
    }
  };

  return (
    <div className="sidebar" style={{ width: collapsed ? 64 : 284 }}>
      {/* Header */}
      <div style={{ 
        padding: collapsed ? "16px 0" : "16px", 
        display: "flex", 
        flexDirection: collapsed ? "column" : "row",
        alignItems: "center", 
        justifyContent: collapsed ? "center" : "space-between", 
        borderBottom: "1px solid var(--border)", 
        flexShrink: 0,
        gap: collapsed ? 12 : 0
      }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/logo.png" alt="FIWB Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
            <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: "0.05em", fontFamily: "sans-serif" }}>FIWB</span>
          </div>
        )}
        {collapsed && <img src="/logo.png" alt="FIWB Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />}
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
          style={{ 
            padding: collapsed ? "12px 0" : "12px 16px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10, 
            cursor: "pointer", 
            borderBottom: "1px solid var(--border)", 
            flexShrink: 0, 
            position: "relative" 
          }}
          onClick={() => setShowProfile(!showProfile)}
        >
          <img src={user.picture || "/avatar.png"} alt={user.name} style={{ width: 32, height: 32, borderRadius: 99, border: "2px solid var(--border)", flexShrink: 0 }} />
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</p>
                </div>
              </div>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▼</span>
            </>
          )}
          {/* Profile dropdown */}
          {showProfile && !collapsed && (
            <div style={{ position: "absolute", top: "100%", left: 8, right: 8, zIndex: 100, background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 25px rgba(0,0,0,0.08)" }}>
              <button onClick={() => router.push("/profile")} style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", textAlign: "left", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                Digital Twin
              </button>
              <button onClick={() => { logout(); router.push("/"); }} style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", color: "#f87171", cursor: "pointer", textAlign: "left", fontSize: 13, display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)" }}>
                Log Out
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
            style={{ 
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "9px 0" : "9px 12px",
              gap: collapsed ? 0 : 10
            }}
            title={collapsed ? item.label : undefined}
            onClick={() => setShowProfile(false)}
          >
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </div>

      {/* Thread History */}
      {!collapsed && (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
          
          <div style={{ padding: "12px 8px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
             <p style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Folders</p>
             <button 
              onClick={() => setIsCreatingFolder(true)}
              style={{
                background: "rgba(204, 120, 71, 0.08)",
                border: "1px solid rgba(204, 120, 71, 0.2)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--accent)",
                padding: "2px 10px",
                borderRadius: 6,
              }}
             >+ New</button>
          </div>

          {isCreatingFolder && (
            <div style={{ padding: "0 8px 8px" }}>
              <input 
                autoFocus
                className="chat-input"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={handleCreateFolder}
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                style={{ width: "100%", padding: "6px 10px", fontSize: 13, background: "rgba(0,0,0,0.1)", borderRadius: 6 }}
              />
            </div>
          )}

          {/* Custom Folder Tree */}
          {Object.values(tree).map(node => (
            <FolderNode key={node.fullPath} node={node} depth={0} />
          ))}

          {/* Chronological (Root Drop Zone) */}
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDropOnFolder(e, null)}
          >
            {Object.entries(chrono).map(([label, items]) =>
              items.length > 0 ? (
                <div key={label}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", padding: "14px 8px 5px" }}>{label}</p>
                  {items.map((t) => (
                    <ThreadItem key={t.id} t={t} pathname={pathname} setShowProfile={setShowProfile} refreshThreads={fetchThreads} />
                  ))}
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}
