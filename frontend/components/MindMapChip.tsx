"use client";
import { useMindMapStore } from "@/lib/mindmap-store";
import { Network } from "lucide-react";

interface MindMapChipProps {
  docId: string;
}

export default function MindMapChip({ docId }: MindMapChipProps) {
  const { openMap, isOpen } = useMindMapStore();

  const handleActivate = () => {
    if (docId) openMap(docId);
  };

  return (
    <button
      onClick={handleActivate}
      title="Open Mind Map"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: "0.75em",
        fontWeight: 600,
        letterSpacing: "0.01em",
        cursor: "pointer",
        border: "1px solid rgba(139,92,246,0.35)",
        background: "rgba(139,92,246,0.08)",
        color: "#a78bfa",
        transition: "all 0.15s ease",
        verticalAlign: "middle",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        userSelect: "none",
        position: "relative",
        top: "-1px",
        outline: "none",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.15)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.6)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.35)";
      }}
    >
      <Network size={10} strokeWidth={2.5} />
      Mind Map
    </button>
  );
}
