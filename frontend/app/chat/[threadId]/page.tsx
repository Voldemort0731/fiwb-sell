"use client";
import { useState, useEffect, useRef, use, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { api } from "@/lib/api";
import { useViewerStore, getViewerContextSnapshot } from "@/lib/viewer-store";
import DocumentViewer from "@/components/DocumentViewer";
import MindMapPanel from "@/components/MindMapPanel";
import { MindMapData, useMindMapStore } from "@/lib/mindmap-store";
import {
  Paperclip, Send, Loader2, Pencil, Trash2, X, Maximize2, ExternalLink,
  Copy, MessageSquare, Check, BookOpen, ArrowUp, ImagePlus
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";




import CitationChip from "@/components/CitationChip";
import MindMapChip from "@/components/MindMapChip";
import { CitationData } from "@/lib/viewer-store";

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  attachment_name?: string;
  image_base64?: string;
  citations?: CitationData[];  // populated after stream_end
}

type ChatPayload = {
  thread_id: number;
  content: string;
  attachment_name?: string;
  image_base64?: string;
  viewer_context?: ReturnType<typeof getViewerContextSnapshot>;
};

type MindMapResponse = {
  data: MindMapData;
  generated_at: string;
  can_undo: boolean;
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export default function ChatThread({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [intent, setIntent] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editInput, setEditInput] = useState("");
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  // Citations buffer: arrives after stream_end, before done
  const pendingCitationsRef = useRef<CitationData[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef<number>(0);
  const workspaceRef = useRef<HTMLDivElement>(null); // tracks the chat+viewer flex container
  const isResizingRef = useRef(false); // disables CSS transitions during active drag

  // Viewer state — for split layout
  const isFileOpen = useViewerStore((state) => state.isOpen);
  const docId = useViewerStore((state) => state.docId); // Added missing docId reference
  const setViewerWidth = useViewerStore((state) => state.setViewerWidth);
  const viewerWidth = useViewerStore((state) => state.viewerWidth);
  const viewerOnLeft = useViewerStore((state) => state.viewerOnLeft);
  const isViewerMaximized = useViewerStore((state) => state.isMaximized);

  // Mind map state & actions
  const isMindMapOpen = useMindMapStore(state => state.isOpen);
  const mindMapWidth = useMindMapStore(state => state.mindMapWidth);
  const setMindMapWidth = useMindMapStore(state => state.setMindMapWidth);
  const openMap = useMindMapStore(state => state.openMap);
  const closeMindMap = useMindMapStore(state => state.closeMap);
  const setMindMapData = useMindMapStore(state => state.setData);
  const setMindMapLoading = useMindMapStore(state => state.setLoading);



  // Save scroll before panel opens, restore after it closes
  useEffect(() => {
    if (isFileOpen) {
      savedScrollRef.current = chatContainerRef.current?.scrollTop ?? 0;
    } else {
      // Restore on next tick after layout reflows
      requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = savedScrollRef.current;
        }
      });
    }
  }, [isFileOpen]);

  // Load messages
  useEffect(() => {
    if (threadId === "new") {
      setMessages([]);
      return;
    }
    api.get(`/chat/threads/${threadId}/messages`).then(setMessages).catch(() => {});
  }, [threadId]);

  const hasAutoSent = useRef(false);

  // Auto-send if ?prompt= param
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (prompt && messages.length === 0 && !hasAutoSent.current) {
      hasAutoSent.current = true;
      setInput(prompt);
      setTimeout(() => sendMessage(prompt), 200);
    }
  }, [searchParams, messages.length]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  // Handle text selection for "Ask fiwb"
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        let node = sel.anchorNode;
        let isAiMessage = false;
        while (node) {
          if (node instanceof HTMLElement && node.classList.contains("msg-ai")) {
            isAiMessage = true;
            break;
          }
          node = node.parentNode;
        }

        if (isAiMessage) {
          setSelection({
            text: sel.toString().trim(),
            x: rect.left + rect.width / 2,
            y: rect.top + window.scrollY,
          });
        } else {
          setSelection(null);
        }
      } else {
        setSelection(null);
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  // ── Drag to Resize Logic (Viewer) ──
  const startViewerResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    if (isViewerMaximized) return; // Disable resizing in full-focus mode
    mouseDownEvent.preventDefault();

    // Capture the workspace container rect once at drag start (excludes sidebar)
    const containerRect = workspaceRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const containerLeft = containerRect.left;
    const containerWidth = containerRect.width;

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
      const mouseXInContainer = mouseMoveEvent.clientX - containerLeft;
      const newWidthPx = viewerOnLeft ? mouseXInContainer : (containerWidth - mouseXInContainer);
      let newWidthPercent = (newWidthPx / containerWidth) * 100;
      if (newWidthPercent < 15) newWidthPercent = 15;
      if (newWidthPercent > 70) newWidthPercent = 70;
      setViewerWidth(newWidthPercent);
    };
    const onMouseUp = () => {
      isResizingRef.current = false;
      // Restore iframe pointer events so PDF is interactive again
      document.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = ''));
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    isResizingRef.current = true;
    // Block iframe from capturing mouse events during drag
    document.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = 'none'));
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [viewerOnLeft, setViewerWidth, isViewerMaximized]);

  const toggleMindMap = () => {
    if (isMindMapOpen) closeMindMap();
    else if (docId) openMap(docId);
  };

  const toggleDocViewer = () => {
    // We toggle isOpen directly in store, but need a docId
    useViewerStore.setState({ isOpen: !isFileOpen });
  };


  // ── Drag to Resize Logic (Mind Map) ──
  const startMindMapResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();

    // Capture workspace container rect at drag start
    const containerRect = workspaceRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const containerLeft = containerRect.left;
    const containerWidth = containerRect.width;

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
      const mouseXInContainer = mouseMoveEvent.clientX - containerLeft;
      const newWidthPx = containerWidth - mouseXInContainer;
      let newWidthPercent = (newWidthPx / containerWidth) * 100;
      if (newWidthPercent < 15) newWidthPercent = 15;
      if (newWidthPercent > 70) newWidthPercent = 70;
      setMindMapWidth(newWidthPercent);
    };
    const onMouseUp = () => {
      isResizingRef.current = false;
      // Restore iframe pointer events
      document.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = ''));
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    isResizingRef.current = true;
    // Block iframe from capturing mouse events during drag
    document.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = 'none'));
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [setMindMapWidth]);


  const copyToClipboard = (text: string, id: number | string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sendMessage = async (text?: string) => {
    let content = (text || input).trim();
    if (!content && !file && !quotedText) return;
    if (streaming) return;

    // --- PART 5: Snapshot viewer context at send time ---
    const viewerCtx = getViewerContextSnapshot();
    const shouldInjectContext = !!viewerCtx;


    if (quotedText) {
      content = `Regarding: "${quotedText}"\n\n${content}`;
      setQuotedText(null);
    }

    let activeThreadId = threadId;

    // Handle initial thread creation
    if (threadId === "new") {
      try {
        const newThread = await api.post("/chat/threads", { title: content.slice(0, 30) });
        activeThreadId = newThread.id.toString();
        // Force URL update to anchor the history before sending the message payload
        router.push(`/chat/${activeThreadId}`, { scroll: false });
      } catch (err) {
        console.error("Failed to create thread:", err);
        return;
      }
    }


    let imageBase64: string | undefined = undefined;
    const currentFile = file;
    setFile(null); // Clear early for snappy UI

    if (currentFile && currentFile.type.startsWith("image/")) {
      try {
        imageBase64 = await fileToBase64(currentFile);
      } catch (e) {
        console.error("Failed to convert image to base64", e);
      }
    }

    const userMsg: Message = { role: "user", content, attachment_name: currentFile?.name, image_base64: imageBase64 };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamContent("");
    setIntent(null);

    // Upload file if present
    if (currentFile) {

      const fd = new FormData();
      fd.append("thread_id", activeThreadId);
      fd.append("file", currentFile);
      try {
        const token = JSON.parse(localStorage.getItem("fiwb-auth") || "{}")?.state?.token;
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      } catch {}
    }

    // Stream response
    try {
      const payload: ChatPayload = { thread_id: parseInt(activeThreadId), content };
      if (currentFile) {
        payload.attachment_name = currentFile.name;
      }
      if (imageBase64) {
        payload.image_base64 = imageBase64;
      }
      if (shouldInjectContext && viewerCtx) {
        payload.viewer_context = viewerCtx;
      }
      const res = await api.stream("/chat/send", payload);
      if (!res.body) throw new Error("No body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      const hasOpenedDocRef = { current: false };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "metadata" && data.user_message_id) {
              setMessages((prev) => {
                const newMsgs = [...prev];
                for (let j = newMsgs.length - 1; j >= 0; j--) {
                  if (newMsgs[j].role === "user") {
                    newMsgs[j].id = data.user_message_id;
                    break;
                  }
                }
                return newMsgs;
              });
            } else if (data.type === "triage") setIntent(data.intent);
            else if (data.type === "chunk") {
              full += data.content;
              
              // Clean BOTH single and double bracket formats from visibility
              setStreamContent(full.replace(/[<]{1,2}OPEN:[^>]+[>]{1,2}/g, ""));
            } else if (data.type === "stream_end") {
              // Text is frozen — citation replacement pass will follow
              setStreamContent(full);
            } else if (data.type === "citations") {
              pendingCitationsRef.current = data.data ?? [];
            } else if (data.type === "done") {
              const finalCitations = [...pendingCitationsRef.current];
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: full.replace(/[<]{1,2}OPEN:[^>]+[>]{1,2}/g, ""),
                  citations: finalCitations,
                },
              ]);
              pendingCitationsRef.current = [];
              setStreamContent("");
              setStreaming(false);
              setIntent(null);
            } else if (data.type === "mind_map_action") {
              const { action, docId: mmDocId, instruction } = data;
              if (action === "close") {
                closeMindMap();
              } else if (action === "open") {
                if (mmDocId) openMap(mmDocId);
              } else if (action === "regenerate") {
                if (mmDocId) { openMap(mmDocId); }
              } else if (action === "edit" && mmDocId && instruction) {
                setMindMapLoading(true);
                api.patch(`/mindmap/${mmDocId}/edit`, { instruction })
                  .then((res: MindMapResponse) => setMindMapData(res.data, res.generated_at, res.can_undo))
                  .catch(() => setMindMapLoading(false));
              } else if (action === "undo" && mmDocId) {
                setMindMapLoading(true);
                api.post(`/mindmap/${mmDocId}/undo`)
                  .then((res: MindMapResponse) => setMindMapData(res.data, res.generated_at, res.can_undo))
                  .catch(() => setMindMapLoading(false));
              }
            } else if (data.type === "error") {
              setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.message}` }]);
              setStreaming(false);
            }
          } catch {}
        }
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Connection error. Please try again." }]);
      setStreaming(false);
    }
  };

  const handleRegenerate = async (msgId: number, newContent: string) => {
    if (streaming) return;
    setStreaming(true);
    setIntent(null);
    setEditingMessageId(null);

    // Truncate messages: keep everything up to (and including) the edited message
    const msgIndex = messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;
    
    const updatedMessages = messages.slice(0, msgIndex + 1);
    updatedMessages[msgIndex].content = newContent;
    setMessages(updatedMessages);

    try {
      const response = await api.stream("/chat/regenerate", { 
        thread_id: parseInt(threadId), 
        message_id: msgId, 
        new_content: newContent 
      });

      if (!response.ok) throw new Error("Failed to regenerate");

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "metadata" && data.user_message_id) {
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  const idx = newMsgs.findIndex(m => m.id === msgId);
                  if (idx !== -1) newMsgs[idx].id = data.user_message_id;
                  return newMsgs;
                });
              } else if (data.type === "triage") setIntent(data.intent);
              else if (data.type === "chunk") {
                full += data.content;
                setStreamContent(full);
              } else if (data.type === "done") {
                setMessages((prev) => [...prev, { role: "assistant", content: full }]);
                setStreamContent("");
                setStreaming(false);
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error regenerating response." }]);
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      setFile(e.clipboardData.files[0]);
    }
  };

  const preprocessMarkdown = (content: string) => {
    // 1. Convert \( ... \) to $ ... $ (Inline)
    let processed = content.replace(/\\\((.*?)\\\)/g, (_, group) => `$${group}$`);
    // 2. Convert \[ ... \] to $$ ... $$ (Block)
    processed = processed.replace(/\\\[(.*?)\\\]/g, (_, group) => `$$\n${group}\n$$`);
    // 3. Handle cases where the LLM might use literal parentheses ( \mathbb{N} ) from legacy context
    processed = processed.replace(/\((?=\s*\\)(.*?)\)/g, (_, group) => `$${group}$`);
    // 4. Scrub TECHNICAL TAGS (OPEN/CLOSE triggers) from visibility
    processed = processed.replace(/[<]{1,2}OPEN:[^>]+[>]{1,2}/g, "");
    return processed;
  };

  /**
   * Render a message content string with citation chips replacing [[cite:passageId]] markers.
   * Only called AFTER citations array is available (not during streaming).
   */
  const renderMessageContent = (content: string, citations?: CitationData[]) => {
    // If no specific citations array, try to find [[cite:...]] and render them inert
    // But if we have citations, we match them.
    if (!citations || citations.length === 0) {
      // Split on [[cite:passageId]] or [[mindmap:docId]] placeholders
      const parts = content.split(/(\[\[cite:[^\]]+\]\]|\[\[mindmap:[^\]]+\]\])/g);
      
      return (
        <>
          {parts.map((part, i) => {
            const citeMatch = part.match(/^\[\[cite:([^\]]+)\]\]$/);
            const mmMatch = part.match(/^\[\[mindmap:([^\]]+)\]\]$/);

            if (citeMatch) {
              return <span key={i} style={{ opacity: 0.5, fontSize: "0.8em", background: "rgba(139,92,246,0.1)", padding: "2px 6px", borderRadius: 4, margin: "0 2px" }}>[ref]</span>;
            }

            if (mmMatch) {
              return <MindMapChip key={i} docId={mmMatch[1]} />;
            }

            return part ? (
              <ReactMarkdown
                key={i}
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
              >
                {preprocessMarkdown(part)}
              </ReactMarkdown>
            ) : null;
          })}
        </>
      );
    }

    // Build a map of passageId → CitationData
    const citationById = new Map(citations.map((c) => [c.passageId, c]));

    // Split on [[cite:passageId]] or [[mindmap:docId]] placeholders
    const parts = content.split(/(\[\[cite:[^\]]+\]\]|\[\[mindmap:[^\]]+\]\])/g);

    return (
      <>
        {parts.map((part, i) => {
          const citeMatch = part.match(/^\[\[cite:([^\]]+)\]\]$/);
          const mmMatch = part.match(/^\[\[mindmap:([^\]]+)\]\]$/);

          if (citeMatch) {
            const passageId = citeMatch[1];
            const citation = citationById.get(passageId);
            if (citation) {
              return <CitationChip key={i} citation={citation} />;
            }
            return <span key={i} style={{ opacity: 0.5, fontSize: "0.8em", background: "rgba(139,92,246,0.1)", padding: "2px 6px", borderRadius: 4, margin: "0 2px" }}>[ref]</span>;
          }

          if (mmMatch) {
            const mmDocId = mmMatch[1];
            return <MindMapChip key={i} docId={mmDocId} />;
          }

          return part ? (
            <ReactMarkdown
              key={i}
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
            >
              {preprocessMarkdown(part)}
            </ReactMarkdown>
          ) : null;
        })}
      </>
    );
  };

  return (
    <div className="flex w-full h-full overflow-hidden bg-transparent text-[var(--text-primary)]">
      {/* Dynamic Workspace Container */}
      <div 
        ref={workspaceRef}
        className={clsx(
          "flex flex-1 overflow-hidden relative w-full h-full",
          viewerOnLeft ? "flex-row-reverse" : "flex-row",
          isViewerMaximized && "viewer-maximized"
        )}
      >


    {/* ── Left: Chat Panel ── */}
    <div
      style={{
        flex: isViewerMaximized ? "0 0 0%" : "1",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: isResizingRef.current ? "none" : "flex 0.3s ease",
      }}
    >
      {/* Intent indicator */}
      {intent && (
        <div className="claude-thread-width mt-4 p-3 rounded-2xl bg-[#fffdf7]/70 backdrop-blur-md border border-[var(--border)] flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className={clsx(
            "w-2 h-2 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.1)]",
            intent === "academic" ? "bg-emerald-500 shadow-emerald-500/50" : "bg-amber-500 shadow-amber-500/50"
          )} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-black/40">
            {intent === "academic" ? "Deep Material Scan Active" : "General Intelligence Mode"}
          </span>
        </div>
      )}

      {/* Messages */}
      <div 
        ref={chatContainerRef} 
        className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >

        {messages.length === 0 && !streaming && (
          <div style={{ textAlign: "center", marginTop: 80, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <p style={{ fontSize: 15 }}>Start the conversation…</p>
          </div>
        )}

        <div className="claude-thread-width" style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 22 }}>
          {messages.map((msg, i) => (
            <div key={i} className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {msg.role === "user" ? (
                <div className="msg-user" style={{ position: "relative" }}>
                  {editingMessageId === msg.id ? (
                    <div style={{ width: "100%", minWidth: 300 }}>
                      <textarea
                        value={editInput}
                        onChange={(e) => setEditInput(e.target.value)}
                        style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid var(--accent)", borderRadius: 8, color: "#fff", padding: 10, fontSize: 14, minHeight: 80, outline: "none" }}
                        autoFocus
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => setEditingMessageId(null)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer" }}>Cancel</button>
                        <button onClick={() => handleRegenerate(msg.id!, editInput)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, background: "var(--accent)", border: "none", color: "#fff", cursor: "pointer" }}>Save & Submit</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.content.startsWith('Regarding: "') && (
                        <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.05)", borderRadius: 6, borderLeft: "3px solid var(--accent)", marginBottom: 8, fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
                          {msg.content.split('\n\n')[0]}
                        </div>
                      )}
                      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                        {msg.content.includes('\n\n') ? msg.content.split('\n\n').slice(1).join('\n\n') : msg.content}
                      </p>
                      
                      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end", opacity: 0.6 }}>
                        {msg.id && !streaming && (
                          <button 
                            onClick={() => { setEditingMessageId(msg.id!); setEditInput(msg.content); }}
                            className="edit-btn"
                            style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 4, borderRadius: 4, transition: "all 0.2s" }}
                            title="Edit message"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => copyToClipboard(msg.content, msg.id || i)}
                          style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 4, borderRadius: 4, transition: "all 0.2s" }}
                          title="Copy message"
                        >
                          {copiedId === (msg.id || i) ? <Check size={14} style={{ color: "var(--success)" }} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </>
                  )}
                  
                  {msg.image_base64 && (
                    <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', maxWidth: 350 }}>
                      <img src={msg.image_base64} alt="Attached image" style={{ width: "100%", display: "block", objectFit: "contain", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)" }} />
                    </div>
                  )}
                  {msg.attachment_name && !msg.image_base64 && (
                    <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 4 }}>📎 {msg.attachment_name}</p>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", width: "100%" }}>
                  <div className="claude-avatar">F</div>
                  <div className="msg-ai prose-ai" style={{ flex: 1 }}>
                    {renderMessageContent(msg.content, msg.citations)}



                    <div style={{ display: "flex", gap: 16, marginTop: 12, opacity: 0.58, paddingTop: 4 }}>
                      <button 
                        onClick={() => copyToClipboard(msg.content, msg.id || i)}
                        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", transition: "all 0.2s" }}
                        className="hover-accent"
                      >
                        {copiedId === (msg.id || i) ? <Check size={14} style={{ color: "var(--success)" }} /> : <Copy size={14} />}
                        {copiedId === (msg.id || i) ? "Copied" : "Copy"}
                      </button>
                      <button 
                        onClick={() => {
                          setQuotedText(msg.content);
                          textareaRef.current?.focus();
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", transition: "all 0.2s" }}
                        className="hover-accent"
                      >
                        <MessageSquare size={14} />
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Streaming */}
          {streaming && (
            <div className="claude-thread-width fade-in" style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "0 12px" }}>
              <div className="claude-avatar" style={{ animation: "pulse-ring 1.5s infinite" }}>F</div>
              <div className="msg-ai prose-ai" style={{ flex: 1 }}>
                {streamContent ? (
                  <>
                    {/* Use renderMessageContent for streaming text too, so chips appear immediately after stream_end */}
                    {renderMessageContent(streamContent, pendingCitationsRef.current)}
                    <span className="typing-cursor" />
                  </>
                ) : (
                  <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 0" }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", opacity: 0.6, animation: `blink 1.2s ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Floating "Ask fiwb" button */}
      {selection && (
        <button
          onClick={() => {
            setQuotedText(selection.text);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
            textareaRef.current?.focus();
          }}
          style={{
            position: "fixed",
            top: selection.y - 45,
            left: selection.x,
            transform: "translateX(-50%)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            padding: "8px 14px",
            borderRadius: "10px",
            border: "1px solid var(--border)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            zIndex: 1000,
            whiteSpace: "nowrap"
          }}
          className="fade-in"
        >
          <span style={{ fontSize: 16 }}>💬</span> Ask fiwb
        </button>
      )}

      {/* Input area */}
      <div className="claude-composer-bar">
        <div className="claude-thread-width">
          {/* Quote display */}
          {quotedText && (
            <div style={{ 
              background: "rgba(204,120,92,0.1)", 
              border: "1px solid rgba(204,120,92,0.2)", 
              borderLeft: "4px solid var(--accent)",
              padding: "12px 40px 12px 16px", 
              borderRadius: "12px 12px 0 0",
              fontSize: 13,
              color: "var(--text-muted)",
              position: "relative",
              marginBottom: -1,
              maxHeight: 120,
              overflowY: "auto"
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Replying to</div>
              <div style={{ lineClamp: 2, WebkitLineClamp: 2, display: "-webkit-box", WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                &quot;{quotedText}&quot;
              </div>
              <button 
                onClick={() => setQuotedText(null)}
                style={{ 
                  position: "absolute", 
                  top: 8, 
                  right: 8, 
                  background: "rgba(0,0,0,0.05)", 
                  border: "none", 
                  borderRadius: "50%", 
                  width: 24, 
                  height: 24, 
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-primary)"
                }}
              >
                ✕
              </button>
            </div>
          )}

          {file && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 12px", background: "rgba(204,120,92,0.1)", borderRadius: 12, border: "1px solid rgba(204,120,92,0.2)" }}>
              <span style={{ fontSize: 14 }}>📎</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>{file.name}</span>
              <button onClick={() => setFile(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          )}
          <div className="chat-input-wrapper">
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,image/*" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, padding: "0 2px", flexShrink: 0, transition: "color 0.2s" }}
              title="Attach file"
            >+</button>
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder="Let's Cook"
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              disabled={streaming}
              id="chat-input"
            />
            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && !file) || streaming}
              style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: (input.trim() || file) && !streaming ? "#2f2b25" : "var(--bg-card)",
                border: "1px solid var(--border)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s", fontSize: 16, color: (input.trim() || file) && !streaming ? "white" : "var(--text-muted)"
              }}
              id="chat-send-btn"
            >→</button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
            FIWB can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div> {/* End left chat panel */}

    <AnimatePresence mode="popLayout">
      {/* ── Document Viewer Panel ── */}
      {isFileOpen && (
        <div 
          className={clsx(
            "flex h-full overflow-hidden transition-[flex-basis] duration-300",
            !isViewerMaximized ? "border-l border-white/5" : "border-none"
          )} 
          style={{ 
            flex: isViewerMaximized ? "0 0 100%" : `0 0 ${viewerWidth}%`,
            transition: isResizingRef.current ? "none" : "flex 0.3s ease",
          }}
        >
          <div
            onMouseDown={startViewerResizing}
            className={clsx(
              "resizer-handle w-1.5 h-full cursor-col-resize z-[110] bg-transparent hover:bg-purple-500/20 transition-all relative group",
              isViewerMaximized && "hidden"
            )}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" /> {/* Larger hit area */}
            <div className="resizer-dots !left-1/2 -translate-x-1/2">
              <div className="resizer-dot" /><div className="resizer-dot" /><div className="resizer-dot" />
            </div>
          </div>

          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "100%", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="h-full w-full overflow-hidden bg-[var(--bg-primary)] relative"
          >
            <DocumentViewer />
          </motion.div>
        </div>
      )}

      {/* ── Mind Map Panel ── */}
      {isMindMapOpen && (
        <div 
          className="flex h-full overflow-hidden" 
          style={{ 
            flex: `0 0 ${mindMapWidth}%`,
            transition: isResizingRef.current ? "none" : "flex 0.3s ease",
          }}
        >
          <div
            onMouseDown={startMindMapResizing}
            className="resizer-handle w-px h-full cursor-col-resize z-50 bg-black/5 hover:bg-purple-500/50 transition-colors relative"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" /> {/* Larger hit area */}
            <div className="resizer-dots !left-1/2 -translate-x-1/2">
              <div className="resizer-dot" /><div className="resizer-dot" /><div className="resizer-dot" />
            </div>
          </div>

          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "100%", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="h-full w-full overflow-hidden border-l border-white/5 relative bg-[var(--bg-primary)]"
          >
            <MindMapPanel onChatInject={(text) => { setInput(text); textareaRef.current?.focus(); }} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* Mobile: stack vertically */}
    <style>{`
      @media (prefers-reduced-motion: reduce) {
        div[style*="transition"] { transition: none !important; }
      }
      @media (max-width: 767px) {
        #doc-viewer-panel, #mindmap-panel {
          position: fixed !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          height: 50vh !important;
          z-index: 200 !important;
          border-left: none !important;
          border-top: 1px solid var(--border) !important;
        }
      }
      @keyframes shimmer {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.8; }
      }
    `}</style>
      </div>
    </div>
  );
}
