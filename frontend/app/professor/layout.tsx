"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import Link from "next/link";
import { LayoutDashboard, BookOpen, BarChart3, LogOut, GraduationCap, Upload } from "lucide-react";

export default function ProfessorLayout({ children }: { children: React.ReactNode }) {
  const { token, user, logout } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      if (!token) {
        router.replace("/");
      } else if (user && user.role !== "professor") {
        // Soft redirect or warning
        console.warn("User is not a professor");
      }
    }
  }, [mounted, token, user, router]);

  if (!mounted || !token) return null;

  const navItems = [
    { href: "/professor", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/professor/courses", label: "My Courses", icon: <BookOpen size={18} /> },
    { href: "/professor/analytics", label: "Analytics", icon: <BarChart3 size={18} /> },
    { href: "/professor/assessment/build", label: "Assessment Builder", icon: <GraduationCap size={18} /> },
  ];

  return (
    <div className="claude-shell" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside className="sidebar" style={{ width: 280, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "24px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #cc785c, #8b5e34)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 20 }}>🎓</div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }} className="gradient-text">Professor Portal</h1>
            <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Institutional Intelligence</p>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "20px 12px" }}>
          {navItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className="sidebar-nav-item"
              style={{ marginBottom: 4 }}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
             <img src={user?.picture} style={{ width: 32, height: 32, borderRadius: 99 }} />
             <div style={{ minWidth: 0 }}>
               <p style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</p>
               <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Faculty Member</p>
             </div>
          </div>
          <button 
            onClick={() => { logout(); router.push("/"); }}
            style={{ width: "100%", padding: "10px", borderRadius: 8, background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.1)", color: "#ef4444", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
          >
            <LogOut size={14} /> Log Out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        {/* Ambient orbs */}
        <div className="orb" style={{ width: 600, height: 600, background: "radial-gradient(circle, rgba(204,120,92,0.05) 0%, transparent 70%)", top: "-150px", right: "20%" }} />
        <div className="orb" style={{ width: 400, height: 400, background: "radial-gradient(circle, rgba(216,163,93,0.05) 0%, transparent 70%)", bottom: "-100px", left: "30%" }} />
        
        <div style={{ padding: "40px 60px", position: "relative", zIndex: 1 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
