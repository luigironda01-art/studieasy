"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/contexts/AuthContext";
import { useLayout } from "@/contexts/LayoutContext";
import { supabase, Conversation, Message } from "@/lib/supabase";

// ─── Chat Sidebar ────────────────────────────────────────────────────────────

export function ChatSidebar() {
  const { user } = useAuth();
  const { chatOpen, setChatOpen, isMobile } = useLayout();
  const pathname = usePathname();

  // State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [showConvList, setShowConvList] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingTextRef = useRef("");

  // Detect current source from URL
  const currentSourceId = (() => {
    const match = pathname.match(/\/dashboard\/source\/([^/]+)/);
    return match ? match[1] : null;
  })();

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/chat?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
    }
  }, [user]);

  const fetchMessages = useCallback(async (convId: string) => {
    if (!user) return;
    setLoadingMessages(true);
    try {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      setMessages((data as Message[]) || []);
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
    setLoadingMessages(false);
  }, [user]);

  // Load conversations on open (only when chatOpen transitions to true)
  const prevChatOpen = useRef(false);
  useEffect(() => {
    if (chatOpen && !prevChatOpen.current && user) {
      fetchConversations();
    }
    prevChatOpen.current = chatOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, user]);

  // Load messages when active conversation changes
  const prevConvId = useRef<string | null>(null);
  useEffect(() => {
    if (activeConvId && activeConvId !== prevConvId.current) {
      fetchMessages(activeConvId);
      setShowConvList(false);
    }
    prevConvId.current = activeConvId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId]);

  // Auto-scroll to bottom (debounced during streaming to avoid jank)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const streamChunkRef = useRef(0);
  const currentChunk = Math.floor(streamingText.length / 80);
  if (currentChunk !== streamChunkRef.current) {
    streamChunkRef.current = currentChunk;
  }
  // Track whether scroll should happen (only after user sends a message, not on re-fetch)
  const shouldScrollRef = useRef(false);
  useEffect(() => {
    if (!shouldScrollRef.current) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
    return () => { if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, streamChunkRef.current]);

  // Focus input when chat opens
  useEffect(() => {
    if (chatOpen && !streaming) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen]);

  // ─── Send message ───────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!input.trim() || streaming || !user) return;

    const messageText = input.trim();
    setInput("");
    setStreaming(true);
    setStreamingText("");
    streamingTextRef.current = "";
    shouldScrollRef.current = true;

    // Optimistic: add user message to UI
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConvId || "",
      role: "user",
      content: messageText,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    // Auto-resize textarea back
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          message: messageText,
          userId: user.id,
          sourceId: currentSourceId,
          webSearch,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();

          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);

            // First chunk contains conversationId
            if (parsed.conversationId && !activeConvId) {
              setActiveConvId(parsed.conversationId);
              // Update temp message with real convId
              setMessages(prev =>
                prev.map(m =>
                  m.id === tempUserMsg.id
                    ? { ...m, conversation_id: parsed.conversationId }
                    : m
                )
              );
            }

            if (parsed.text) {
              streamingTextRef.current += parsed.text;
              setStreamingText(streamingTextRef.current);
            }

            if (parsed.error) {
              console.error("Stream error:", parsed.error);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Add complete assistant message
      if (streamingTextRef.current.trim()) {
        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          conversation_id: activeConvId || "",
          role: "assistant",
          content: streamingTextRef.current.trim(),
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      }

      // Refresh conversation list only if this was a new conversation
      if (!activeConvId) {
        fetchConversations();
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Send error:", err);
        const errorMsg: Message = {
          id: `error-${Date.now()}`,
          conversation_id: activeConvId || "",
          role: "assistant",
          content: "Errore di connessione. Riprova.",
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      setStreaming(false);
      setStreamingText("");
      streamingTextRef.current = "";
      abortRef.current = null;
      // Stop auto-scrolling after streaming completes
      setTimeout(() => { shouldScrollRef.current = false; }, 200);
    }
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const startNewChat = () => {
    // Cancel any ongoing stream
    abortRef.current?.abort();
    setActiveConvId(null);
    setMessages([]);
    setStreamingText("");
    setStreaming(false);
    setShowConvList(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const deleteConversation = async (convId: string) => {
    if (!user) return;
    try {
      await fetch("/api/chat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, userId: user.id }),
      });
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  // ─── Keyboard handling ──────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!chatOpen) return null;

  const sidebarWidth = isMobile ? "100vw" : "420px";

  return (
    <>
      {/* Backdrop (mobile) */}
      {isMobile && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setChatOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col bg-slate-900 border-l border-white/10 shadow-2xl"
        style={{ width: sidebarWidth }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div data-tutorial="chat-context">
              <h2 className="text-white font-semibold text-sm">AI Buddy</h2>
              {currentSourceId && (
                <p className="text-[10px] text-blue-400 truncate max-w-[200px]">
                  Contesto libro attivo
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1" data-tutorial="chat-conversations">
            {/* Conversation list toggle */}
            <button
              onClick={() => setShowConvList(!showConvList)}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              title="Conversazioni"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </button>

            {/* New chat */}
            <button
              onClick={startNewChat}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              title="Nuova chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* Close */}
            <button
              onClick={() => setChatOpen(false)}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              title="Chiudi"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Conversation list (overlay) ── */}
        {showConvList && (
          <div className="absolute top-14 left-0 right-0 bottom-0 bg-slate-900 z-10 flex flex-col">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-slate-300 text-sm font-medium">Conversazioni</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-slate-500 text-sm">Nessuna conversazione</p>
                </div>
              ) : (
                conversations.map(conv => (
                  <div
                    key={conv.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors border-b border-white/5 ${
                      activeConvId === conv.id ? "bg-white/10" : ""
                    }`}
                    onClick={() => setActiveConvId(conv.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-300 text-sm truncate">{conv.title}</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {new Date(conv.updated_at).toLocaleDateString("it-IT", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                      }}
                      className="p-1.5 text-slate-600 hover:text-red-400 rounded transition-colors shrink-0"
                      title="Elimina"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loadingMessages ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500" />
            </div>
          ) : messages.length === 0 && !streaming ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-white font-medium mb-1">Ciao! Sono il tuo Buddy</h3>
              <p className="text-slate-400 text-sm mb-4">
                {currentSourceId
                  ? "Chiedimi qualsiasi cosa su questo libro o su qualsiasi altro argomento."
                  : "Chiedimi qualsiasi cosa. Vai su un libro per avere risposte contestuali."}
              </p>
              <div className="space-y-2 w-full max-w-xs">
                {currentSourceId ? (
                  <>
                    <SuggestionChip onClick={(t) => setInput(t)} text="Riassumimi il capitolo principale" />
                    <SuggestionChip onClick={(t) => setInput(t)} text="Quali sono i concetti chiave?" />
                    <SuggestionChip onClick={(t) => setInput(t)} text="Spiegami come se avessi 5 anni" />
                  </>
                ) : (
                  <>
                    <SuggestionChip onClick={(t) => setInput(t)} text="Come funziona la fotosintesi?" />
                    <SuggestionChip onClick={(t) => setInput(t)} text="Aiutami a preparare un esame" />
                    <SuggestionChip onClick={(t) => setInput(t)} text="Cerca le ultime novit\u00e0 su..." />
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {/* Streaming message */}
              {streaming && streamingText && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 bg-white/5 rounded-xl rounded-tl-sm px-3.5 py-2.5">
                    <div className="prose prose-invert prose-sm max-w-none text-slate-300 text-sm leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Typing indicator */}
              {streaming && !streamingText && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="bg-white/5 rounded-xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input area ── */}
        <div className="shrink-0 border-t border-white/10 px-4 py-3">
          {/* Web search toggle */}
          <div className="flex items-center gap-2 mb-2" data-tutorial="chat-web">
            <button
              onClick={() => setWebSearch(!webSearch)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                webSearch
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "bg-white/5 text-slate-500 border border-transparent hover:text-slate-400"
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Web
            </button>
            {webSearch && (
              <span className="text-[10px] text-blue-400/70">Ricerca web attiva</span>
            )}

            {streaming && (
              <button
                onClick={stopStreaming}
                className="ml-auto flex items-center gap-1 px-2.5 py-1 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop
              </button>
            )}
          </div>

          {/* Input */}
          <div className="flex items-end gap-2" data-tutorial="chat-input">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={webSearch ? "Cerca sul web..." : "Scrivi un messaggio..."}
              disabled={streaming}
              rows={1}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all disabled:opacity-50"
              style={{ maxHeight: "150px" }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              className="p-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
          isUser
            ? "bg-slate-700"
            : "bg-gradient-to-br from-blue-500 to-purple-600"
        }`}
      >
        {isUser ? (
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </div>

      {/* Message */}
      <div
        className={`flex-1 min-w-0 rounded-xl px-3.5 py-2.5 ${
          isUser
            ? "bg-blue-500/20 rounded-tr-sm"
            : "bg-white/5 rounded-tl-sm"
        }`}
      >
        {isUser ? (
          <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none text-slate-300 text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ol]:mb-2 [&_pre]:bg-slate-800 [&_pre]:rounded-lg [&_code]:text-blue-300 [&_code]:text-xs [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_a]:text-blue-400">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionChip({ text, onClick }: { text: string; onClick: (text: string) => void }) {
  return (
    <button
      onClick={() => onClick(text)}
      className="w-full text-left px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-slate-400 text-xs hover:bg-white/10 hover:text-white transition-colors"
    >
      {text}
    </button>
  );
}
