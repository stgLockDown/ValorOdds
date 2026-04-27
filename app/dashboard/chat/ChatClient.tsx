'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Mic, MicOff, Download } from 'lucide-react';
import type { Tier } from '@/lib/env';

type Msg = { role: 'user' | 'assistant'; content: string; pending?: boolean };

// Dynamically loaded from CDN to keep client bundle slim.
declare global {
  interface Window {
    marked?: { parse: (s: string) => string };
    DOMPurify?: { sanitize: (s: string, o?: any) => string };
  }
}

function renderMarkdown(src: string): string {
  if (typeof window === 'undefined' || !window.marked || !window.DOMPurify) {
    return escapeHtml(src).replace(/\n/g, '<br>');
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
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content: `Hey! I'm your Valor Odds AI assistant. Ask me anything about sports betting, odds, arbitrage, or player props. I can also analyze specific games — try *"analyze Chiefs vs Bills tonight"*.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
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

  async function send() {
    const q = input.trim();
    if (!q || sending) return;
    setInput('');
    setSending(true);

    // Build history from non-pending messages for context
    const history = messages
      .filter((m) => !m.pending)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '', pending: true }]);

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

      // eslint-disable-next-line no-constant-condition
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

              // OpenAI / GitHub Models native streaming format
              const token = payload?.choices?.[0]?.delta?.content;
              if (typeof token === 'string' && token) {
                accumulated += token;
                setMessages((m) => {
                  const copy = [...m];
                  copy[copy.length - 1] = { role: 'assistant', content: accumulated, pending: true };
                  return copy;
                });
              }

              // Graceful error/info message passed as plain {content} field
              if (typeof payload?.content === 'string' && !payload?.choices) {
                accumulated += payload.content;
                setMessages((m) => {
                  const copy = [...m];
                  copy[copy.length - 1] = { role: 'assistant', content: accumulated };
                  return copy;
                });
              }
            } catch {
              // non-JSON line, skip
            }
          }
        }
      }

      // Ensure pending state is cleared even if [DONE] wasn't received
      setMessages((m) => {
        const copy = [...m];
        if (copy[copy.length - 1]?.pending) {
          copy[copy.length - 1] = { role: 'assistant', content: accumulated || '…' };
        }
        return copy;
      });

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

  function exportHistory(format: 'json' | 'csv') {
    window.open(`/api/chat/export?format=${format}`, '_blank');
    setExportMenu(false);
  }

  return (
    <>
      <div className="flex items-center justify-between px-5 py-3 border-b border-brand-border">
        <div>
          <h1 className="font-bold">AI Chat</h1>
          <div className="text-xs text-brand-muted">
            Tier: <span className="badge-primary ml-1">{user.tier.toUpperCase()}</span>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setExportMenu((v) => !v)} className="btn-ghost">
            <Download className="h-4 w-4" /> Export
          </button>
          {exportMenu && (
            <div className="absolute right-0 mt-2 w-40 card p-1 z-10">
              <button onClick={() => exportHistory('json')} className="btn-ghost w-full justify-start">
                As JSON
              </button>
              <button onClick={() => exportHistory('csv')} className="btn-ghost w-full justify-start">
                As CSV
              </button>
            </div>
          )}
        </div>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-brand-primary text-white px-4 py-2.5'
                  : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-brand-elevated border border-brand-border px-4 py-2.5'
              }
            >
              {m.role === 'assistant' ? (
                <div
                  className="prose-chat"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content || (m.pending ? '…' : '')) }}
                />
              ) : (
                <div className="text-sm whitespace-pre-wrap">{m.content}</div>
              )}
              {m.pending && (
                <div className="mt-1 inline-block w-2 h-4 bg-brand-primary/60 animate-pulse align-middle" />
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="border-t border-brand-border p-3 flex gap-2"
      >
        <button
          type="button"
          onClick={toggleVoice}
          className={listening ? 'btn-danger' : 'btn-ghost'}
          title={listening ? 'Stop listening' : 'Voice input'}
          aria-label="Voice input"
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <input
          type="text"
          className="input"
          placeholder="Ask the AI anything about betting, odds, or player props…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          maxLength={2000}
        />
        <button type="submit" className="btn-primary" disabled={sending || !input.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </>
  );
}