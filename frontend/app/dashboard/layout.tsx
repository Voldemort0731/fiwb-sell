"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import Sidebar from "@/components/sidebar/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1, padding: "40px" }}>
        {children}
      </main>
    </div>
  );
}
