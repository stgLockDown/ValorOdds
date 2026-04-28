'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Mic, MicOff, Plus, MessageSquare, Trash2, Menu, X } from 'lucide-react';
import type { Tier } from '@/lib/env';

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
    .replace(/"/g, '"').replace(/'/g, '&#39;');
}

export default function ChatClient({
  user,
}: {
  user: { id: string; email: string; tier: Tier; discordId: string | null };
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(true);
  
  const scrollerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

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

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversationId) {
      loadMessages(currentConversationId);
    }
  }, [currentConversationId]);

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

  async function saveConversation() {
    if (!currentConversationId) return;
    
    try {
      await fetch(`/api/chat/conversations/${currentConversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      loadConversations();
    } catch (err) {
      console.error('Failed to save conversation:', err);
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

  async function send() {
    const q = input.trim();
    if (!q || sending) return;
    setInput('');
    setSending(true);

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

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-brand-bg">
      {/* Sidebar - Chat History */}
      <div className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 flex-shrink-0 flex flex-col bg-brand-elevated border-r border-brand-border`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-brand-border">
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-border bg-brand-bg hover:bg-brand-surface transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm">New chat</span>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingConversations ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-muted" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-brand-muted text-sm">
              No conversations yet
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
                <div className="truncate text-sm font-medium">{conv.title}</div>
                <div className="text-xs opacity-60 mt-1">
                  {new Date(conv.updated_at).toLocaleDateString()}
                </div>
                <button
                  onClick={(e) => deleteConversation(e, conv.id)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                    currentConversationId === conv.id ? 'hover:bg-white/20' : 'hover:bg-brand-bg'
                  }`}
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
            <div className="flex-1">
              <div className="text-sm font-medium truncate">{user.email.split("@" )[0] || user.email}</div>
              <div className="text-xs text-brand-muted.capitalize">
                {user.tier}
                {user.discordId && ' • Discord linked'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-brand-surface transition-colors"
            >
              {sidebarOpen ? <Menu className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <h1 className="font-semibold">
              {currentConversationId
                ? conversations.find(c => c.id === currentConversationId)?.title || 'Chat'
                : 'AI Chat'}
            </h1>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.length === 0 ? (
              <div className="text-center py-20">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 text-brand-muted opacity-30" />
                <h2 className="text-xl font-semibold mb-2">Ask me anything</h2>
                <p className="text-brand-muted">
                  About sports betting, odds analysis, player props, or upcoming games
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      m.role === 'user'
                        ? 'bg-brand-primary text-white rounded-br-sm'
                        : 'bg-brand-elevated text-brand-text border border-brand-border rounded-bl-sm'
                    }`}
                  >
                    {m.role === 'assistant' ? (
                      <div
                        className="prose-chat prose-invert prose-sm max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(m.content || (m.pending ? '…' : '')),
                        }}
                      />
                    ) : (
                      <div className="text-sm whitespace-pre-wrap">{m.content}</div>
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
        <div className="px-6 py-4 border-t border-brand-border">
          <div className="max-w-4xl mx-auto">
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
                className={`p-3 rounded-lg transition-colors ${
                  listening ? 'bg-red-500/20 text-red-400' : 'hover:bg-brand-surface text-brand-muted'
                }`}
                title={listening ? 'Stop listening' : 'Voice input'}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <input
                type="text"
                className="flex-1 input"
                placeholder="Message AI assistant..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
                maxLength={2000}
              />
              <button
                type="submit"
                className="btn-primary px-5"
                disabled={sending || !input.trim()}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}