'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { LifeBuoy, Send, Ticket, MessageSquare, Bot, User, CheckCircle2, AlertCircle, ChevronLeft, RefreshCw, Type, Tag, FileText, Sparkles } from 'lucide-react';

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  ai_triaged: boolean;
  escalated: boolean;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

const CATEGORIES = [
  { value: 'general', label: 'General Question', icon: '💬' },
  { value: 'billing', label: 'Billing / Subscription', icon: '💳' },
  { value: 'technical', label: 'Technical Issue', icon: '⚙️' },
  { value: 'bug', label: 'Bug Report', icon: '🐞' },
  { value: 'feature_request', label: 'Feature Request', icon: '✨' },
  { value: 'account', label: 'Account Access', icon: '🔐' },
  { value: 'other', label: 'Other', icon: '📋' },
];

const STATUS_BADGES: Record<string, { label: string; cls: string; dot: string }> = {
  open: { label: 'Open', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
  ai_resolved: { label: 'AI Resolved', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30', dot: 'bg-indigo-400' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  closed: { label: 'Closed', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30', dot: 'bg-zinc-500' },
};

const PRIORITY_BADGES: Record<string, { label: string; cls: string }> = {
  urgent: { label: 'Urgent', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  high: { label: 'High', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  normal: { label: 'Normal', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  low: { label: 'Low', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
};

export default function SupportClient({ user }: { user: { id: string; name: string; email: string; isAdmin: boolean } }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string; aiResponse?: string } | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/support/tickets');
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
        setAiEnabled(data.aiEnabled ?? false);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, category, message }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitResult({
          ok: true,
          msg: 'Ticket created successfully!',
          aiResponse: data.aiResponse || undefined,
        });
        setSubject('');
        setMessage('');
        setCategory('general');
        setShowForm(false);
        fetchTickets();
      } else {
        setSubmitResult({ ok: false, msg: data.error || 'Failed to create ticket' });
      }
    } catch {
      setSubmitResult({ ok: false, msg: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Ticket detail view ----
  if (selectedTicket) {
    return <TicketDetail ticketId={selectedTicket} onBack={() => setSelectedTicket(null)} />;
  }

  const selectedCat = CATEGORIES.find((c) => c.value === category);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-11 h-11 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
            <LifeBuoy className="h-5 w-5 text-brand-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Support</h1>
            <p className="text-brand-muted mt-0.5 text-sm">
              {aiEnabled
                ? 'AI-powered triage — get instant answers, with human follow-up when needed.'
                : 'Submit a support ticket and our team will get back to you.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTickets} className="btn-ghost" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => { setShowForm(!showForm); setSubmitResult(null); }} className="btn-primary">
            <Ticket className="h-4 w-4" />
            {showForm ? 'Close Form' : 'New Ticket'}
          </button>
        </div>
      </div>

      {/* AI status banner */}
      {aiEnabled && (
        <div className="flex items-center gap-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-2.5">
          <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
          <p className="text-sm text-indigo-200/80">
            <span className="font-semibold text-indigo-300">AI triage is active.</span>{' '}
            When you submit a ticket, our AI instantly analyzes your issue and provides a response.
            Complex issues are escalated to our support team.
          </p>
        </div>
      )}

      {/* New ticket form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-brand-border bg-brand-surface overflow-hidden">
          {/* Form header */}
          <div className="px-5 py-4 border-b border-brand-border bg-gradient-to-r from-brand-primary/5 to-transparent">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Ticket className="h-5 w-5 text-brand-primary" />
              Create a Support Ticket
            </h2>
            <p className="text-xs text-brand-muted mt-1">
              Fill out the form below. Our AI will analyze your issue and respond instantly when possible.
            </p>
          </div>

          {/* Form body */}
          <div className="p-5 space-y-5">
            {/* Subject */}
            <div>
              <label htmlFor="subject" className="flex items-center gap-1.5 text-sm font-medium text-brand-text mb-2">
                <Type className="h-3.5 w-3.5 text-brand-muted" />
                Subject
                <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="input pl-4"
                  placeholder="Brief description of your issue"
                  maxLength={200}
                  required
                />
              </div>
              <p className="text-xs text-brand-muted mt-1.5 flex justify-between">
                <span>Keep it short and descriptive</span>
                <span className={subject.length > 180 ? 'text-amber-400' : ''}>{subject.length}/200</span>
              </p>
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="flex items-center gap-1.5 text-sm font-medium text-brand-text mb-2">
                <Tag className="h-3.5 w-3.5 text-brand-muted" />
                Category
              </label>
              <div className="relative">
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input appearance-none pl-10 pr-10 cursor-pointer"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.icon}  {c.label}</option>
                  ))}
                </select>
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                  {selectedCat?.icon}
                </span>
                <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Message */}
            <div>
              <label htmlFor="message" className="flex items-center gap-1.5 text-sm font-medium text-brand-text mb-2">
                <FileText className="h-3.5 w-3.5 text-brand-muted" />
                Message
                <span className="text-red-400">*</span>
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="input min-h-[140px] resize-y leading-relaxed"
                placeholder="Describe your issue in detail. Include any error messages, steps to reproduce, or relevant context..."
                maxLength={5000}
                required
              />
              <p className="text-xs text-brand-muted mt-1.5 flex justify-between">
                <span>The more detail you provide, the faster we can help</span>
                <span className={message.length > 4500 ? 'text-amber-400' : ''}>{message.length}/5000</span>
              </p>
            </div>

            {/* Submit result */}
            {submitResult && (
              <div className={`rounded-xl p-4 text-sm border ${submitResult.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                <div className="flex items-center gap-2 font-medium">
                  {submitResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {submitResult.msg}
                </div>
                {submitResult.aiResponse && (
                  <div className="mt-3 pt-3 border-t border-emerald-500/20">
                    <div className="flex items-center gap-2 text-xs font-semibold mb-2">
                      <Bot className="h-4 w-4 text-indigo-400" />
                      <span className="text-indigo-300">AI Triage Response</span>
                    </div>
                    <p className="text-emerald-200/90 text-sm whitespace-pre-wrap leading-relaxed pl-6">{submitResult.aiResponse}</p>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button type="submit" className="btn-primary" disabled={submitting || !subject.trim() || !message.trim()}>
                {submitting ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting...</>
                ) : (
                  <><Send className="h-4 w-4" /> Submit Ticket</>
                )}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Ticket list */}
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center">
            <RefreshCw className="h-6 w-6 mx-auto text-brand-muted animate-spin mb-2" />
            <p className="text-brand-muted text-sm">Loading tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-xl border border-brand-border bg-brand-surface p-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-elevated border border-brand-border flex items-center justify-center mb-4">
              <Ticket className="h-7 w-7 text-brand-muted" />
            </div>
            <p className="text-brand-text font-medium">No support tickets yet</p>
            <p className="text-brand-muted text-sm mt-1">Click "New Ticket" to create one and get instant AI-powered help.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tickets.map((t) => {
              const statusBadge = STATUS_BADGES[t.status] || STATUS_BADGES.open;
              const priorityBadge = PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.normal;
              const cat = CATEGORIES.find((c) => c.value === t.category);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTicket(t.id)}
                  className="card-interactive w-full text-left p-4 flex items-center justify-between gap-4 group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate group-hover:text-brand-primary transition-colors">{t.subject}</div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${statusBadge.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
                        {statusBadge.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${priorityBadge.cls}`}>
                        {priorityBadge.label}
                      </span>
                      {cat && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border border-brand-border text-brand-muted">
                          {cat.icon} {cat.label}
                        </span>
                      )}
                      {t.ai_triaged && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                          <Bot className="h-3 w-3" /> AI
                        </span>
                      )}
                      {t.escalated && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20">
                          Escalated
                        </span>
                      )}
                      <span className="text-xs text-brand-muted ml-auto">{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <MessageSquare className="h-5 w-5 text-brand-muted shrink-0 group-hover:text-brand-primary transition-colors" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Ticket detail with conversation thread ----
function TicketDetail({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`);
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
        setMessages(data.messages || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Auto-scroll to the latest message whenever messages change.
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, aiTyping]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setAiTyping(true);
    // Optimistically show the user's message immediately.
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: reply,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const sentReply = reply;
    setReply('');
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: sentReply }),
      });
      if (res.ok) {
        const data = await res.json();
        // The route returns the full updated message list (incl. the AI reply),
        // so we can render it immediately without a second fetch.
        if (data.messages) {
          setMessages(data.messages);
        }
        if (data.escalated && ticket) {
          setTicket({ ...ticket, status: 'open', escalated: true });
        }
      }
    } catch {
      // ignore — the optimistic message remains; user can retry
    } finally {
      setSending(false);
      setAiTyping(false);
    }
  };

  if (loading) return <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">Loading...</div>;
  if (!ticket) return <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">Ticket not found.</div>;

  const statusBadge = STATUS_BADGES[ticket.status] || STATUS_BADGES.open;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="btn-ghost w-fit">
        <ChevronLeft className="h-4 w-4" /> Back to tickets
      </button>

      <div className="rounded-xl border border-brand-border bg-brand-surface p-5">
        <h1 className="text-xl font-bold">{ticket.subject}</h1>
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${statusBadge.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
            {statusBadge.label}
          </span>
          <span className="text-xs text-brand-muted">Created {new Date(ticket.created_at).toLocaleString()}</span>
        </div>
      </div>

      <div className="rounded-xl border border-brand-border bg-brand-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-border font-semibold flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4 text-brand-primary" /> Conversation
        </div>
        <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? '' : 'flex-row-reverse'}`}>
              <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${m.role === 'ai' ? 'bg-indigo-500/20' : m.role === 'admin' ? 'bg-amber-500/20' : 'bg-brand-elevated border border-brand-border'}`}>
                {m.role === 'ai' ? <Bot className="h-4 w-4 text-indigo-300" /> : m.role === 'admin' ? <User className="h-4 w-4 text-amber-300" /> : <User className="h-4 w-4 text-brand-muted" />}
              </div>
              <div className={`rounded-xl p-3.5 max-w-[80%] ${m.role === 'ai' ? 'bg-indigo-500/10 border border-indigo-500/20' : m.role === 'admin' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-brand-elevated border border-brand-border'}`}>
                <div className="text-xs font-semibold mb-1 text-brand-muted flex items-center gap-2">
                  {m.role === 'ai' ? 'AI Assistant' : m.role === 'admin' ? 'Support Team' : 'You'}
                  <span className="font-normal text-brand-muted/70">{new Date(m.created_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            </div>
          ))}
          {aiTyping && (
            <div className="flex gap-3 flex-row-reverse">
              <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-indigo-500/20">
                <Bot className="h-4 w-4 text-indigo-300" />
              </div>
              <div className="rounded-xl p-3.5 bg-indigo-500/10 border border-indigo-500/20">
                <div className="text-xs font-semibold mb-1 text-brand-muted flex items-center gap-2">
                  AI Assistant
                  <span className="font-normal text-brand-muted/70">typing…</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {ticket.status !== 'closed' && (
        <form onSubmit={handleReply} className="rounded-xl border border-brand-border bg-brand-surface p-5 space-y-3">
          <label htmlFor="reply" className="flex items-center gap-1.5 text-sm font-medium text-brand-text">
            <MessageSquare className="h-3.5 w-3.5 text-brand-muted" />
            Add a reply
          </label>
          <textarea
            id="reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="input min-h-[90px] resize-y leading-relaxed"
            placeholder="Type your reply..."
            maxLength={5000}
          />
          <button type="submit" className="btn-primary w-fit" disabled={sending || !reply.trim()}>
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Reply
          </button>
        </form>
      )}
    </div>
  );
}
