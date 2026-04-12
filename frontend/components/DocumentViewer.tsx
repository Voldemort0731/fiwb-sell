"use client";
/**
 * DocumentViewer.tsx
 * Split-panel PDF viewer using PDF.js iframe + postMessage protocol.
 * Architecture: Option B (iframe-based, controlled viewer)
 *
 * Protocol:
 *   Parent → iframe: SCROLL_TO_PASSAGE, CLEAR_HIGHLIGHT
 *   iframe → Parent: VIEWER_READY, PAGE_VISIBLE, PASSAGE_READY, VIEWER_ERROR
 */
import { useEffect, useRef, useCallback } from "react";
import { useViewerStore, CitationData } from "@/lib/viewer-store";
import { api } from "@/lib/api";
import { X, ChevronLeft, RotateCcw, ExternalLink, ArrowLeftRight } from "lucide-react";

const VIEWER_ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "";
const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";
const VIEWER_READY_TIMEOUT_MS = 10_000;

export default function DocumentViewer() {
  const {
    isOpen,
    docId,
    pageNumber,
    activePassageId,
    loadingState,
    errorMessage,
    history,
    viewerWidth,
    toggleViewerPosition,
    closeViewer,
    setLoadingState,
    setPageNumber,
    goBack,
  } = useViewerStore();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store current citation data so we can send SCROLL_TO_PASSAGE when VIEWER_READY fires
  const pendingCitationRef = useRef<CitationData | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  // ── Fetch signed document URL (returns {url, type}) ─────────────────
  const fetchDocUrl = useCallback(async (materialId: string, mode: "preview" | "view" = "preview"): Promise<{ url: string; type: string } | null> => {
    try {
      console.log(`[DocumentViewer] Resolving ${mode} URL for material ${materialId}...`);
      
      // 1. Get signed token
      const resToken = await api.get(`/profile/proxy/drive/${materialId}/token`);
      const token = resToken?.token;
      if (!token) throw new Error("Backend returned no access token.");

      // 2. Resolve URL via proxy (returns {url, material_id, type})
      const resUrl = await api.get(`/profile/proxy/drive/${materialId}/${mode}?token=${encodeURIComponent(token)}`);
      
      if (resUrl?.url) {
        console.log(`[DocumentViewer] Resolved (${resUrl.type || "drive"}): ${resUrl.url.substring(0, 60)}...`);
        return { url: resUrl.url, type: resUrl.type || "drive" };
      }

      throw new Error("Backend did not return a valid URL.");
    } catch (e) {
      console.error("[DocumentViewer] Failed to resolve document URL:", e);
      return null;
    }
  }, []);

  // ── postMessage listener ───────────────────────────────────────────────
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: only accept messages from our own origin
      if (event.origin !== VIEWER_ORIGIN) return;
      const { type, pageNumber: pg, passageId, code, message } = event.data ?? {};

      switch (type) {
        case "VIEWER_READY": {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setLoadingState("ready");
          // Send the pending scroll command
          if (pendingCitationRef.current && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              {
                type: "SCROLL_TO_PASSAGE",
                passageId: pendingCitationRef.current.passageId,
                pageNumber: pendingCitationRef.current.pageNumber,
                highlightText: pendingCitationRef.current.highlightText,
              },
              VIEWER_ORIGIN
            );
          }
          break;
        }
        case "PAGE_VISIBLE": {
          if (typeof pg === "number") setPageNumber(pg);
          break;
        }
        case "PASSAGE_READY": {
          // Passage is now highlighted and in view
          break;
        }
        case "VIEWER_ERROR": {
          if (code === "PASSAGE_NOT_FOUND") {
            console.warn("[DocumentViewer] Passage not found, falling back to page view.");
            setLoadingState("ready"); // Stay ready so user can see the page
            return;
          }
          const errMsg =
            code === "DOC_LOAD_FAILED"
              ? "Could not load this document."
              : message ?? "An unknown viewer error occurred.";
          setLoadingState("error", errMsg);
          break;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [setLoadingState, setPageNumber]);

  // ── Unified Navigation Handler ──
  // Sends the SCROLL_TO_PASSAGE command to the iframe when the doc is ready OR a new citation is clicked.
  const lastScrolledPassageRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadingState !== "ready" || !activePassageId || !isOpen) return;

    // Avoid redundant scrolls for the same passage unless it's a fresh doc load
    if (activePassageId === lastScrolledPassageRef.current) return;
    lastScrolledPassageRef.current = activePassageId;

    if (iframeRef.current?.contentWindow) {
      console.log(`[DocumentViewer] Unified scroll to: ${activePassageId} (Page ${pageNumber})`);
      iframeRef.current.contentWindow.postMessage(
        {
          type: "SCROLL_TO_PASSAGE",
          passageId: activePassageId,
          pageNumber: pageNumber,
          highlightText: pendingCitationRef.current?.highlightText || "",
        },
        VIEWER_ORIGIN
      );
    }
  }, [activePassageId, pageNumber, loadingState, isOpen]);



  // ── Load document when docId changes ──────────────────────────────────
  useEffect(() => {
    if (!isOpen || !docId) return;
    let cancelled = false;

    async function load() {
      setLoadingState("loading");

      // Fetch the resolved URL and its type from the backend
      const result = await fetchDocUrl(docId!, "preview");
      
      if (cancelled) return;

      if (!result) {
        setLoadingState("error", "Could not securely retrieve this document. Please try again.");
        return;
      }

      const { url: previewUrl, type: urlType } = result;

      // Also get the view URL for the external-link button
      const viewResult = await fetchDocUrl(docId!, "view");
      pdfUrlRef.current = viewResult?.url || previewUrl;

      if (urlType === "link") {
        // Non-embeddable link (e.g. Google Classroom assignment) — open in new tab
        console.log("[DocumentViewer] Non-embeddable link, opening in new tab:", previewUrl);
        window.open(previewUrl, "_blank", "noopener,noreferrer");
        setLoadingState("ready");
        return;
      }

      // ── NEW: Handle Local Autonomous Viewing ──
      if (urlType === "local" && iframeRef.current) {
        setLoadingState("loading");
        iframeRef.current.onload = () => {
          if (!cancelled) setLoadingState("ready");
        };
        // Use our local viewer to render the binary BLOB with automatic tracking
        // Append #zoom=page-width to ensure text is readable at any column width
        const localViewerUrl = `/viewer/viewer.html?file=${encodeURIComponent(previewUrl)}#zoom=page-width`;
        console.log("[DocumentViewer] Loading autonomous local viewer:", localViewerUrl.substring(0, 100));
        iframeRef.current.src = localViewerUrl;
        return;
      }


      // Drive file — embed in native Drive preview iframe (Default legacy behavior)
      if (iframeRef.current) {
        iframeRef.current.onload = () => {
          if (!cancelled) setLoadingState("ready");
        };
        console.log("[DocumentViewer] Embedding Drive file in iframe:", previewUrl.substring(0, 60));
        iframeRef.current.src = previewUrl;
      }

      // Safety timeout (Google Drive preview can be slow)
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (!cancelled) setLoadingState("ready");
      }, VIEWER_READY_TIMEOUT_MS);
    }

    load();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, isOpen]);

  // ── Sync pendingCitationRef for VIEWER_READY handler ──
  useEffect(() => {
    if (!isOpen || !activePassageId) return;
    const state = useViewerStore.getState();
    pendingCitationRef.current = {
      docId: state.docId ?? "",
      passageId: state.activePassageId ?? "",
      pageNumber: state.pageNumber ?? 1,
      highlightText: "", 
      label: "",
    };
  }, [activePassageId, isOpen]);


  // ── Notify Iframe on Width Change (Handles Zoom Re-calc) ──
  useEffect(() => {
    if (loadingState === "ready" && iframeRef.current?.contentWindow) {
      // Small delay to let the CSS transition finish or flex-basis to settle
      const t = setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage({ type: "RESIZE_VIEWER" }, VIEWER_ORIGIN);
      }, 50);
      return () => clearTimeout(t);
    }
  }, [viewerWidth, loadingState]);


  const handleClose = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "CLEAR_HIGHLIGHT" }, VIEWER_ORIGIN);
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    closeViewer();
  }, [closeViewer]);

  const handleRetry = useCallback(() => {
    if (!docId) return;
    setLoadingState("loading");
    if (iframeRef.current) iframeRef.current.src = "";
    fetchDocUrl(docId, "preview").then((result) => {
      if (!result) { setLoadingState("error", "Could not generate secure link."); return; }
      if (result.type === "link") {
        window.open(result.url, "_blank", "noopener,noreferrer");
        setLoadingState("ready");
      } else if (iframeRef.current) {
        iframeRef.current.src = result.url;
        setLoadingState("ready");
      }
    });
  }, [docId, fetchDocUrl, setLoadingState]);

  // ── Manual Zoom Controls ──
  const handleZoom = (type: "in" | "out" | "fit") => {
    iframeRef.current?.contentWindow?.postMessage({ type: "SET_ZOOM", zoomType: type }, VIEWER_ORIGIN);
  };

  if (!isOpen) return null;

  return (
    <div
      id="doc-viewer-panel"
      style={{
        width: `${viewerWidth}%`,
        minWidth: 450,
        maxWidth: "85%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-secondary, #0f0f0f)",
        position: "relative",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Floating Premium Toolbar ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1.5 p-1.5 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl transition-all hover:bg-black/60 group/toolbar">
        {/* Back button */}
        {history.length > 0 && (
          <button
            onClick={() => goBack()}
            title="Back"
            className="p-1.5 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-all active:scale-95"
          >
            <ChevronLeft size={16} />
          </button>
        )}

        {/* Page indicator pill */}
        <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 flex items-center gap-2 min-w-[90px] justify-center">
          <span className="text-[11px] font-bold tracking-tight text-white/70 uppercase">
            {loadingState === "loading" && "..."}
            {loadingState === "ready" && pageNumber && `PG. ${pageNumber}`}
            {loadingState === "error" && "ERROR"}
          </span>
        </div>

        <div className="w-[1px] h-4 bg-white/10 mx-1" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button onClick={() => handleZoom("out")} className="p-1.5 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-all" title="Zoom Out">-</button>
          <button onClick={() => handleZoom("fit")} className="px-2 py-1.5 hover:bg-purple-500/20 rounded-xl text-[9px] font-black tracking-tighter text-purple-400 hover:text-purple-300 transition-all" title="Fit to Width">FIT</button>
          <button onClick={() => handleZoom("in")} className="p-1.5 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-all" title="Zoom In">+</button>
        </div>

        <div className="w-[1px] h-4 bg-white/10 mx-1" />

        {/* Swap sides */}
        <button
          onClick={() => toggleViewerPosition()}
          title="Swap sides"
          className="p-1.5 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-all active:rotate-180"
        >
          <ArrowLeftRight size={16} />
        </button>

        {/* Close Viewer */}
        <button
          onClick={handleClose}
          id="doc-viewer-close-btn"
          className="p-1.5 hover:bg-red-500/20 rounded-xl text-white/40 hover:text-red-400 transition-all"
        >
          <X size={16} />
        </button>
      </div>



      {/* ── Error state ── */}
      {loadingState === "error" && (
        <div
          style={{
            position: "absolute",
            top: 50,
            left: 0,
            right: 0,
            margin: "24px 24px 0",
            padding: "16px 20px",
            borderRadius: 12,
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#ef4444",
            fontSize: 13,
            zIndex: 10,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span style={{ flex: 1 }}>{errorMessage}</span>
          <button
            onClick={handleRetry}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
              color: "#ef4444",
            }}
          >
            <RotateCcw size={12} /> Retry
          </button>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loadingState === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            top: 45,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 24,
            pointerEvents: "none",
            zIndex: 5,
            background: "var(--bg-secondary, #0f0f0f)",
          }}
        >
          {[80, 100, 60, 90, 75, 55, 100, 70].map((w, i) => (
            <div
              key={i}
              style={{
                height: 14,
                width: `${w}%`,
                borderRadius: 4,
                background: "rgba(255,255,255,0.06)",
                animation: `shimmer 1.5s ${i * 0.1}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── PDF.js iframe ── */}
      <iframe
        ref={iframeRef}
        id="doc-viewer-iframe"
        title="Document Viewer"
        style={{
          flex: 1,
          border: "none",
          width: "100%",
          background: "var(--bg-secondary, #0f0f0f)",
          opacity: loadingState === "ready" ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}
