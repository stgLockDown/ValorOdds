'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, RefreshCw, Pencil, Trash2, ExternalLink, Plus, Save,
  Globe, EyeOff, Podcast as PodcastIcon, ListPlus,
} from 'lucide-react';

/** Mirrors PodcastEpisode from lib/podcast.ts (camelCase API response). */
interface Episode {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  showNotesMd: string | null;
  youtubeId: string | null;
  audioUrl: string | null;
  coverImageUrl: string | null;
  imageCredit: string | null;
  durationSeconds: number | null;
  season: number | null;
  episodeNumber: number | null;
  sport: string | null;
  tags: string[];
  status: 'draft' | 'published';
  relatedArticleId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Flash = (kind: 'ok' | 'err', text: string) => void;

/** Blank editor form for a new episode. */
const BLANK: Episode = {
  id: '',
  slug: '',
  title: '',
  description: '',
  showNotesMd: '',
  youtubeId: '',
  audioUrl: '',
  coverImageUrl: '',
  imageCredit: '',
  durationSeconds: null,
  season: 1,
  episodeNumber: null,
  sport: '',
  tags: [],
  status: 'draft',
  relatedArticleId: '',
  publishedAt: null,
  createdAt: '',
  updatedAt: '',
};

/** Client-side twin of extractYoutubeId for live preview. */
function parseYoutubeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim();
  if (!v) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(v);
  return m ? m[1] : null;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'published'
      ? 'bg-green-500/10 text-green-400'
      : 'bg-amber-500/10 text-amber-400';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function durationLabel(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

// ---------- Main Component ----------

export default function PodcastStudioClient() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [editor, setEditor] = useState<Episode | null>(null);
  const [listVersion, setListVersion] = useState(0);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const bumpList = useCallback(() => setListVersion((v) => v + 1), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/podcast/episodes?limit=200');
      const data = await r.json();
      if (r.ok) setEpisodes(data.episodes ?? []);
      else flash('err', `Load failed: ${data?.error ?? r.status}`);
    } catch (e) {
      flash('err', `Load failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    load();
  }, [listVersion, load]);

  async function setPublished(ep: Episode, status: 'draft' | 'published') {
    setBusyId(ep.id);
    try {
      const r = await fetch(`/api/admin/podcast/episodes/${ep.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await r.json();
      if (r.ok) {
        setEpisodes((list) => list.map((x) => (x.id === ep.id ? data.episode : x)));
        flash(
          'ok',
          status === 'published'
            ? 'Published — admins can now see it at /podcast (still hidden from the public).'
            : 'Unpublished — back to draft.'
        );
      } else {
        flash('err', `Publish toggle failed: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Publish toggle failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(ep: Episode) {
    if (!window.confirm(`Delete "${ep.title}" permanently?`)) return;
    setBusyId(ep.id);
    try {
      const r = await fetch(`/api/admin/podcast/episodes/${ep.id}`, { method: 'DELETE' });
      if (r.ok) {
        setEpisodes((list) => list.filter((x) => x.id !== ep.id));
        flash('ok', 'Deleted.');
      } else {
        const data = await r.json().catch(() => ({}));
        flash('err', `Delete failed: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  const draftCount = episodes.filter((e) => e.status === 'draft').length;
  const publishedCount = episodes.filter((e) => e.status === 'published').length;

  return (
    <main className="container-px mx-auto max-w-7xl py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-brand-accent">Admin</div>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-extrabold">
            <PodcastIcon className="h-7 w-7 text-brand-primary" />
            Podcast Studio
          </h1>
          <p className="mt-1 text-sm text-brand-muted">
            Manage episodes of <span className="font-semibold text-brand-heading">Beyond the Odds</span>.
            The show page at <span className="font-mono text-xs">/podcast</span> is hidden from the
            public (404) until launch — only admins can see it.
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/podcast/studio" target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center gap-2">
            <ExternalLink className="h-4 w-4" /> Open Studio view
          </a>
          <button onClick={load} className="btn-secondary inline-flex items-center gap-2" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setEditor({ ...BLANK })} className="btn-primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> New episode
          </button>
        </div>
      </header>

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

      {editor && (
        <EpisodeEditor
          key={editor.id || 'new'}
          initial={editor}
          flash={flash}
          onSaved={(saved) => {
            setEditor(null);
            bumpList();
            void saved;
          }}
          onCancel={() => setEditor(null)}
        />
      )}

      <section className="mt-8 card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-border p-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ListPlus className="h-4 w-4" /> Episodes
            </h2>
            <p className="mt-1 text-sm text-brand-muted">
              {publishedCount} published · {draftCount} draft{draftCount === 1 ? '' : 's'}
            </p>
          </div>
          <a
            href="/podcast"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open /podcast (admin view)
          </a>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 p-8 text-sm text-brand-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading episodes…
          </p>
        ) : episodes.length === 0 ? (
          <div className="p-8 text-center text-sm text-brand-muted">
            No episodes yet. Click <span className="font-semibold text-brand-heading">New episode</span> to
            add the first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-brand-border text-left text-xs uppercase tracking-wide text-brand-muted">
                  <th className="px-4 py-2">Episode</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Duration</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {episodes.map((ep) => (
                  <tr key={ep.id} className="border-b border-brand-border/60">
                    <td className="max-w-[340px] px-4 py-3">
                      <div className="flex items-center gap-3">
                        {ep.youtubeId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://i.ytimg.com/vi/${ep.youtubeId}/mqdefault.jpg`}
                            alt=""
                            className="h-10 w-[71px] shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="h-10 w-[71px] shrink-0 rounded bg-brand-surface" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium text-brand-heading">
                            {ep.season && ep.episodeNumber ? `S${ep.season}E${ep.episodeNumber} · ` : ''}
                            {ep.title}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-brand-muted">
                            {ep.sport ? `${ep.sport} · ` : ''}
                            {ep.slug}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={ep.status} /></td>
                    <td className="px-4 py-3 text-brand-muted">{durationLabel(ep.durationSeconds) ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-brand-muted">
                      {ep.publishedAt
                        ? `Published ${new Date(ep.publishedAt).toLocaleDateString()}`
                        : `Created ${new Date(ep.createdAt).toLocaleDateString()}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          title="Edit"
                          onClick={() => setEditor(ep)}
                          className="rounded-lg border border-brand-border bg-brand-surface p-2 text-brand-muted hover:text-brand-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {ep.status === 'published' ? (
                          <>
                            <a
                              href={`/podcast/${ep.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open episode page (admin view)"
                              className="rounded-lg border border-brand-border bg-brand-surface p-2 text-brand-muted hover:text-brand-primary"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <button
                              title="Unpublish (back to draft)"
                              disabled={busyId === ep.id}
                              onClick={() => setPublished(ep, 'draft')}
                              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                            >
                              {busyId === ep.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </>
                        ) : (
                          <button
                            title="Publish (admins see it at /podcast)"
                            disabled={busyId === ep.id}
                            onClick={() => setPublished(ep, 'published')}
                            className="rounded-lg border border-green-500/40 bg-green-500/10 p-2 text-green-400 hover:bg-green-500/20 disabled:opacity-50"
                          >
                            {busyId === ep.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Globe className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          title="Delete"
                          disabled={busyId === ep.id}
                          onClick={() => remove(ep)}
                          className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          {busyId === ep.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

// ---------- Episode Editor ----------

function EpisodeEditor({
  initial,
  flash,
  onSaved,
  onCancel,
}: {
  initial: Episode;
  flash: Flash;
  onSaved: (ep: Episode) => void;
  onCancel: () => void;
}) {
  const isNew = !initial.id;
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? '');
  const [showNotesMd, setShowNotesMd] = useState(initial.showNotesMd ?? '');
  const [youtubeField, setYoutubeField] = useState(initial.youtubeId ?? '');
  const [audioUrl, setAudioUrl] = useState(initial.audioUrl ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(initial.coverImageUrl ?? '');
  const [imageCredit, setImageCredit] = useState(initial.imageCredit ?? '');
  const [durationMinutes, setDurationMinutes] = useState(
    initial.durationSeconds ? String(Math.round(initial.durationSeconds / 60)) : ''
  );
  const [season, setSeason] = useState(initial.season ? String(initial.season) : '1');
  const [episodeNumber, setEpisodeNumber] = useState(
    initial.episodeNumber ? String(initial.episodeNumber) : ''
  );
  const [sport, setSport] = useState(initial.sport ?? '');
  const [tagsInput, setTagsInput] = useState(initial.tags.join(', '));
  const [relatedArticleId, setRelatedArticleId] = useState(initial.relatedArticleId ?? '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'draft' | 'published'>(initial.status);

  const parsedYoutubeId = useMemo(() => parseYoutubeId(youtubeField), [youtubeField]);
  const youtubeInvalid = youtubeField.trim() !== '' && !parsedYoutubeId;

  const inputCls = 'input mt-1 w-full';
  const labelCls = 'text-xs font-semibold uppercase tracking-wide text-brand-muted';

  async function save(publish?: boolean) {
    const finalStatus = publish === true ? 'published' : publish === false ? 'draft' : status;
    if (title.trim().length < 3) {
      flash('err', 'Title must be at least 3 characters.');
      return;
    }
    if (youtubeInvalid) {
      flash('err', 'The YouTube field does not look like a YouTube URL or 11-character id.');
      return;
    }
    setSaving(true);
    try {
      const mins = parseInt(durationMinutes, 10);
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        showNotesMd: showNotesMd || null,
        youtubeIdOrUrl: youtubeField.trim() || null,
        audioUrl: audioUrl.trim() || null,
        coverImageUrl: coverImageUrl.trim() || null,
        imageCredit: imageCredit.trim() || null,
        durationSeconds: Number.isFinite(mins) && mins > 0 ? mins * 60 : null,
        season: season.trim() ? parseInt(season, 10) : null,
        episodeNumber: episodeNumber.trim() ? parseInt(episodeNumber, 10) : null,
        sport: sport.trim() || null,
        tags: tagsInput
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 10),
        relatedArticleId: relatedArticleId.trim() || null,
        status: finalStatus,
      };
      const r = await fetch(
        isNew ? '/api/admin/podcast/episodes' : `/api/admin/podcast/episodes/${initial.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await r.json();
      if (r.ok) {
        flash(
          'ok',
          finalStatus === 'published'
            ? `Published "${data.episode.title}" — live for admins at /podcast.`
            : `Saved "${data.episode.title}" as draft.`
        );
        onSaved(data.episode);
      } else {
        flash('err', `Save failed: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <PodcastIcon className="h-4 w-4 text-brand-primary" />
          {isNew ? 'New episode' : `Edit: ${initial.title}`}
        </h2>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <button onClick={onCancel} className="text-sm text-brand-muted hover:text-brand-heading">
            Close
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Episode title" />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>Short description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
            placeholder="One-liner shown on the episode card (max 500 chars)"
          />
        </div>

        <div>
          <label className={labelCls}>YouTube URL or video id</label>
          <input
            value={youtubeField}
            onChange={(e) => setYoutubeField(e.target.value)}
            className={inputCls}
            placeholder="https://www.youtube.com/watch?v=… or dQw4w9WgXcQ"
          />
          {youtubeField.trim() === '' ? (
            <p className="mt-1 text-[11px] text-brand-muted">
              YouTube-first player. Leave empty only if you are using direct audio.
            </p>
          ) : youtubeInvalid ? (
            <p className="mt-1 text-[11px] text-red-400">
              Not a recognized YouTube URL or 11-character id.
            </p>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://i.ytimg.com/vi/${parsedYoutubeId}/mqdefault.jpg`}
                alt="YouTube thumbnail preview"
                className="h-[67px] w-[120px] rounded border border-brand-border object-cover"
              />
              <span className="font-mono text-[11px] text-brand-muted">id: {parsedYoutubeId}</span>
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Audio URL (fallback)</label>
          <input
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            className={inputCls}
            placeholder="https://…/episode.mp3 (optional)"
          />
        </div>

        <div>
          <label className={labelCls}>Cover image URL</label>
          <input
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            className={inputCls}
            placeholder="https://… (optional — YouTube thumb used by default)"
          />
        </div>

        <div>
          <label className={labelCls}>Image credit</label>
          <input
            value={imageCredit}
            onChange={(e) => setImageCredit(e.target.value)}
            className={inputCls}
            placeholder="Photo by …"
          />
        </div>

        <div>
          <label className={labelCls}>Duration (minutes)</label>
          <input
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value.replace(/[^0-9]/g, ''))}
            className={inputCls}
            placeholder="42"
            inputMode="numeric"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Season</label>
            <input
              value={season}
              onChange={(e) => setSeason(e.target.value.replace(/[^0-9]/g, ''))}
              className={inputCls}
              placeholder="1"
              inputMode="numeric"
            />
          </div>
          <div>
            <label className={labelCls}>Episode #</label>
            <input
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(e.target.value.replace(/[^0-9]/g, ''))}
              className={inputCls}
              placeholder="1"
              inputMode="numeric"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Sport</label>
          <input
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className={inputCls}
            placeholder="nfl, nba, mlb… (optional)"
          />
        </div>

        <div>
          <label className={labelCls}>Tags (comma-separated)</label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className={inputCls}
            placeholder="trades, preview, betting"
          />
        </div>

        <div>
          <label className={labelCls}>Related article id (optional)</label>
          <input
            value={relatedArticleId}
            onChange={(e) => setRelatedArticleId(e.target.value.replace(/[^0-9]/g, ''))}
            className={inputCls}
            placeholder="e.g. 15"
            inputMode="numeric"
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>Show notes (markdown)</label>
          <textarea
            value={showNotesMd}
            onChange={(e) => setShowNotesMd(e.target.value)}
            className={`${inputCls} min-h-[240px] font-mono text-[13px] leading-relaxed`}
            placeholder={'## Topics\n\n- Intro\n- Segment one\n\n## Links\n\n- [Example](https://example.com)'}
          />
          <p className="mt-1 text-[11px] text-brand-muted">
            Rendered on the episode page with the same markdown renderer as news articles.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-brand-border pt-4">
        <button
          onClick={() => {
            setStatus('draft');
            save(false);
          }}
          disabled={saving}
          className="btn-secondary inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save draft
        </button>
        <button
          onClick={() => {
            setStatus('published');
            save(true);
          }}
          disabled={saving}
          className="btn-primary inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          {isNew ? 'Create & publish' : 'Save & publish'}
        </button>
        <p className="ml-auto text-[11px] text-brand-muted">
          Publishing makes the episode visible to admins at /podcast — the area stays hidden from
          the public until launch.
        </p>
      </div>
    </section>
  );
}
