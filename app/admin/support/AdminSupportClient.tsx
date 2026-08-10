'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Headphones, Ticket, Bot, User, Shield, ChevronLeft, Send, RefreshCw,
  CheckCircle2, AlertCircle, Inbox, MessageSquare, Zap,
} from 'lucide-react';
import Link from 'next/link';

interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  ai_triaged: boolean;
  escalated: boolean;
  created_at: string;
  updated_at: string;
  username?: string;
  email?: string;
  message_count?: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface Stats {
  total: number;
  open: number;
  aiResolved: number;
  resolved: number;
  escalated: number;
  aiEnabled: boolean;
}

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

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open / Escalated' },
  { value: 'ai_resolved', label: 'AI Resolved' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function AdminSupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);

  const fetchTickets = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/support/tickets?status=${f}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/support/stats');
      if (res.ok) {
        setStats(await res.json());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchTickets(filter);
    fetchStats();
  }, [filter, fetchTickets, fetchStats]);

  if (selectedTicket) {
    return <AdminTicketDetail ticketId={selectedTicket} onBack={() => { setSelectedTicket(null); fetchTickets(filter); fetchStats(); }} />;
  }

  return (
    <>
      <main className="container-px mx-auto max-w-7xl py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Headphones className="h-7 w-7 text-brand-primary" />
              Support Tickets
            </h1>
            <p className="text-brand-muted mt-1">
              {stats?.aiEnabled
                ? 'AI-first triage dashboard — review AI responses and handle escalations.'
                : 'Manage user support tickets.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { fetchTickets(filter); fetchStats(); }} className="btn-ghost" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link href="/admin" className="btn-secondary">Back to Admin</Link>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard icon={<Inbox className="h-5 w-5" />} label="Total" value={stats.total} color="text-brand-text" />
            <StatCard icon={<AlertCircle className="h-5 w-5" />} label="Open / Escalated" value={stats.escalated} color="text-amber-300" />
            <StatCard icon={<Bot className="h-5 w-5" />} label="AI Resolved" value={stats.aiResolved} color="text-indigo-300" />
            <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Resolved" value={stats.resolved} color="text-emerald-300" />
            <StatCard icon={<Zap className="h-5 w-5" />} label="AI Status" value={stats.aiEnabled ? 'Active' : 'Off'} color={stats.aiEnabled ? 'text-emerald-300' : 'text-zinc-400'} />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f.value ? 'bg-brand-primary text-white' : 'bg-brand-surface text-brand-muted hover:text-brand-text border border-brand-border'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Ticket list */}
        <div className="space-y-3">
          {loading ? (
            <div className="card p-8 text-center text-brand-muted">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="card p-8 text-center">
              <Ticket className="h-12 w-12 mx-auto text-brand-muted mb-3" />
              <p className="text-brand-muted">No tickets in this category.</p>
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
                      <span className="text-xs text-brand-muted">from {t.username || t.email || 'Unknown'}</span>
                      <span className="text-xs text-brand-muted">{new Date(t.created_at).toLocaleDateString()}</span>
                      {t.message_count && <span className="text-xs text-brand-muted">({t.message_count} msgs)</span>}
                    </div>
                  </div>
                  <MessageSquare className="h-5 w-5 text-brand-muted shrink-0" />
                </button>
              );
            })
          )}
        </div>
      </main>
    </>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-brand-muted">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function AdminTicketDetail({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`);
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
      await fetch(`/api/admin/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      });
      setReply('');
      fetchDetail();
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (status: string) => {
    setUpdating(true);
    try {
      await fetch(`/api/admin/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchDetail();
    } catch {
      // ignore
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <main className="container-px mx-auto max-w-5xl py-8"><div className="card p-8 text-center text-brand-muted">Loading...</div></main>;
  if (!ticket) return <main className="container-px mx-auto max-w-5xl py-8"><div className="card p-8 text-center text-brand-muted">Ticket not found.</div></main>;

  const statusBadge = STATUS_BADGES[ticket.status] || STATUS_BADGES.open;
  const priorityBadge = PRIORITY_BADGES[ticket.priority] || PRIORITY_BADGES.normal;

  return (
    <main className="container-px mx-auto max-w-5xl py-8 space-y-4">
      <button onClick={onBack} className="btn-ghost w-fit">
        <ChevronLeft className="h-4 w-4" /> Back to tickets
      </button>

      <div className="card p-5">
        <h1 className="text-xl font-bold">{ticket.subject}</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`badge border ${statusBadge.cls}`}>{statusBadge.label}</span>
          <span className={`badge border ${priorityBadge.cls}`}>{priorityBadge.label}</span>
          <span className="badge border bg-brand-surface text-brand-muted border-brand-border">Category: {ticket.category}</span>
        </div>
        <div className="mt-3 text-sm text-brand-muted space-y-1">
          <div>From: <span className="text-brand-text font-medium">{ticket.username || 'Unknown'}</span> ({ticket.email || 'no email'})</div>
          {ticket.discord_id && <div>Discord ID: {ticket.discord_id}</div>}
          <div>Created: {new Date(ticket.created_at).toLocaleString()}</div>
          {ticket.ai_triaged && (
            <div className="mt-2 pt-2 border-t border-brand-border">
              <span className="text-indigo-300 font-medium">AI Triage:</span> Category={ticket.ai_category}, Priority={ticket.ai_priority}, Confidence={ticket.ai_confidence ? (Number(ticket.ai_confidence) * 100).toFixed(0) + '%' : 'N/A'}
            </div>
          )}
        </div>
      </div>

      {/* Status actions */}
      <div className="card p-4 flex gap-2 flex-wrap items-center">
        <span className="text-sm text-brand-muted mr-2">Update status:</span>
        <button onClick={() => updateStatus('open')} className="btn-ghost text-sm" disabled={updating}>Open</button>
        <button onClick={() => updateStatus('resolved')} className="btn-ghost text-sm" disabled={updating}>Resolve</button>
        <button onClick={() => updateStatus('closed')} className="btn-ghost text-sm" disabled={updating}>Close</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-border font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Conversation Thread
        </div>
        <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? '' : 'flex-row-reverse'}`}>
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${m.role === 'ai' ? 'bg-indigo-500/20' : m.role === 'admin' ? 'bg-amber-500/20' : 'bg-brand-surface'}`}>
                {m.role === 'ai' ? <Bot className="h-4 w-4 text-indigo-300" /> : m.role === 'admin' ? <Shield className="h-4 w-4 text-amber-300" /> : <User className="h-4 w-4" />}
              </div>
              <div className={`rounded-lg p-3 max-w-[80%] ${m.role === 'ai' ? 'bg-indigo-500/10 border border-indigo-500/20' : m.role === 'admin' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-brand-surface border border-brand-border'}`}>
                <div className="text-xs font-semibold mb-1 text-brand-muted">
                  {m.role === 'ai' ? 'AI Assistant' : m.role === 'admin' ? 'Admin' : 'User'}
                  <span className="ml-2 font-normal">{new Date(m.created_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleReply} className="card space-y-3">
        <label className="block text-sm font-medium text-brand-text mb-1.5">Admin reply</label>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          className="input min-h-[90px] resize-y leading-relaxed"
          placeholder="Type your reply to the user..."
          maxLength={5000}
        />
        <div className="flex gap-2">
          <button type="submit" className="btn-primary w-fit" disabled={sending || !reply.trim()}>
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Reply
          </button>
        </div>
      </form>
    </main>
  );
}
