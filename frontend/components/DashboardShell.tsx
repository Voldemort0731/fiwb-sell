"use client";
import { useState, useEffect } from "react";
import Sidebar from "./sidebar/Sidebar";
import { useAuthStore } from "@/lib/auth-store";
import { useRouter, usePathname } from "next/navigation";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { token, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!token) {
      router.push("/");
    } else if (user && !user.role_finalized && pathname !== "/onboarding") {
      router.push("/onboarding");
    }
  }, [token, user, router, pathname]);

  if (!token) return null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-main)", overflow: "hidden" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main style={{ 
        flex: 1, 
        overflowY: "auto", 
        position: "relative",
        padding: "0 24px"
      }}>
        {children}
      </main>
    </div>
  );
}
