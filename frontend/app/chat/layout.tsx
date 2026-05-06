"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import Sidebar from "@/components/sidebar/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (mounted) {
      if (!token) {
        router.replace("/");
      } else if (user && user.role === "professor") {
        router.replace("/professor");
      }
    }
  }, [mounted, token, user, router]);

  if (!mounted || !token) return null;

  return (
    <div className="claude-shell" style={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative" }}>
      {/* Ambient background orbs */}
      <div className="orb" style={{ width: 600, height: 600, background: "radial-gradient(circle, rgba(204,120,92,0.08) 0%, transparent 70%)", top: "-150px", right: "20%" }} />
      <div className="orb" style={{ width: 400, height: 400, background: "radial-gradient(circle, rgba(216,163,93,0.08) 0%, transparent 70%)", bottom: "-100px", left: "30%" }} />

      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
        {children}
      </main>
    </div>
  );
}
