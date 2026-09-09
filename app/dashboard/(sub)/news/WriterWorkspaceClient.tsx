'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Save, Send, Pencil, Trash2, Plus, ExternalLink, Eye, XCircle,
} from 'lucide-react';

// ---------- Types ----------

interface Article {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  body_md: string;
  cover_image_url: string | null;
  image_credit: string | null;
  sport: string | null;
  subject_type: string | null;
  subject_name: string | null;
  tags: string[];
  status: string;
  byline: string;
  is_ai_generated: boolean;
  review_notes: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
}

type Flash = (kind: 'ok' | 'err', text: string) => void;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'published': return 'bg-green-500/10 text-green-400';
    case 'in_review': return 'bg-amber-500/10 text-amber-400';
    case 'pending_review': return 'bg-purple-500/10 text-purple-400';
    case 'rejected': return 'bg-red-500/10 text-red-400';
    default: return 'bg-brand-surface text-brand-muted';
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

/** Editor form state — all strings; nulls only materialize on save. */
interface DraftState {
  title: string;
  subtitle: string;
  body_md: string;
  cover_image_url: string;
  image_credit: string;
  sport: string;
  subject_name: string;
  tags: string[];
}

const EMPTY_DRAFT: DraftState = {
  title: '',
  subtitle: '',
  body_md: '',
  cover_image_url: '',
  image_credit: '',
  sport: '',
  subject_name: '',
  tags: [],
};

// ---------- Main ----------

export default function WriterWorkspaceClient() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newDraftOpen, setNewDraftOpen] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<string>('draft');
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/writer/articles');
      const data = await r.json();
      if (r.ok) setArticles(data.articles ?? []);
      else flash('err', `Could not load your articles: ${data?.error ?? r.status}`);
    } catch (e) {
      flash('err', `Could not load your articles: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    load();
  }, [load]);

  function openNewDraft() {
    setEditingId(null);
    setEditingStatus('draft');
    setDraft({ ...EMPTY_DRAFT });
    setMode('write');
    setNewDraftOpen(true);
  }

  function openEdit(a: Article) {
    setEditingId(a.id);
    setEditingStatus(a.status);
    setDraft({
      title: a.title,
      subtitle: a.subtitle ?? '',
      body_md: a.body_md,
      cover_image_url: a.cover_image_url ?? '',
      image_credit: a.image_credit ?? '',
      sport: a.sport ?? '',
      subject_name: a.subject_name ?? '',
      tags: a.tags,
    });
    setMode('write');
    setNewDraftOpen(true);
  }

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /** Create or update the draft, then optionally transition status. */
  async function save(submit: boolean) {
    if (!draft.title.trim() || !draft.body_md.trim()) {
      flash('err', 'A title and body are required before saving.');
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim() || null,
        body_md: draft.body_md,
        cover_image_url: draft.cover_image_url.trim() || null,
        image_credit: draft.image_credit.trim() || null,
        sport: draft.sport.trim() || null,
        subject_name: draft.subject_name.trim() || null,
        tags: draft.tags,
      };
      if (submit) payload.status = 'in_review';

      let r: Response;
      if (editingId) {
        r = await fetch(`/api/writer/articles/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        r = await fetch('/api/writer/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      const data = await r.json();
      if (r.ok) {
        flash('ok', submit ? 'Submitted for review — the editorial team will take a look.' : 'Draft saved.');
        setNewDraftOpen(false);
        load();
      } else {
        flash('err', `Save failed: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/writer/articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      });
      const data = await r.json();
      if (r.ok) {
        flash('ok', 'Withdrawn — back to draft.');
        load();
      } else {
        flash('err', `Withdraw failed: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Withdraw failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this article permanently?')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/writer/articles/${id}`, { method: 'DELETE' });
      if (r.ok) {
        flash('ok', 'Deleted.');
        if (editingId === id) setNewDraftOpen(false);
        load();
      } else {
        const data = await r.json().catch(() => ({}));
        flash('err', `Delete failed: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'input mt-1 w-full';
  const labelCls = 'text-xs font-semibold uppercase tracking-wide text-brand-muted';

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Articles</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Draft articles for ValorOdds. When you submit, the editorial team reviews before publishing.
          </p>
        </div>
        <button onClick={openNewDraft} className="btn-primary inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> New draft
        </button>
      </div>

      {toast && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            toast.kind === 'ok'
              ? 'border-green-500/30 bg-green-500/10 text-green-400'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {toast.text}
        </div>
      )}

      {newDraftOpen && (
        <section className="mt-6 rounded-xl border border-brand-border bg-brand-elevated/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              {editingId ? 'Edit article' : 'New article'}
            </h2>
            <button
              onClick={() => setNewDraftOpen(false)}
              className="text-sm text-brand-muted hover:text-brand-heading"
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Title</label>
              <input value={draft.title} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder="Your headline" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Subtitle</label>
              <input value={draft.subtitle} onChange={(e) => set('subtitle', e.target.value)} className={inputCls} placeholder="One-line teaser (optional)" />
            </div>
            <div>
              <label className={labelCls}>Sport (optional)</label>
              <input value={draft.sport} onChange={(e) => set('sport', e.target.value)} className={inputCls} placeholder="nfl, nba, mlb…" />
            </div>
            <div>
              <label className={labelCls}>Subject (optional)</label>
              <input value={draft.subject_name} onChange={(e) => set('subject_name', e.target.value)} className={inputCls} placeholder="Player or team name" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Cover image URL (optional)</label>
              <input value={draft.cover_image_url} onChange={(e) => set('cover_image_url', e.target.value)} className={inputCls} placeholder="https://…" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>
                Tags (comma separated, optional)
              </label>
              <input
                value={draft.tags.join(', ')}
                onChange={(e) => set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
                className={inputCls}
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label className={labelCls}>Body (markdown)</label>
              <div className="flex gap-2">
                <button onClick={() => setMode('write')} className={mode === 'write' ? 'btn-secondary' : 'text-sm text-brand-muted'}>
                  Write
                </button>
                <button onClick={() => setMode('preview')} className={mode === 'preview' ? 'btn-secondary' : 'text-sm text-brand-muted'}>
                  Preview
                </button>
              </div>
            </div>
            {mode === 'write' ? (
              <textarea
                value={draft.body_md}
                onChange={(e) => set('body_md', e.target.value)}
                rows={14}
                className="input mt-1 w-full font-mono text-sm"
                placeholder={'## Section heading\n\nWrite your article in markdown. Use ## for section headings and [links](https://…) for sources.'}
              />
            ) : (
              <div className="mt-1 min-h-[260px] rounded-lg border border-brand-border bg-brand-elevated/40 p-4 text-sm">
                {draft.body_md.split('\n').map((line, i) => {
                  if (line.startsWith('## ')) return <h2 key={i} className="mt-4 text-lg font-bold text-brand-heading">{line.slice(3)}</h2>;
                  if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="mt-2 font-semibold">{line.slice(2, -2)}</p>;
                  return <p key={i} className="mt-2 text-brand-muted">{line}</p>;
                })}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={() => save(false)} disabled={busy} className="btn-secondary inline-flex items-center gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
            </button>
            <button onClick={() => save(true)} disabled={busy} className="btn-primary inline-flex items-center gap-2">
              <Send className="h-4 w-4" /> Submit for review
            </button>
            {editingId && editingStatus === 'in_review' && (
              <button onClick={() => withdraw(editingId)} disabled={busy} className="btn-secondary inline-flex items-center gap-2">
                Withdraw submission
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-brand-muted">
            Drafts are private to you and the editorial team. Submissions are reviewed before they go live.
          </p>
        </section>
      )}

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-brand-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your articles…
        </p>
      ) : articles.length === 0 && !newDraftOpen ? (
        <div className="mt-6 rounded-xl border border-brand-border bg-brand-elevated/30 p-8 text-center">
          <p className="text-sm text-brand-muted">No articles yet. Hit &ldquo;New draft&rdquo; to write your first piece.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-brand-border text-left text-xs uppercase tracking-wide text-brand-muted">
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Updated</th>
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-b border-brand-border/60">
                  <td className="max-w-[280px] px-2 py-3">
                    <div className="truncate font-medium text-brand-heading">{a.title}</div>
                    {a.review_notes && a.status === 'rejected' && (
                      <div className="mt-0.5 text-[11px] text-red-400/80">Editor note: {a.review_notes}</div>
                    )}
                  </td>
                  <td className="px-2 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-2 py-3 text-xs text-brand-muted">{new Date(a.updated_at).toLocaleDateString()}</td>
                  <td className="px-2 py-3">
                    <div className="flex justify-end gap-1">
                      {a.status === 'published' ? (
                        <a
                          href={`/news/${a.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View live"
                          className="rounded-lg border border-brand-border bg-brand-surface p-2 text-brand-muted hover:text-brand-primary"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <>
                          <button
                            onClick={() => openEdit(a)}
                            title="Edit"
                            className="rounded-lg border border-brand-border bg-brand-surface p-2 text-brand-muted hover:text-brand-primary"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {a.status === 'in_review' && (
                            <button
                              onClick={() => withdraw(a.id)}
                              disabled={busy}
                              title="Withdraw submission"
                              className="rounded-lg border border-brand-border bg-brand-surface p-2 text-brand-muted hover:text-amber-400"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => remove(a.id)}
                            disabled={busy}
                            title="Delete"
                            className="rounded-lg border border-brand-border bg-brand-surface p-2 text-brand-muted hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
