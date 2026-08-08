'use client';

import { useState, useEffect, useCallback } from 'react';
import { LifeBuoy, Send, Ticket, MessageSquare, Bot, User, CheckCircle2, AlertCircle, ChevronLeft, RefreshCw } from 'lucide-react';

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
  { value: 'general', label: 'General Question' },
  { value: 'billing', label: 'Billing / Subscription' },
  { value: 'technical', label: 'Technical Issue' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'account', label: 'Account Access' },
  { value: 'other', label: 'Other' },
];

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  ai_resolved: { label: 'AI Resolved', cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  closed: { label: 'Closed', cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
};

const PRIORITY_BADGES: Record<string, { label: string; cls: string }> = {
  urgent: { label: 'Urgent', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  high: { label: 'High', cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  normal: { label: 'Normal', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  low: { label: 'Low', cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-brand-primary" />
            Support
          </h1>
          <p className="text-brand-muted mt-1">
            {aiEnabled
              ? 'AI-powered triage — get instant answers, with human follow-up when needed.'
              : 'Submit a support ticket and our team will get back to you.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTickets} className="btn-ghost" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => { setShowForm(!showForm); setSubmitResult(null); }} className="btn-primary">
            <Ticket className="h-4 w-4" />
            New Ticket
          </button>
        </div>
      </div>

      {/* New ticket form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h2 className="text-lg font-semibold">Create a Support Ticket</h2>
          <div>
            <label className="form-label">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="form-input"
              placeholder="Brief description of your issue"
              maxLength={200}
              required
            />
          </div>
          <div>
            <label className="form-label">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input">
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="form-input min-h-[120px] resize-y"
              placeholder="Describe your issue in detail..."
              maxLength={5000}
              required
            />
            <p className="text-xs text-brand-muted mt-1">{message.length}/5000</p>
          </div>
          {submitResult && (
            <div className={`rounded-lg p-3 text-sm border ${submitResult.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
              <div className="flex items-center gap-2">
                {submitResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {submitResult.msg}
              </div>
              {submitResult.aiResponse && (
                <div className="mt-3 pt-3 border-t border-emerald-500/20">
                  <div className="flex items-center gap-2 text-xs font-semibold mb-1">
                    <Bot className="h-3.5 w-3.5" /> AI Triage Response
                  </div>
                  <p className="text-emerald-200/90 text-sm whitespace-pre-wrap">{submitResult.aiResponse}</p>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting...</>
              ) : (
                <><Send className="h-4 w-4" /> Submit Ticket</>
              )}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      {/* Ticket list */}
      <div className="space-y-3">
        {loading ? (
          <div className="card p-8 text-center text-brand-muted">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="card p-8 text-center">
            <Ticket className="h-12 w-12 mx-auto text-brand-muted mb-3" />
            <p className="text-brand-muted">No support tickets yet.</p>
            <p className="text-brand-muted text-sm mt-1">Click "New Ticket" to create one.</p>
          </div>
        ) : (
          tickets.map((t) => {
            const statusBadge = STATUS_BADGES[t.status] || STATUS_BADGES.open;
            const priorityBadge = PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.normal;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTicket(t.id)}
                className="card-interactive w-full text-left p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{t.subject}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`badge border ${statusBadge.cls}`}>{statusBadge.label}</span>
                    <span className={`badge border ${priorityBadge.cls}`}>{priorityBadge.label}</span>
                    {t.ai_triaged && <span className="badge border bg-indigo-500/10 text-indigo-400 border-indigo-500/20"><Bot className="h-3 w-3 inline mr-1" />AI</span>}
                    {t.escalated && <span className="badge border bg-amber-500/10 text-amber-400 border-amber-500/20">Escalated</span>}
                    <span className="text-xs text-brand-muted">{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <MessageSquare className="h-5 w-5 text-brand-muted shrink-0" />
              </button>
            );
          })
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

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        setReply('');
        fetchDetail();
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="card p-8 text-center text-brand-muted">Loading...</div>;
  if (!ticket) return <div className="card p-8 text-center text-brand-muted">Ticket not found.</div>;

  const statusBadge = STATUS_BADGES[ticket.status] || STATUS_BADGES.open;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="btn-ghost w-fit">
        <ChevronLeft className="h-4 w-4" /> Back to tickets
      </button>

      <div className="card p-5">
        <h1 className="text-xl font-bold">{ticket.subject}</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`badge border ${statusBadge.cls}`}>{statusBadge.label}</span>
          <span className="text-xs text-brand-muted">Created {new Date(ticket.created_at).toLocaleString()}</span>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-border font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Conversation
        </div>
        <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? '' : 'flex-row-reverse'}`}>
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${m.role === 'ai' ? 'bg-indigo-500/20' : m.role === 'admin' ? 'bg-amber-500/20' : 'bg-brand-surface'}`}>
                {m.role === 'ai' ? <Bot className="h-4 w-4 text-indigo-300" /> : m.role === 'admin' ? <User className="h-4 w-4 text-amber-300" /> : <User className="h-4 w-4" />}
              </div>
              <div className={`rounded-lg p-3 max-w-[80%] ${m.role === 'ai' ? 'bg-indigo-500/10 border border-indigo-500/20' : m.role === 'admin' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-brand-surface border border-brand-border'}`}>
                <div className="text-xs font-semibold mb-1 text-brand-muted">
                  {m.role === 'ai' ? 'AI Assistant' : m.role === 'admin' ? 'Support Team' : 'You'}
                  <span className="ml-2 font-normal">{new Date(m.created_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {ticket.status !== 'closed' && (
        <form onSubmit={handleReply} className="card space-y-3">
          <label className="form-label">Add a reply</label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="form-input min-h-[80px] resize-y"
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
