"use client";
import { useState, useEffect, useRef, use } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { api } from "@/lib/api";
import { 
  Paperclip, Send, Loader2, Pencil, Trash2, X, Maximize2, ExternalLink, 
  Copy, MessageSquare, Check 
} from "lucide-react";

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  attachment_name?: string;
  image_base64?: string;
}

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const copyToClipboard = (text: string, id: number | string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sendMessage = async (text?: string) => {
    let content = (text || input).trim();
    if (!content && !file && !quotedText) return;
    if (streaming) return;

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
        // Update URL to the real thread ID without reloading
        window.history.replaceState(null, "", `/chat/${activeThreadId}`);
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
      const payload: any = { thread_id: parseInt(activeThreadId), content };
      if (currentFile) {
        payload.attachment_name = currentFile.name;
      }
      if (imageBase64) {
        payload.image_base64 = imageBase64;
      }
      const res = await api.stream("/chat/send", payload);
      if (!res.body) throw new Error("No body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

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
              setStreamContent(full);
            } else if (data.type === "done") {
              setMessages((prev) => [...prev, { role: "assistant", content: full }]);
              setStreamContent("");
              setStreaming(false);
              setIntent(null);
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
    // We only do this if it contains a backslash and some known LaTeX command to avoid breaking regular text
    processed = processed.replace(/\((?=\s*\\)(.*?)\)/g, (_, group) => `$${group}$`);
    return processed;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Intent indicator */}
      {intent && (
        <div style={{ padding: "6px 24px", background: "rgba(139,92,246,0.08)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: intent === "academic" ? "#10b981" : "#f59e0b", display: "inline-block" }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {intent === "academic" ? "🎓 Academic query — searching course materials…" : "💬 General query — answering from knowledge base…"}
          </span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 0" }}>
        {messages.length === 0 && !streaming && (
          <div style={{ textAlign: "center", marginTop: 80, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
            <p style={{ fontSize: 15 }}>Start the conversation…</p>
          </div>
        )}

        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
          {messages.map((msg, i) => (
            <div key={i} className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {msg.role === "user" ? (
                <div className="msg-user" style={{ position: "relative", group: "true" } as any}>
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
                      <img src={msg.image_base64} alt="Attached image" style={{ width: "100%", display: "block", objectFit: "contain", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }} />
                    </div>
                  )}
                  {msg.attachment_name && !msg.image_base64 && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>📎 {msg.attachment_name}</p>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "100%" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,#8b5cf6,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, marginTop: 2 }}>🧠</div>
                  <div className="msg-ai prose-ai" style={{ flex: 1 }}>
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath]} 
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                      }}
                    >
                      {preprocessMarkdown(msg.content)}
                    </ReactMarkdown>
                    
                    <div style={{ display: "flex", gap: 16, marginTop: 12, opacity: 0.6, borderTop: "1px solid rgba(0,0,0,0.03)", paddingTop: 8 }}>
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
            <div className="fade-in" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,#8b5cf6,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, marginTop: 2, animation: "pulse-ring 1.5s infinite" }}>🧠</div>
              <div className="msg-ai prose-ai" style={{ flex: 1 }}>
                {streamContent ? (
                  <>
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath]} 
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                      }}
                    >
                      {preprocessMarkdown(streamContent)}
                    </ReactMarkdown>
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
            background: "#2a2a2a",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.2)",
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
      <div style={{ padding: "16px 24px 20px", flexShrink: 0 }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {/* Quote display */}
          {quotedText && (
            <div style={{ 
              background: "rgba(139,92,246,0.1)", 
              border: "1px solid rgba(139,92,246,0.2)", 
              borderLeft: "4px solid #8b5cf6",
              padding: "12px 40px 12px 16px", 
              borderRadius: "12px 12px 0 0",
              fontSize: 13,
              color: "var(--text-muted)",
              position: "relative",
              marginBottom: -1,
              maxHeight: 120,
              overflowY: "auto"
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8b5cf6", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Replying to</div>
              <div style={{ lineClamp: 2, WebkitLineClamp: 2, display: "-webkit-box", WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                &quot;{quotedText}&quot;
              </div>
              <button 
                onClick={() => setQuotedText(null)}
                style={{ 
                  position: "absolute", 
                  top: 8, 
                  right: 8, 
                  background: "rgba(255,255,255,0.1)", 
                  border: "none", 
                  borderRadius: "50%", 
                  width: 24, 
                  height: 24, 
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff"
                }}
              >
                ✕
              </button>
            </div>
          )}

          {file && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 12px", background: "rgba(139,92,246,0.1)", borderRadius: 8, border: "1px solid rgba(139,92,246,0.2)" }}>
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
              placeholder="Ask or search for anything. Paste an image..."
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
                background: (input.trim() || file) && !streaming ? "linear-gradient(135deg,#8b5cf6,#6d28d9)" : "var(--bg-card)",
                border: "1px solid var(--border)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s", fontSize: 16, color: (input.trim() || file) && !streaming ? "white" : "var(--text-muted)"
              }}
              id="chat-send-btn"
            >→</button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
            FIWB may make mistakes. Verify important information. Press Enter to send, Shift+Enter for new line.
          </p>
        </div>
      </div>
    </div>
  );
}
