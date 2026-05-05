"use client";
/**
 * CitationChip.tsx
 * Inline citation pill that opens the DocumentViewer when clicked.
 *
 * Data requirements (from Part 2):
 *   docId, passageId, pageNumber, highlightText, label
 * If any field is missing, renders plain text and logs a warning.
 */
import { CitationData, useViewerStore } from "@/lib/viewer-store";
import { BookOpen } from "lucide-react";

interface CitationChipProps {
  citation: CitationData;
}

// Validate all required fields are present and non-empty
function isValidCitation(c: Partial<CitationData>): c is CitationData {
  if (!c.docId || !c.passageId || !c.label) {
    console.warn("[CitationChip] Invalid citation data — missing required fields:", c);
    return false;
  }
  if (typeof c.pageNumber !== "number") {
    console.warn("[CitationChip] Invalid citation data — pageNumber must be a number:", c);
    return false;
  }
  return true;
}

export default function CitationChip({ citation }: CitationChipProps) {
  const { openViewer, activePassageId } = useViewerStore();
  const isActive = activePassageId === citation.passageId;

  if (!isValidCitation(citation)) {
    // Fallback: render plain text label (cast to any to avoid never narrowing)
    const fallbackLabel = (citation as any)?.label ?? "?";
    return <span style={{ opacity: 0.6, fontSize: "inherit" }}>[{fallbackLabel}]</span>;
  }

  const handleActivate = () => openViewer(citation);

  return (
    <button
      id={`citation-chip-${citation.passageId}`}
      role="button"
      tabIndex={0}
      aria-label={`View source: ${citation.label}, page ${citation.pageNumber}`}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
        if (e.key === "Escape") {
          useViewerStore.getState().closeViewer();
        }
      }}
      title={`Page ${citation.pageNumber} · ${citation.docId}`}
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
        border: `1px solid ${isActive ? "rgba(139,92,246,0.8)" : "rgba(139,92,246,0.35)"}`,
        background: isActive
          ? "rgba(139,92,246,0.2)"
          : "rgba(139,92,246,0.08)",
        color: isActive ? "#c4b5fd" : "#a78bfa",
        transition: "all 0.15s ease",
        verticalAlign: "middle",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        userSelect: "none",
        position: "relative",
        top: "-1px",
        outline: "none",
      }}
      // Keyboard focus ring
      onFocus={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px rgba(139,92,246,0.5)";
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.15)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.6)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.35)";
        }
      }}
    >
      <BookOpen size={10} strokeWidth={2.5} />
      {citation.label}
    </button>
  );
}
