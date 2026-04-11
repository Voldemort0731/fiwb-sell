"use client";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

function AuthSuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { setToken, setUser } = useAuthStore();

  useEffect(() => {
    const token = params.get("token");
    if (!token) { router.replace("/"); return; }
    setToken(token);
    // Fetch user profile
    api.get("/auth/me").then((user) => {
      setUser(user);
      router.replace("/chat");
    }).catch(() => router.replace("/"));
  }, [params, router, setToken, setUser]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #8b5cf6, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, animation: "pulse-ring 1.5s infinite" }}>🧠</div>
      <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Signing you in…</p>
    </div>
  );
}

export default function AuthSuccessPage() {
  return <Suspense><AuthSuccessInner /></Suspense>;
}
