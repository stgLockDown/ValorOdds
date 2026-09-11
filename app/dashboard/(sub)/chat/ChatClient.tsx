'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Mic, MicOff, Plus, MessageSquare, Trash2, Menu, X, Sparkles } from 'lucide-react';
import type { Tier } from '@/lib/env';
import DOMPurify from 'dompurify';

type Msg = { role: 'user' | 'assistant' | 'system'; content: string; pending?: boolean };

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

// Dynamically load markdown parser
declare global {
  interface Window {
    marked?: { parse: (s: string) => string };
    DOMPurify?: { sanitize: (s: string, o?: any) => string };
  }
}

function sanitizeHtml(html: string | null | undefined): string {
  return html
    ? DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['span', 'p'],
        ALLOWED_ATTR: ['class'],
      })
    : '';
}

function renderMarkdown(src: string): string {
  if (typeof window === 'undefined' || !window.marked || !window.DOMPurify) {
    return src.replace(/\n/g, '<br>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  const html = window.marked.parse(String(src || ''));
  return window.DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','br','strong','em','code','pre','ul','ol','li','a','h1','h2','h3','h4','blockquote','table','thead','tbody','tr','th','td','hr','span'],
    ALLOWED_ATTR: ['href','target','rel','class'],
  });
}

const QUICK_SUGGESTIONS = [
  'What are the best arbitrage opportunities right now?',
  'Any notable injuries affecting tonight’s games?',
  'Which way is the sharp money moving?',
  'Give me your top picks for today',
];

export default function ChatClient({
  user,
  embedded = false,
}: {
  user: { id: string; email: string; tier: Tier; discordId: string | null };
  embedded?: boolean;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  // Sidebar starts CLOSED on mobile, OPEN on desktop. We detect viewport once
  // on mount to avoid hydration mismatch.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Ref flag: when true, the "load messages on conversation change" effect is
  // suppressed. This prevents a race condition where send() sets
  // currentConversationId (to a freshly-created conversation), which triggers
  // loadMessages() — overwriting the in-flight user message + pending assistant
  // response with whatever the server has for the brand-new (empty) conversation.
  // Set to true at the start of send(), cleared after the stream completes.
  const sendingRef = useRef(false);

  // Detect desktop breakpoint on mount (avoids SSR mismatch)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      const desktop = mq.matches;
      setIsDesktop(desktop);
      setSidebarOpen(desktop); // open by default on desktop, closed on mobile
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Load CDN libs once
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const loadScript = (src: string) =>
      new Promise<void>((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        document.head.appendChild(s);
      });
    loadScript('https://cdn.jsdelivr.net/npm/marked@12/marked.min.js');
    loadScript('https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js');
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Load conversations
  useEffect(() => {
    loadConversations();
  }, []);

  // Load messages when the user selects a conversation from the sidebar.
  // SKIPPED while a send() is in progress (sendingRef) — send() sets
  // currentConversationId to a newly-created conversation and manages the
  // messages state itself; loadMessages() would otherwise clobber the
  // in-flight user message + streaming assistant response with stale/empty
  // server data, making it appear as though the chat input doesn't work.
  useEffect(() => {
    if (currentConversationId && !sendingRef.current) {
      loadMessages(currentConversationId);
    }
  }, [currentConversationId]);

  // Close mobile drawer when a conversation is selected (mobile UX)
  useEffect(() => {
    if (!isDesktop) setSidebarOpen(false);
  }, [currentConversationId, isDesktop]);

  async function loadConversations() {
    setLoadingConversations(true);
    try {
      const resp = await fetch('/api/chat/conversations');
      if (resp.ok) {
        const { data } = await resp.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function loadMessages(convId: string) {
    try {
      const resp = await fetch(`/api/chat/conversations/${convId}/messages`);
      if (resp.ok) {
        const { data } = await resp.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }

  async function newChat() {
    // Suppress the loadMessages effect — we're creating a fresh conversation
    // and explicitly clearing messages; we don't want a stale server fetch to
    // race with setMessages([]).
    sendingRef.current = true;
    try {
      const resp = await fetch('/api/chat/conversations', { method: 'POST' });
      if (resp.ok) {
        const { data } = await resp.json();
        setCurrentConversationId(data.id);
        setMessages([]);
        setConversations([data, ...conversations]);
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    } finally {
      sendingRef.current = false;
    }
  }

  async function deleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;

    try {
      await fetch(`/api/chat/conversations?id=${id}`, { method: 'DELETE' });
      setConversations(conversations.filter(c => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }

  // Auto-generate title from first user message
  async function updateConversationTitle(convId: string, firstMessage: string) {
    try {
      const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
      await fetch(`/api/chat/conversations/${convId}/title`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      loadConversations();
    } catch (err) {
      console.error('Failed to update title:', err);
    }
  }

  async function send(questionOverride?: string) {
    const q = (questionOverride ?? input).trim();
    if (!q || sending) return;
    setInput('');
    setSending(true);
    sendingRef.current = true; // suppress loadMessages() during this send

    // Build history from current messages
    const history = messages
      .filter((m) => !m.pending)
      .map((m) => ({ role: m.role, content: m.content }));

    const newMessages = [
      ...history,
      { role: 'user' as const, content: q },
      { role: 'assistant' as const, content: '', pending: true },
    ];

    setMessages(newMessages);

    // Create new conversation if needed
    let convId = currentConversationId;
    if (!convId) {
      try {
        const resp = await fetch('/api/chat/conversations', { method: 'POST' });
        if (resp.ok) {
          const { data } = await resp.json();
          convId = data.id;
          setCurrentConversationId(convId);
          if (convId) updateConversationTitle(convId, q);
        }
      } catch (err) {
        console.error('Failed to create conversation:', err);
      }
    }

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history }),
      });

      if (!resp.ok || !resp.body) {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: 'assistant', content: `⚠️ Error: ${resp.status} ${resp.statusText}` };
          return copy;
        });
        setSending(false);
        sendingRef.current = false;
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.trim()) continue;
          for (const line of part.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();

            if (data === '[DONE]') {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: 'assistant', content: accumulated };
                return copy;
              });
              continue;
            }

            try {
              const payload = JSON.parse(data);
              const token = payload?.choices?.[0]?.delta?.content;
              if (typeof token === 'string' && token) {
                accumulated += token;
                setMessages((m) => {
                  const copy = [...m];
                  copy[copy.length - 1] = { role: 'assistant', content: accumulated, pending: true };
                  return copy;
                });
              }
              if (typeof payload?.content === 'string' && !payload?.choices) {
                accumulated += payload.content;
                setMessages((m) => {
                  const copy = [...m];
                  copy[copy.length - 1] = { role: 'assistant', content: accumulated };
                  return copy;
                });
              }
            } catch {
              // skip
            }
          }
        }
      }

      setMessages((m) => {
        const copy = [...m];
        if (copy[copy.length - 1]?.pending) {
          copy[copy.length - 1] = { role: 'assistant', content: accumulated || '…' };
        }
        return copy;
      });

      // Save conversation
      if (convId) {
        const finalMessages = [
          ...messages.filter(m => !m.pending).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: q },
          { role: 'assistant', content: accumulated || '…' },
        ];
        await fetch(`/api/chat/conversations/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: finalMessages }),
        });
        loadConversations();
      }

    } catch (err: any) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: `⚠️ Network error: ${err?.message ?? 'unknown'}` };
        return copy;
      });
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }

  function toggleVoice() {
    if (typeof window === 'undefined') return;
    const SpeechRec: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Voice input is not supported in this browser.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput((prev) => (finalText || interim ? `${finalText}${interim}` : prev));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  }

  // When embedded in the Command Center, we render full-height and let the
  // parent card control the outer chrome. When standalone (chat tab) we use
  // the viewport height minus navbar. Full-width embedded gets a generous
  // height now that it sits below the live-data panels rather than in a
  // cramped 420px side column.
  const containerHeight = embedded
    ? 'h-[70vh] min-h-[460px] max-h-[900px] sm:h-[78vh] sm:min-h-[520px]'
    : 'h-[calc(100vh-4rem)]';

  return (
    <div className={`${containerHeight} flex bg-brand-bg overflow-hidden relative`}>
      {/* ── Sidebar (chat history) ──────────────────────────────────────
          Desktop (lg+): fixed left rail, w-72, slides in/out.
          Mobile: full overlay drawer with dark backdrop. */}
      {/* Backdrop for mobile drawer */}
      {sidebarOpen && !isDesktop && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`${
          isDesktop
            ? `relative ${sidebarOpen ? 'w-72' : 'w-0'}`
            : `fixed top-0 left-0 bottom-0 z-50 ${sidebarOpen ? 'w-[85vw] max-w-72 translate-x-0' : '-translate-x-full w-[85vw] max-w-72'}`
        } transition-all duration-300 flex-shrink-0 flex flex-col bg-brand-elevated border-r border-brand-border overflow-hidden`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-brand-border flex items-center justify-between">
          <span className="text-sm font-semibold text-brand-muted uppercase tracking-wider">History</span>
          {!isDesktop && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-brand-surface transition-colors"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-3 border-b border-brand-border">
          <button
            onClick={newChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-brand-border bg-brand-bg hover:bg-brand-surface hover:border-brand-primary/50 transition-colors text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            <span>New chat</span>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingConversations ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-muted" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-brand-muted text-sm px-3">
              No conversations yet.
              <br />
              Start by asking a question below.
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setCurrentConversationId(conv.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors group relative ${
                  currentConversationId === conv.id
                    ? 'bg-brand-primary text-white'
                    : 'hover:bg-brand-surface text-brand-muted hover:text-white'
                }`}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0 opacity-60" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{conv.title}</div>
                    <div className="text-xs opacity-60 mt-0.5">
                      {new Date(conv.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => deleteConversation(e, conv.id)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                    currentConversationId === conv.id ? 'hover:bg-white/20' : 'hover:bg-brand-bg'
                  }`}
                  aria-label="Delete conversation"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </button>
            ))
          )}
        </div>

        {/* Sidebar Footer - User Info */}
        <div className="p-4 border-t border-brand-border">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.email.split('@')[0] || user.email}</div>
              <div className="text-xs text-brand-muted capitalize">
                {user.tier}
                {user.discordId && ' • Discord linked'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Chat Area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-brand-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-brand-surface transition-colors flex-shrink-0"
              aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-5 w-5 text-brand-primary flex-shrink-0" />
              <h1 className="font-semibold truncate text-sm sm:text-base">
                {currentConversationId
                  ? conversations.find(c => c.id === currentConversationId)?.title || 'Chat'
                  : 'Valor AI Analyst'}
              </h1>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
            {messages.length === 0 ? (
              <div className="text-center py-8 sm:py-16">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-brand-primary/15 mb-4">
                  <Sparkles className="h-8 w-8 text-brand-primary" />
                </div>
                <h2 className="text-lg sm:text-xl font-semibold mb-2">Ask Valor anything</h2>
                <p className="text-brand-muted text-sm mb-6 max-w-md mx-auto px-4">
                  Live odds, injuries, arbitrage opportunities, sharp money moves, and AI-generated best bets — all in real time.
                </p>
                {/* Quick suggestion chips */}
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center max-w-2xl mx-auto px-4">
                  {QUICK_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => { send(s); inputRef.current?.focus(); }}
                      disabled={sending}
                      className="text-left text-xs sm:text-sm px-3 py-2 rounded-xl border border-brand-border bg-brand-surface hover:bg-brand-elevated hover:border-brand-primary/40 transition-colors text-brand-muted hover:text-white disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-3.5 sm:px-4 py-3 ${
                      m.role === 'user'
                        ? 'bg-brand-primary text-white rounded-br-sm'
                        : 'bg-brand-elevated text-brand-text border border-brand-border rounded-bl-sm'
                    }`}
                  >
                    {m.role === 'assistant' ? (
                      <div
                        className="prose-chat prose-invert prose-sm max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(renderMarkdown(m.content || (m.pending ? '…' : ''))),
                        }}
                      />
                    ) : (
                      <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                    )}
                    {m.pending && (
                      <div className="mt-1 inline-block w-2 h-4 bg-brand-primary/60 animate-pulse align-middle" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Input */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-brand-border flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex gap-2"
            >
              <button
                type="button"
                onClick={toggleVoice}
                className={`p-3 rounded-lg transition-colors flex-shrink-0 ${
                  listening ? 'bg-red-500/20 text-red-400' : 'hover:bg-brand-surface text-brand-muted'
                }`}
                title={listening ? 'Stop listening' : 'Voice input'}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <input
                ref={inputRef}
                type="text"
                className="flex-1 input min-w-0"
                placeholder="Message Valor…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
                maxLength={2000}
              />
              <button
                type="submit"
                className="btn-primary px-4 sm:px-5 flex-shrink-0"
                disabled={sending || !input.trim()}
                aria-label="Send message"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
            <p className="text-[10px] text-brand-muted/60 text-center mt-2 hidden sm:block">
              Valor has access to live odds &amp; data. AI can make mistakes — verify before betting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
