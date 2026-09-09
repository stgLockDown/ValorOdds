'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Sparkles, RefreshCw, XCircle, Pencil, Trash2, Send,
  Megaphone, ListChecks, Save, CheckCircle2, ExternalLink, ChevronDown,
} from 'lucide-react';

// ---------- types (mirror lib/marketing-studio) ----------

interface Variant {
  id: string;
  label: string;
  channel: string;
  body: string;
  model?: string | null;
}

interface PostedVariant {
  variantId: string;
  channelId: string;
  messageId: string;
  messageUrl?: string;
  at: string;
}

interface MPost {
  id: string;
  briefTopic: string;
  audience: string;
  tone: string;
  extraNotes: string | null;
  focusSports: string[];
  variants: Variant[];
  generatorModel: string | null;
  status: string;
  reviewNotes: string | null;
  postedVariants: PostedVariant[];
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Channel {
  key: string;
  label: string;
  desc: string;
  channelId: string;
}

type Tab = 'create' | 'queue' | 'edit';
type Flash = (kind: 'ok' | 'err', text: string) => void;

const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'SOCCER'];
const AUDIENCES = ['casual', 'sharp', 'mixed'] as const;
const TONES = ['hype', 'analytical', 'playful', 'urgent'] as const;

// ---------- small helpers ----------

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'posted': return 'bg-green-500/10 text-green-400';
    case 'approved': return 'bg-blue-500/10 text-blue-400';
    case 'rejected': return 'bg-red-500/10 text-red-400';
    default: return 'bg-brand-surface text-brand-muted'; // draft
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
      {status}
    </span>
  );
}

function MiniBtn({
  title, onClick, disabled, children, danger,
}: {
  title: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
          : 'border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10'
      }`}
    >
      {children}
    </button>
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

// ---------- main ----------

export default function MarketingStudioClient() {
  const [tab, setTab] = useState<Tab>('create');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [queueVersion, setQueueVersion] = useState(0);
  const [editing, setEditing] = useState<MPost | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [botReachable, setBotReachable] = useState(true);

  const flash: Flash = useCallback((kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const bumpQueue = useCallback(() => setQueueVersion((v) => v + 1), []);

  // Load posting channels once (degrades silently if the bot is down).
  useEffect(() => {
    api<{ channels: Channel[]; botReachable: boolean }>('/api/admin/marketing/channels')
      .then((r) => {
        setChannels(r.channels);
        setBotReachable(r.botReachable);
        if (!r.botReachable) flash('err', 'Discord bot unreachable — generation works, posting is disabled until it responds.');
      })
      .catch(() => setBotReachable(false));
  }, [flash]);

  const openEditor = useCallback((p: MPost) => {
    setEditing(p);
    setTab('edit');
  }, []);

  const tabs = useMemo(
    () => ([
      { id: 'create', label: 'Create', icon: Sparkles },
      { id: 'queue', label: 'Campaigns', icon: ListChecks },
      ...(editing ? [{ id: 'edit', label: 'Edit', icon: Pencil }] : []),
    ] as Array<{ id: Tab; label: string; icon: typeof Sparkles }>),
    [editing]
  );

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <div className="mx-auto max-w-6xl px-4 py-10">
        {/* header */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Megaphone className="h-8 w-8 text-brand-primary" />
          <div>
            <h1 className="text-2xl font-bold">Marketing Studio</h1>
            <p className="text-sm text-brand-muted">
              Turn a brief into channel-ready posts, grounded in live platform data — review, approve, ship to Discord.
            </p>
          </div>
        </div>

        {/* toast */}
        {toast && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
              toast.kind === 'ok'
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}
          >
            {toast.text}
          </div>
        )}

        {/* tabs */}
        <div className="mb-6 flex gap-2 border-b border-brand-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-brand-muted hover:text-brand-text'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'create' && <CreateTab flash={flash} onCreated={openEditor} botReachable={botReachable} />}
        {tab === 'queue' && <QueueTab flash={flash} version={queueVersion} onOpen={openEditor} channels={channels} onPosted={bumpQueue} />}
        {tab === 'edit' && editing && (
          <EditTab post={editing} flash={flash} onSaved={(p) => { setEditing(p); bumpQueue(); }} onClose={() => setTab('queue')} />
        )}
      </div>
    </div>
  );
}

// ---------- Create tab ----------

function CreateTab({ flash, onCreated, botReachable }: { flash: Flash; onCreated: (p: MPost) => void; botReachable: boolean }) {
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>('mixed');
  const [tone, setTone] = useState<(typeof TONES)[number]>('hype');
  const [notes, setNotes] = useState('');
  const [focus, setFocus] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggleSport = (s: string) =>
    setFocus((f) => (f.includes(s) ? f.filter((x) => x !== s) : f.length >= 4 ? f : [...f, s]));

  const submit = async () => {
    if (!topic.trim()) return flash('err', 'Give the brief a topic first.');
    setBusy(true);
    try {
      const r = await api<{ post: MPost }>('/api/admin/marketing', {
        method: 'POST',
        body: JSON.stringify({ topic, audience, tone, notes: notes || undefined, focusSports: focus }),
      });
      flash('ok', 'Campaign generated — review the variants.');
      onCreated(r.post);
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-lg font-semibold">Today&apos;s brief</h2>
      <p className="mb-5 text-sm text-brand-muted">
        The generator pulls live arbitrage opportunities, upcoming games, ESPN news and published articles, then writes
        three variants: a Discord announcement, a Discord bettor post, and an X post.
      </p>

      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">Topic</label>
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        maxLength={200}
        placeholder="e.g. Promote tonight's NFL arbitrage board"
        className="mb-4 w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">Audience</label>
          <div className="flex gap-2">
            {AUDIENCES.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAudience(a)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize ${
                  audience === a ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-brand-border text-brand-muted'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">Tone</label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize ${
                  tone === t ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-brand-border text-brand-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">
        Focus sports <span className="normal-case text-brand-muted/60">(optional, max 4 — empty = all)</span>
      </label>
      <div className="mb-4 flex flex-wrap gap-2">
        {SPORTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleSport(s)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              focus.includes(s) ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-brand-border text-brand-muted'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">Extra guidance (optional)</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={600}
        rows={3}
        placeholder="Anything else the copywriter should know — e.g. mention the new /games hub, keep it under 2 sentences for the X post…"
        className="mb-5 w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-bold text-brand-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? 'Generating…' : 'Generate campaign'}
        </button>
        <span className="text-xs text-brand-muted">
          {botReachable ? 'AI generation + Discord posting ready' : 'AI generation ready · Discord posting offline'}
        </span>
      </div>
    </div>
  );
}

// ---------- Queue tab ----------

function QueueTab({
  flash, version, onOpen, channels, onPosted,
}: {
  flash: Flash; version: number; onOpen: (p: MPost) => void; channels: Channel[]; onPosted: () => void;
}) {
  const [posts, setPosts] = useState<MPost[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shipFor, setShipFor] = useState<MPost | null>(null);

  const load = useCallback(() => {
    api<{ posts: MPost[] }>('/api/admin/marketing')
      .then((r) => setPosts(r.posts))
      .catch((e) => flash('err', e.message));
  }, [flash]);

  useEffect(() => { load(); }, [load, version]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try { await fn(); } finally { setBusyId(null); }
  };

  const approve = (p: MPost) =>
    act(p.id, async () => {
      try {
        await api(`/api/admin/marketing/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) });
        flash('ok', 'Approved — ready to ship.');
        load(); onPosted();
      } catch (e) { flash('err', e instanceof Error ? e.message : 'Failed'); }
    });

  const reject = (p: MPost) =>
    act(p.id, async () => {
      try {
        await api(`/api/admin/marketing/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) });
        flash('ok', 'Rejected.');
        load();
      } catch (e) { flash('err', e instanceof Error ? e.message : 'Failed'); }
    });

  const del = (p: MPost) =>
    act(p.id, async () => {
      try {
        await api(`/api/admin/marketing/${p.id}`, { method: 'DELETE' });
        flash('ok', 'Deleted.');
        load();
      } catch (e) { flash('err', e instanceof Error ? e.message : 'Failed'); }
    });

  if (!posts) {
    return <div className="flex justify-center py-12 text-brand-muted"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {shipFor && (
        <ShipPanel
          post={shipFor}
          channels={channels}
          flash={flash}
          onDone={() => { setShipFor(null); load(); onPosted(); }}
          onCancel={() => setShipFor(null)}
        />
      )}

      {posts.length === 0 && (
        <div className="card p-8 text-center text-sm text-brand-muted">
          No campaigns yet — write today&apos;s brief in the Create tab.
        </div>
      )}

      {posts.map((p) => (
        <div key={p.id} className="card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            <span className="font-semibold">{p.briefTopic}</span>
            <span className="text-xs text-brand-muted">
              {p.audience} · {p.tone}{p.focusSports.length ? ` · ${p.focusSports.join('/')}` : ''} · by {p.createdByName ?? 'admin'} ·{' '}
              {new Date(p.createdAt).toLocaleString()}
            </span>
          </div>

          {/* variant previews */}
          <div className="mb-3 grid gap-2">
            {p.variants.map((v) => (
              <div key={v.id} className="rounded-lg border border-brand-border bg-brand-surface/50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">{v.label}</span>
                  <span className="text-[11px] text-brand-muted/70">{v.body.length} chars{v.channel === 'x' ? ' / 280 target' : ''}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-brand-text/90">{v.body}</p>
              </div>
            ))}
          </div>

          {/* delivery receipts */}
          {p.postedVariants.length > 0 && (
            <div className="mb-3 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-green-400">Delivered</div>
              {p.postedVariants.map((pv, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-brand-muted">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  {pv.variantId} → {pv.channelId}
                  {pv.messageUrl && (
                    <a href={pv.messageUrl} target="_blank" rel="noreferrer" className="text-brand-primary hover:underline">
                      view on Discord <ExternalLink className="inline h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(p.status === 'draft' || p.status === 'approved') && (
              <MiniBtn title="Edit variants" onClick={() => onOpen(p)} disabled={busyId === p.id}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </MiniBtn>
            )}
            {p.status === 'draft' && (
              <MiniBtn title="Approve for posting" onClick={() => approve(p)} disabled={busyId === p.id}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </MiniBtn>
            )}
            {p.status === 'approved' && (
              <MiniBtn title="Ship to Discord" onClick={() => setShipFor(p)} disabled={busyId === p.id}>
                <Send className="h-3.5 w-3.5" /> Ship to Discord
              </MiniBtn>
            )}
            {(p.status === 'draft' || p.status === 'approved') && (
              <MiniBtn title="Reject" onClick={() => reject(p)} disabled={busyId === p.id} danger>
                <XCircle className="h-3.5 w-3.5" /> Reject
              </MiniBtn>
            )}
            <MiniBtn title="Delete" onClick={() => del(p)} disabled={busyId === p.id} danger>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </MiniBtn>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Ship panel (choose variant + channel) ----------

function ShipPanel({
  post, channels, flash, onDone, onCancel,
}: {
  post: MPost; channels: Channel[]; flash: Flash; onDone: () => void; onCancel: () => void;
}) {
  const [variantId, setVariantId] = useState(post.variants[0]?.id ?? '');
  const [channelId, setChannelId] = useState(channels[0]?.channelId ?? '');
  const [busy, setBusy] = useState(false);

  const ship = async () => {
    if (!variantId || !channelId) return flash('err', 'Pick a variant and a channel.');
    setBusy(true);
    try {
      const r = await api<{ receipt: { messageUrl?: string } }>(`/api/admin/marketing/${post.id}/post`, {
        method: 'POST',
        body: JSON.stringify({ variantId, channelId }),
      });
      flash('ok', r.receipt?.messageUrl ? `Posted — ${r.receipt.messageUrl}` : 'Posted to Discord.');
      onDone();
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Delivery failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mb-2 border-brand-primary/40 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Send className="h-5 w-5 text-brand-primary" />
        <h3 className="font-semibold">Ship to Discord — {post.briefTopic}</h3>
      </div>
      {channels.length === 0 ? (
        <p className="text-sm text-brand-muted">
          No posting channels available — the Discord bot is unreachable or has none configured. Generation and approval
          still work; shipping will be possible once the bot responds.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">Variant</label>
            <div className="space-y-1.5">
              {post.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    variantId === v.id ? 'border-brand-primary bg-brand-primary/10' : 'border-brand-border'
                  }`}
                >
                  <span className="font-semibold">{v.label}</span>
                  {v.channel === 'x' && <span className="ml-2 text-[11px] text-brand-muted">(not Discord — copy it manually)</span>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">Channel</label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
            >
              {channels.map((c) => (
                <option key={c.channelId} value={c.channelId}>
                  {c.label} — {c.desc}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-brand-muted">
              Only channels the bot allowlists appear here. Marketing posts never ping roles or users.
            </p>
          </div>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={ship}
          disabled={busy || channels.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-bold text-brand-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? 'Shipping…' : 'Post now'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-brand-border px-4 py-2.5 text-sm font-semibold text-brand-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------- Edit tab ----------

function EditTab({
  post, flash, onSaved, onClose,
}: {
  post: MPost; flash: Flash; onSaved: (p: MPost) => void; onClose: () => void;
}) {
  const [bodies, setBodies] = useState<Record<string, string>>(
    () => Object.fromEntries(post.variants.map((v) => [v.id, v.body]))
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const variants = post.variants.map((v) => ({ ...v, body: bodies[v.id] ?? v.body }));
      const r = await api<{ post: MPost }>(`/api/admin/marketing/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ variants }),
      });
      flash('ok', 'Variants saved.');
      onSaved(r.post);
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Editing — {post.briefTopic}</h2>
          <p className="text-xs text-brand-muted">
            Status: {post.status} · generated by {post.generatorModel ?? 'unknown model'}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-brand-border px-3 py-1.5 text-sm text-brand-muted">
          Back to campaigns
        </button>
      </div>

      {post.status === 'posted' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          This campaign has been posted — editing is locked to keep the record honest. Create a new campaign instead.
        </div>
      )}

      {post.status !== 'posted' && post.variants.map((v) => (
        <div key={v.id} className="card p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">{v.label}</span>
            <span className={`text-[11px] ${(bodies[v.id] ?? '').length > (v.channel === 'x' ? 280 : 3800) ? 'text-red-400' : 'text-brand-muted'}`}>
              {(bodies[v.id] ?? '').length} chars
            </span>
          </div>
          <textarea
            value={bodies[v.id] ?? ''}
            onChange={(e) => setBodies((b) => ({ ...b, [v.id]: e.target.value }))}
            rows={5}
            maxLength={3800}
            className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
          />
        </div>
      ))}

      {post.status !== 'posted' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-bold text-brand-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save variants
          </button>
        </div>
      )}
    </div>
  );
}
