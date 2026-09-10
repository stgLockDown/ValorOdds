'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Sparkles, RefreshCw, XCircle, Pencil, Trash2,
  UserPlus, UserMinus, ExternalLink, ListChecks, Users, Save, Globe, Trophy,
} from 'lucide-react';

// ---------- Types (mirrors lib/news-platform + lib/article-generator) ----------

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
  generator_model: string | null;
  source_links: string[];
  sources?: { url: string; name: string; headline: string }[];
  review_notes: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
}

interface WriterUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_writer: boolean;
  is_admin: boolean;
  created_at: string;
}

interface SubjectCandidate {
  name: string;
  sport: string;
  headlineCount: number;
  image: string | null;
  imageCredit: string | null;
  sourceLinks: string[];
}

interface WeeklyPreview {
  week: number;
  mode: 'player' | 'team';
  candidates: SubjectCandidate[];
}

/** Mirrors ArticleGameOption from lib/game-article-generator. */
interface GameOption {
  eventId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string | null;
  state: 'pre' | 'in' | 'post';
  statusDetail: string | null;
  isLive: boolean;
  isFinal: boolean;
  homeScore: number;
  awayScore: number;
  homeRecord: string | null;
  awayRecord: string | null;
  books: number;
}

type Tab = 'generate' | 'queue' | 'edit' | 'writers';
type Flash = (kind: 'ok' | 'err', text: string) => void;

// ---------- Small helpers ----------

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'published': return 'bg-green-500/10 text-green-400';
    case 'in_review': return 'bg-amber-500/10 text-amber-400';
    case 'pending_review': return 'bg-purple-500/10 text-purple-400';
    case 'rejected': return 'bg-red-500/10 text-red-400';
    default: return 'bg-brand-surface text-brand-muted'; // draft
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function MiniBtn({
  title,
  onClick,
  disabled,
  tone = 'default',
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'go' | 'stop';
  children: React.ReactNode;
}) {
  const toneCls =
    tone === 'go'
      ? 'border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20'
      : tone === 'stop'
        ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
        : 'border-brand-border bg-brand-surface text-brand-muted hover:text-brand-primary';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg border p-2 disabled:opacity-50 ${toneCls}`}
    >
      {children}
    </button>
  );
}

// ---------- Main Component ----------

export default function NewsStudioClient() {
  const [tab, setTab] = useState<Tab>('generate');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  /** Article opened in the editor tab. */
  const [editorArticle, setEditorArticle] = useState<Article | null>(null);
  /** Bumped whenever an article changes so the queue tab refetches. */
  const [queueVersion, setQueueVersion] = useState(0);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const bumpQueue = useCallback(() => setQueueVersion((v) => v + 1), []);

  const openEditor = useCallback((a: Article) => {
    setEditorArticle(a);
    setTab('edit');
  }, []);

  return (
    <main className="container-px mx-auto max-w-7xl py-10">
      <header>
        <div className="text-xs uppercase tracking-widest text-brand-accent">Admin</div>
        <h1 className="mt-1 text-3xl font-extrabold">News Studio</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Generate AI-drafted articles, review submissions, and manage writers.
        </p>
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

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Studio sections">
        {([
          ['generate', 'Generator', <Sparkles key="g" className="h-4 w-4" />],
          ['queue', 'Review Queue', <ListChecks key="q" className="h-4 w-4" />],
          ['edit', 'Editor', <Pencil key="e" className="h-4 w-4" />],
          ['writers', 'Writers', <Users key="w" className="h-4 w-4" />],
        ] as [Tab, string, React.ReactNode][]).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
              tab === id
                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                : 'border-brand-border bg-brand-surface text-brand-muted hover:text-brand-heading'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'generate' && <GeneratorTab flash={flash} onCreated={bumpQueue} />}
        {tab === 'queue' && <QueueTab flash={flash} version={queueVersion} onOpen={openEditor} />}
        {tab === 'edit' &&
          (editorArticle ? (
            <EditorTab key={editorArticle.id} article={editorArticle} flash={flash} onSaved={bumpQueue} />
          ) : (
            <p className="text-sm text-brand-muted">
              Pick an article from the Review Queue to edit it.
            </p>
          ))}
        {tab === 'writers' && <WritersTab flash={flash} />}
      </div>
    </main>
  );
}

// ---------- Generator Tab ----------

function GeneratorTab({ flash, onCreated }: { flash: Flash; onCreated: () => void }) {
  const [preview, setPreview] = useState<WeeklyPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [subjectName, setSubjectName] = useState('');
  const [subjectType, setSubjectType] = useState<'player' | 'team'>('player');
  const [customMode, setCustomMode] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Game coverage mode
  const [mode, setMode] = useState<'weekly' | 'game'>('weekly');
  const [games, setGames] = useState<GameOption[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameOption | null>(null);
  const [gamesLoaded, setGamesLoaded] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const r = await fetch('/api/admin/news/generate');
      const data = await r.json();
      if (r.ok) {
        setPreview(data);
        setSubjectType(data.mode);
      } else {
        flash('err', `Could not load weekly preview: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Preview failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingPreview(false);
    }
  }, [flash]);

  const loadGames = useCallback(async () => {
    setLoadingGames(true);
    try {
      const r = await fetch('/api/admin/news/generate/games');
      const data = await r.json();
      if (r.ok) {
        setGames(data.games ?? []);
        setGamesLoaded(true);
      } else {
        flash('err', `Could not load games: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Games failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingGames(false);
    }
  }, [flash]);

  // Load games lazily the first time the editor switches to Game Coverage.
  useEffect(() => {
    if (mode === 'game' && !gamesLoaded && !loadingGames) {
      loadGames();
    }
  }, [mode, gamesLoaded, loadingGames, loadGames]);

  // Weekly preview already loads on mount via this effect.
  useEffect(() => {
    if (mode === 'weekly') {
      loadPreview();
    }
  }, [mode, loadPreview]);

  async function generate() {
    setGenerating(true);
    try {
      const body =
        mode === 'game' && selectedGame
          ? { gameId: selectedGame.eventId, gameSport: selectedGame.sport }
          : customMode && subjectName.trim()
            ? { subjectName: subjectName.trim(), subjectType }
            : {};
      const r = await fetch('/api/admin/news/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (r.ok) {
        flash('ok', `Draft created — "${data.article?.title}" is now pending review.`);
        onCreated();
      } else {
        flash('err', `Generation failed: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  const gameTime = (g: GameOption) => {
    if (g.isLive) return 'LIVE';
    if (g.isFinal) return 'Final';
    return g.startTime
      ? new Date(g.startTime).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : 'TBD';
  };

  const matchup = (g: GameOption) => `${g.awayTeam} @ ${g.homeTeam}`;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Article Generator</h2>
          <p className="mt-1 text-sm text-brand-muted">
            The AI drafts a weekly player/team spotlight — or coverage of a specific game, live or upcoming.
          </p>
        </div>
        <button onClick={loadPreview} disabled={loadingPreview} className="btn-secondary inline-flex items-center gap-2">
          {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh candidates
        </button>
      </div>

      {/* Mode toggle: weekly spotlight vs game coverage */}
      <div className="mt-5 flex gap-2">
        {(['weekly', 'game'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setSelectedGame(null);
            }}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              mode === m
                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                : 'border-brand-border bg-brand-surface text-brand-muted'
            }`}
          >
            {m === 'weekly' ? 'Weekly Spotlight' : 'Game Coverage'}
          </button>
        ))}
      </div>

      {mode === 'weekly' ? (
        <>
      {preview && (
        <div className="mt-4 rounded-lg border border-brand-border bg-brand-elevated/50 p-4">
          <p className="text-sm">
            <span className="font-semibold text-brand-heading">
              Week {preview.week} — {preview.mode === 'player' ? 'Player Spotlight' : 'Team Spotlight'}
            </span>
            <span className="text-brand-muted">
              {' '}(default rotation: odd weeks feature players, even weeks feature teams)
            </span>
          </p>
          <p className="mt-1 text-xs text-brand-muted">
            Ranked by headline volume over the last 7 days. The default pick rotates week to week.
          </p>
        </div>
      )}

      <label className="mt-5 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={customMode}
          onChange={(e) => setCustomMode(e.target.checked)}
          className="h-4 w-4"
        />
        Choose subject manually (override the weekly rotation)
      </label>

      {customMode && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Subject type</span>
            <div className="mt-1 flex gap-2">
              {(['player', 'team'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSubjectType(t)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    subjectType === t
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                      : 'border-brand-border bg-brand-surface text-brand-muted'
                  }`}
                >
                  {t === 'player' ? 'Player' : 'Team'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Subject name</span>
            <input
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder={preview?.candidates[0]?.name ?? 'e.g. Patrick Mahomes'}
              className="input mt-1 w-full"
            />
          </div>
        </div>
      )}

      {loadingPreview && !preview && (
        <p className="mt-4 flex items-center gap-2 text-sm text-brand-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading trending subjects…
        </p>
      )}

      {!loadingPreview && preview && preview.candidates.length === 0 && (
        <p className="mt-4 text-sm text-amber-400">
          No trending subjects found in the last 7 days of headlines. Try again later or pick manually.
        </p>
      )}

      {preview && preview.candidates.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-brand-border text-left text-xs uppercase tracking-wide text-brand-muted">
                <th className="py-2 pr-4">Subject</th>
                <th className="py-2 pr-4">Sport</th>
                <th className="py-2 pr-4">Headlines (7d)</th>
                <th className="py-2">Photo</th>
              </tr>
            </thead>
            <tbody>
              {preview.candidates.map((c) => (
                <tr
                  key={c.name}
                  className="cursor-pointer border-b border-brand-border/60 hover:bg-brand-elevated/40"
                  onClick={() => {
                    setCustomMode(true);
                    setSubjectType(preview.mode);
                    setSubjectName(c.name);
                  }}
                >
                  <td className="py-2 pr-4 font-medium text-brand-heading">{c.name}</td>
                  <td className="py-2 pr-4 text-brand-muted">{c.sport}</td>
                  <td className="py-2 pr-4 text-brand-muted">{c.headlineCount}</td>
                  <td className="py-2">
                    {c.image ? <span className="text-green-400">Yes</span> : <span className="text-brand-muted">Logo fallback</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-brand-muted">Click a row to select that subject.</p>
        </div>
      )}
        </>
      ) : (
        <>
      <div className="mt-4 rounded-lg border border-brand-border bg-brand-elevated/50 p-4">
        <p className="text-sm">
          <span className="font-semibold text-brand-heading">Game coverage</span>
          <span className="text-brand-muted">
            {' '}— previews for upcoming and live games, recaps for finals. Betting lines come
            straight from the odds feed; team photos from recent headlines.
          </span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Games</span>
        <button onClick={loadGames} disabled={loadingGames} className="btn-secondary inline-flex items-center gap-2">
          {loadingGames ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh games
        </button>
      </div>

      {loadingGames && !gamesLoaded && (
        <p className="mt-4 flex items-center gap-2 text-sm text-brand-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the scoreboard window…
        </p>
      )}

      {!loadingGames && gamesLoaded && games.length === 0 && (
        <p className="mt-4 text-sm text-amber-400">
          No games found in the window (last 3 days through the next 10). Try again later.
        </p>
      )}

      {gamesLoaded && games.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-brand-border text-left text-xs uppercase tracking-wide text-brand-muted">
                <th className="py-2 pr-4">Matchup</th>
                <th className="py-2 pr-4">Sport</th>
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Score / Records</th>
                <th className="py-2">Books</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr
                  key={g.eventId}
                  className={`cursor-pointer border-b border-brand-border/60 hover:bg-brand-elevated/40 ${
                    selectedGame?.eventId === g.eventId ? 'bg-brand-primary/10' : ''
                  }`}
                  onClick={() => setSelectedGame(g)}
                >
                  <td className="py-2 pr-4 font-medium text-brand-heading">
                    {matchup(g)}
                    {selectedGame?.eventId === g.eventId && (
                      <span className="ml-2 text-xs font-semibold text-brand-primary">selected</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-brand-muted">{g.sport}</td>
                  <td className="py-2 pr-4 text-brand-muted">
                    {g.isLive ? (
                      <span className="font-semibold text-red-400">
                        LIVE{g.statusDetail ? ` · ${g.statusDetail}` : ''}
                      </span>
                    ) : (
                      gameTime(g)
                    )}
                  </td>
                  <td className="py-2 pr-4 text-brand-muted">
                    {g.state === 'post' && (g.homeScore > 0 || g.awayScore > 0)
                      ? `${g.awayScore}–${g.homeScore}`
                      : `${g.awayRecord ?? '—'} at ${g.homeRecord ?? '—'}`}
                  </td>
                  <td className="py-2 text-brand-muted">{g.books > 0 ? g.books : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-brand-muted">
            Live games first, then soonest upcoming, then recent finals. Click a row to select the game to cover.
          </p>
        </div>
      )}
        </>
      )}

      <button
        onClick={generate}
        disabled={generating || (mode === 'weekly' && customMode && !subjectName.trim()) || (mode === 'game' && !selectedGame)}
        className="btn-primary mt-6 inline-flex items-center gap-2"
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : mode === 'game' ? (
          <Trophy className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}{' '}
        {generating
          ? 'Generating… (may take up to a minute)'
          : mode === 'game' && selectedGame
            ? `Generate ${selectedGame.isFinal ? 'recap' : 'preview'} for ${matchup(selectedGame)}`
            : mode === 'game'
              ? 'Select a game above'
              : customMode && subjectName.trim()
                ? `Generate about ${subjectName.trim()}`
                : `Generate this week's spotlight`}
      </button>

      <p className="mt-3 text-xs text-brand-muted">
        Generated drafts always land in the review queue as <strong>pending review</strong> — nothing goes
        live until you approve and publish it.
      </p>
    </section>
  );
}

// ---------- Queue Tab ----------

function QueueTab({
  flash,
  version,
  onOpen,
}: {
  flash: Flash;
  version: number;
  onOpen: (a: Article) => void;
}) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/admin/news/articles?status=draft,pending_review,in_review,approved,rejected,published');
        const data = await r.json();
        if (cancelled) return;
        if (r.ok) setArticles(data.articles ?? []);
        else flash('err', `Queue failed: ${data?.error ?? r.status}`);
      } catch (e) {
        if (!cancelled) flash('err', `Queue failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version, flash]);

  async function patchStatus(id: string, status: 'published' | 'rejected') {
    setBusyId(id);
    try {
      let payload: Record<string, unknown> = { status };
      if (status === 'rejected') {
        const reason = window.prompt('Reason for rejection (shown to the writer):');
        if (!reason) return;
        payload = { status, review_notes: reason };
      }
      const r = await fetch(`/api/admin/news/articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (r.ok) {
        setArticles((list) => list.map((a) => (a.id === id ? { ...a, ...data.article } : a)));
        flash('ok', status === 'published' ? 'Published — the article is live at /news.' : 'Rejected — the writer can revise and resubmit.');
      } else {
        flash('err', `${status} failed: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `${status} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this article permanently?')) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/news/articles/${id}`, { method: 'DELETE' });
      if (r.ok) {
        setArticles((list) => list.filter((a) => a.id !== id));
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

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-brand-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading review queue…
      </p>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-brand-muted">
          Queue is clear. Generate a draft or wait for writer submissions.
        </p>
      </div>
    );
  }

  const reviewFirst = [...articles].sort((a, b) => {
    const order = (s: string) =>
      s === 'pending_review' || s === 'in_review' ? 0 : s === 'approved' ? 1 : s === 'draft' ? 2 : 3;
    return order(a.status) - order(b.status);
  });

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-brand-border p-4">
        <h2 className="text-lg font-bold">All Articles &amp; Review Queue</h2>
        <p className="mt-1 text-sm text-brand-muted">
          AI drafts and writer submissions appear here. Publishing is always an explicit action.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-xs uppercase tracking-wide text-brand-muted">
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Author</th>
              <th className="px-4 py-2">AI</th>
              <th className="px-4 py-2">Updated</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reviewFirst.map((a) => (
              <tr key={a.id} className="border-b border-brand-border/60">
                <td className="max-w-[280px] px-4 py-3">
                  <div className="truncate font-medium text-brand-heading">{a.title}</div>
                  <div className="mt-0.5 text-[11px] text-brand-muted">
                    {a.subject_name
                      ? `${a.subject_type === 'player' ? 'Player' : a.subject_type === 'game' ? 'Game' : 'Team'}: ${a.subject_name}`
                      : a.byline}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3 text-brand-muted">{a.author_name ?? a.byline}</td>
                <td className="px-4 py-3">
                  {a.is_ai_generated ? <span className="text-purple-400">AI</span> : <span className="text-brand-muted">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-brand-muted">
                  {new Date(a.updated_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <MiniBtn title="Edit" onClick={() => onOpen(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </MiniBtn>
                    {a.status !== 'published' ? (
                      <>
                        <MiniBtn
                          title="Publish now"
                          tone="go"
                          disabled={busyId === a.id}
                          onClick={() => patchStatus(a.id, 'published')}
                        >
                          {busyId === a.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Globe className="h-3.5 w-3.5" />
                          )}
                        </MiniBtn>
                        <MiniBtn
                          title="Reject"
                          tone="stop"
                          disabled={busyId === a.id}
                          onClick={() => patchStatus(a.id, 'rejected')}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </MiniBtn>
                      </>
                    ) : (
                      <a
                        href={`/news/${a.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View live"
                        className="rounded-lg border border-brand-border bg-brand-surface p-2 text-brand-muted hover:text-brand-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <MiniBtn title="Delete" disabled={busyId === a.id} onClick={() => remove(a.id)}>
                      {busyId === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </MiniBtn>
                  </div>
                  {a.status === 'rejected' && a.review_notes && (
                    <div className="mt-1 text-[11px] text-red-400/80">Note: {a.review_notes}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- Editor Tab ----------

function EditorTab({ article, flash, onSaved }: { article: Article; flash: Flash; onSaved: () => void }) {
  const [draft, setDraft] = useState<Article>(article);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [reviewNotes, setReviewNotes] = useState(article.review_notes ?? '');

  const set = <K extends keyof Article>(key: K, value: Article[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save(status?: string) {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: draft.title,
        subtitle: draft.subtitle || null,
        body_md: draft.body_md,
        cover_image_url: draft.cover_image_url || null,
        image_credit: draft.image_credit || null,
        sport: draft.sport || null,
        subject_name: draft.subject_name || null,
        tags: draft.tags,
        byline: draft.byline,
        review_notes: reviewNotes || null,
      };
      if (status) payload.status = status;
      const r = await fetch(`/api/admin/news/articles/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (r.ok) {
        setDraft(data.article);
        flash('ok', status === 'published' ? 'Published — the article is live at /news.' : 'Saved.');
        onSaved();
      } else {
        flash('err', `Save failed: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'input mt-1 w-full';
  const labelCls = 'text-xs font-semibold uppercase tracking-wide text-brand-muted';

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={draft.status} />
          {draft.is_ai_generated && (
            <span className="text-[11px] text-purple-400">AI-drafted ({draft.generator_model})</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('write')}
            className={mode === 'write' ? 'btn-secondary' : 'text-sm text-brand-muted'}
          >
            Write
          </button>
          <button
            onClick={() => setMode('preview')}
            className={mode === 'preview' ? 'btn-secondary' : 'text-sm text-brand-muted'}
          >
            Preview
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Title</label>
          <input value={draft.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Subtitle</label>
          <input value={draft.subtitle ?? ''} onChange={(e) => set('subtitle', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Sport</label>
          <input
            value={draft.sport ?? ''}
            onChange={(e) => set('sport', e.target.value)}
            className={inputCls}
            placeholder="nfl, nba, mlb…"
          />
        </div>
        <div>
          <label className={labelCls}>Byline</label>
          <input value={draft.byline} onChange={(e) => set('byline', e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Cover image URL</label>
          <input
            value={draft.cover_image_url ?? ''}
            onChange={(e) => set('cover_image_url', e.target.value)}
            className={inputCls}
            placeholder="https://…"
          />
          {draft.cover_image_url && (
            <div className="mt-2 overflow-hidden rounded-lg border border-brand-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.cover_image_url}
                alt="Cover preview"
                className="aspect-[16/9] w-full object-cover"
              />
              {draft.image_credit && (
                <div className="border-t border-brand-border px-2 py-1 text-[11px] text-brand-muted">
                  {draft.image_credit}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Image credit</label>
          <input
            value={draft.image_credit ?? ''}
            onChange={(e) => set('image_credit', e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Tags (comma separated)</label>
          <input
            value={draft.tags.join(', ')}
            onChange={(e) =>
              set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))
            }
            className={inputCls}
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <label className={labelCls}>Body (markdown)</label>
          <span className="flex items-center gap-3">
            {(draft.body_md.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length > 0 && (
              <span className="text-[11px] text-brand-muted">
                {(draft.body_md.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length} inline image
                {(draft.body_md.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length === 1 ? '' : 's'}
              </span>
            )}
            {draft.sources && draft.sources.length > 0 ? (
              <span className="text-[11px] text-brand-muted">
                {draft.sources.length} sources · {new Set(draft.sources.map((s) => s.name)).size} outlets
              </span>
            ) : draft.source_links.length > 0 ? (
              <span className="text-[11px] text-brand-muted">{draft.source_links.length} sources</span>
            ) : null}
          </span>
        </div>
        {mode === 'write' ? (
          <textarea
            value={draft.body_md}
            onChange={(e) => set('body_md', e.target.value)}
            rows={18}
            className="input mt-1 w-full font-mono text-sm"
          />
        ) : (
          <div className="mt-1 min-h-[300px] rounded-lg border border-brand-border bg-brand-elevated/40 p-4 text-sm">
            {draft.body_md.split('\n').map((line, i) => {
              const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim());
              if (imgMatch) {
                return (
                  <div key={i} className="my-2 overflow-hidden rounded-lg border border-brand-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgMatch[2]} alt={imgMatch[1]} className="aspect-[16/9] w-full object-cover" />
                    {imgMatch[1] && (
                      <div className="border-t border-brand-border px-2 py-1 text-[11px] text-brand-muted">
                        {imgMatch[1]}
                      </div>
                    )}
                  </div>
                );
              }
              if (line.startsWith('## ')) {
                return (
                  <h2 key={i} className="mt-4 text-lg font-bold text-brand-heading">
                    {line.slice(3)}
                  </h2>
                );
              }
              if (line.startsWith('**') && line.endsWith('**')) {
                return (
                  <p key={i} className="mt-2 font-semibold">
                    {line.slice(2, -2)}
                  </p>
                );
              }
              return (
                <p key={i} className="mt-2 text-brand-muted">
                  {line}
                </p>
              );
            })}
          </div>
        )}
        {draft.sources && draft.sources.length > 0 && (
          <div className="mt-3 rounded-lg border border-brand-border bg-brand-surface/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
              Cited sources ({new Set(draft.sources.map((s) => s.name)).size} outlets)
            </div>
            <ul className="mt-2 space-y-1.5">
              {draft.sources.map((s, i) => (
                <li key={`${s.url}-${i}`} className="text-xs text-brand-muted">
                  <span className="font-semibold text-brand-primary">{s.name}</span>
                  {s.headline && <> — {s.headline}</>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={() => save()} disabled={saving} className="btn-secondary inline-flex items-center gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
        </button>
        {draft.status !== 'published' && (
          <button
            onClick={() => save('published')}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Globe className="h-4 w-4" /> Save &amp; publish
          </button>
        )}
        {draft.status === 'published' && (
          <a
            href={`/news/${draft.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" /> View live article
          </a>
        )}
      </div>
    </section>
  );
}

// ---------- Writers Tab ----------

function WritersTab({ flash }: { flash: Flash }) {
  const [writers, setWriters] = useState<WriterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/news/writers');
      const data = await r.json();
      if (r.ok) setWriters(data.writers ?? []);
      else flash('err', `Writers failed: ${data?.error ?? r.status}`);
    } catch (e) {
      flash('err', `Writers failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    load();
  }, [load]);

  async function setRole(emailArg: string, isWriter: boolean) {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/news/writers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailArg, isWriter }),
      });
      const data = await r.json();
      if (r.ok) {
        flash(
          'ok',
          isWriter ? `Writer role granted to ${emailArg}.` : `Writer role revoked from ${emailArg}.`
        );
        load();
      } else {
        flash('err', `Update failed: ${data?.error ?? r.status}`);
      }
    } catch (e) {
      flash('err', `Update failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-bold">Writers</h2>
      <p className="mt-1 text-sm text-brand-muted">
        Grant the writer role to let a user draft articles from their dashboard. Their work goes through
        the same review queue before publishing.
      </p>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          setRole(email.trim(), true);
          setEmail('');
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          className="input flex-1"
        />
        <button type="submit" disabled={busy || !email.trim()} className="btn-primary inline-flex items-center gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Grant writer
        </button>
      </form>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-brand-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading writers…
        </p>
      ) : writers.length === 0 ? (
        <p className="mt-4 text-sm text-brand-muted">No writers yet — grant the role above to get started.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-brand-border text-left text-xs uppercase tracking-wide text-brand-muted">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Roles</th>
                <th className="py-2 text-right">Writer role</th>
              </tr>
            </thead>
            <tbody>
              {writers.map((w) => (
                <tr key={w.id} className="border-b border-brand-border/60">
                  <td className="py-2 pr-4 font-medium text-brand-heading">{w.email}</td>
                  <td className="py-2 pr-4 text-brand-muted">{w.display_name ?? '—'}</td>
                  <td className="py-2 pr-4 text-brand-muted">
                    {w.is_admin ? 'admin' : 'user'}
                    {w.is_writer ? ' + writer' : ''}
                  </td>
                  <td className="py-2 text-right">
                    {w.is_writer ? (
                      <button
                        onClick={() => setRole(w.email, false)}
                        disabled={busy}
                        className="btn-secondary inline-flex items-center gap-1 text-xs"
                      >
                        <UserMinus className="h-3.5 w-3.5" /> Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => setRole(w.email, true)}
                        disabled={busy}
                        className="btn-secondary inline-flex items-center gap-1 text-xs"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Grant
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
