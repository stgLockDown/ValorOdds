'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ListVideo, Headphones, ExternalLink, SkipBack, SkipForward,
} from 'lucide-react';

interface EpisodeLite {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  showNotesMd: string | null;
  youtubeId: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  season: number | null;
  episodeNumber: number | null;
  sport: string | null;
  tags: string[];
  publishedAt: string | null;
}

interface TickerItem {
  id: string;
  text: string;
  sport: string | null;
  href: string;
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

export default function StudioWatchClient({
  episodes,
  initialSlug,
  ticker,
}: {
  episodes: EpisodeLite[];
  initialSlug: string | null;
  ticker: TickerItem[];
}) {
  // Auto-start the newest episode (or the ?ep= one if provided & published).
  const initial =
    (initialSlug && episodes.find((e) => e.slug === initialSlug)) || episodes[0] || null;
  const [activeId, setActiveId] = useState<string | null>(initial?.id ?? null);
  const [notesOpen, setNotesOpen] = useState(true);

  const active = useMemo(
    () => episodes.find((e) => e.id === activeId) ?? null,
    [episodes, activeId]
  );

  // Broadcast clock — feels like a live control room.
  const [clock, setClock] = useState<string>('');
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' })
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Reset notes panel when switching episodes.
  useEffect(() => {
    setNotesOpen(true);
  }, [activeId]);

  // ---------- Keyboard shortcuts (control-room feel) ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const i = episodes.findIndex((x) => x.id === activeId);
        const next = e.key === 'ArrowUp' ? i + 1 : i - 1;
        if (episodes[next]) setActiveId(episodes[next].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [episodes, activeId]);

  return (
    <div className="mt-6">
      {episodes.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-semibold text-brand-heading">No episodes published yet</p>
          <p className="mt-2 text-sm text-brand-muted">
            Publish an episode in the{' '}
            <Link href="/admin/podcast" className="text-brand-primary hover:underline">
              Podcast Studio
            </Link>{' '}
            and it appears here in the studio rundown.
          </p>
        </div>
      ) : (
        <>
          {/* ============ STUDIO SET ============ */}
          <div className="studio-set">
            {/* Ceiling light rig */}
            <div className="studio-rig" aria-hidden="true">
              <span /><span /><span />
            </div>

            {/* Set nameplate above the screen */}
            <div className="studio-nameplate">
              <span className="studio-nameplate-show">{`BEYOND THE ODDS`}</span>
              <span className="studio-nameplate-sub">VALORODDS NETWORK</span>
            </div>

            {/* The screen wall — video lives here with overlays ON TOP of it */}
            <div className="studio-screenwall">
              {active?.youtubeId ? (
                <div className="relative aspect-video w-full overflow-hidden bg-black">
                  <iframe
                    key={active.id}
                    className="absolute inset-0 h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${active.youtubeId}?rel=0`}
                    title={active.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />

                  {/* ===== BROADCAST OVERLAYS (over the video) ===== */}
                  <div className="pointer-events-none absolute inset-0 select-none">
                    {/* Network bug — top right, semi-transparent */}
                    <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-sm bg-black/45 px-2 py-1 backdrop-blur-[2px]">
                      <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
                      <span className="text-[10px] font-black tracking-wider text-white">
                        VO
                      </span>
                    </div>

                    {/* LIVE indicator — top left */}
                    <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-sm bg-black/45 px-2 py-1 backdrop-blur-[2px]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-accent" />
                      <span className="text-[10px] font-black tracking-[0.2em] text-amber-300">
                        PODCAST
                      </span>
                    </div>

                    {/* Lower third — bottom left, classic broadcast style */}
                    {active && (
                      <div className="absolute bottom-10 left-3 sm:bottom-14 sm:left-5">
                        <div className="studio-lower-third">
                          <div className="studio-lower-third-chip">
                            {active.sport
                              ? active.sport.toUpperCase()
                              : active.season && active.episodeNumber
                                ? `S${active.season}·E${active.episodeNumber}`
                                : 'EPISODE'}
                          </div>
                          <div className="studio-lower-third-body">
                            <p className="studio-lower-third-title">{active.title}</p>
                            {(active.tags.length > 0 || active.description) && (
                              <p className="studio-lower-third-sub">
                                {active.tags.slice(0, 3).join(' · ') ||
                                  active.description?.slice(0, 60)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Corner flag — bottom right */}
                    <div className="absolute bottom-10 right-3 sm:bottom-14 sm:right-5">
                      <div className="rounded-sm bg-black/45 px-2 py-1 backdrop-blur-[2px]">
                        <span className="text-[10px] font-bold tracking-wider text-white/80">
                          {durationLabel(active?.durationSeconds) ?? 'BtO'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : active?.audioUrl ? (
                /* Audio-only fallback: keep the set, swap the screen */
                <div className="relative flex aspect-video w-full flex-col items-center justify-center bg-gradient-to-b from-brand-elevated to-black">
                  <Headphones className="h-10 w-10 text-brand-primaryText" />
                  <p className="mt-3 text-sm font-semibold text-brand-heading">Audio episode</p>
                  <p className="mt-1 max-w-md px-6 text-center text-xs text-brand-muted">
                    {active.title}
                  </p>
                  <audio controls className="mt-6 w-[80%] max-w-md" preload="none" src={active.audioUrl}>
                    Your browser does not support audio playback.
                  </audio>
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-brand-elevated text-sm text-brand-muted">
                  No player configured for this episode.
                </div>
              )}
            </div>

            {/* Studio desk / control bar under the screen */}
            <div className="studio-desk">
              <div className="flex items-center gap-3 text-xs text-brand-muted">
                <ListVideo className="h-4 w-4 text-brand-primaryText" />
                <span className="font-mono">
                  {active
                    ? `EPISODE ${active.episodeNumber ?? '—'} · ${active.slug}`
                    : 'NO EPISODE SELECTED'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => step(-1)}
                  className="rounded-lg border border-brand-border bg-brand-surface p-2 text-brand-muted hover:text-brand-heading"
                  title="Previous episode (↓)"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  onClick={() => step(1)}
                  className="rounded-lg border border-brand-border bg-brand-surface p-2 text-brand-muted hover:text-brand-heading"
                  title="Next episode (↑)"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
                <span className="ml-2 font-mono text-xs tabular-nums text-brand-muted">
                  {clock} ET
                </span>
              </div>
            </div>
          </div>

          {/* ============ NEWS TICKER ============ */}
          {ticker.length > 0 && (
            <div className="studio-ticker">
              <div className="studio-ticker-label">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                LATEST
              </div>
              <div className="studio-ticker-track">
                <div className="studio-ticker-items">
                  {ticker.map((t) => (
                    <Link
                      key={t.id}
                      href={t.href}
                      className="studio-ticker-item"
                      title={t.text}
                    >
                      {t.sport && (
                        <span className="mr-1.5 font-bold uppercase text-amber-300">
                          {t.sport}
                        </span>
                      )}
                      {t.text}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============ RUNDOWN + SHOW NOTES ============ */}
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* Episode rundown (playlist) */}
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-brand-border p-4">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <ListVideo className="h-4 w-4 text-brand-primary" /> Rundown
                </h2>
                <span className="text-xs text-brand-muted">{episodes.length} episodes</span>
              </div>
              <ul className="max-h-[520px] overflow-y-auto">
                {episodes.map((ep, i) => {
                  const isActive = ep.id === activeId;
                  return (
                    <li key={ep.id} data-active={isActive || undefined} className="studio-rundown-item">
                      <button
                        onClick={() => setActiveId(ep.id)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        {ep.youtubeId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://i.ytimg.com/vi/${ep.youtubeId}/mqdefault.jpg`}
                            alt=""
                            loading="lazy"
                            className="h-[54px] w-24 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-[54px] w-24 shrink-0 items-center justify-center rounded bg-brand-surface">
                            <Headphones className="h-4 w-4 text-brand-muted" />
                          </div>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            {isActive && (
                              <span className="text-[10px] font-black tracking-wider text-red-400">
                                ▶ ON
                              </span>
                            )}
                            <span className="truncate text-sm font-semibold text-brand-heading">
                              {ep.title}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-brand-muted">
                            {ep.season && ep.episodeNumber && (
                              <span className="font-semibold text-brand-primaryText">
                                S{ep.season}E{ep.episodeNumber}
                              </span>
                            )}
                            {durationLabel(ep.durationSeconds)}
                            {ep.sport && <span className="uppercase">{ep.sport}</span>}
                          </span>
                        </span>
                        <span className="text-[11px] text-brand-muted">
                          {ep.publishedAt
                            ? new Date(ep.publishedAt).toLocaleDateString()
                            : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Show notes for the active episode */}
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-brand-border p-4">
                <h2 className="text-lg font-bold">Show notes</h2>
                <div className="flex items-center gap-3">
                  {active && (
                    <Link
                      href={`/podcast/${active.slug}`}
                      className="inline-flex items-center gap-1 text-xs text-brand-muted hover:text-brand-primary"
                    >
                      <ExternalLink className="h-3 w-3" /> Full page
                    </Link>
                  )}
                  <button
                    onClick={() => setNotesOpen((o) => !o)}
                    className="text-xs text-brand-muted hover:text-brand-heading"
                  >
                    {notesOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {notesOpen && active && (
                <div className="max-h-[520px] overflow-y-auto p-4 text-sm leading-relaxed">
                  {active.showNotesMd ? (
                    <ShowNotes markdown={active.showNotesMd} />
                  ) : (
                    <p className="text-brand-muted">
                      No show notes for this episode yet.
                    </p>
                  )}
                </div>
              )}
              {notesOpen && !active && (
                <p className="p-4 text-sm text-brand-muted">Select an episode.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );

  function step(dir: number) {
    const i = episodes.findIndex((x) => x.id === activeId);
    const next = i + dir;
    if (i === -1 && episodes[0]) setActiveId(episodes[0].id);
    else if (episodes[next]) setActiveId(episodes[next].id);
  }
}

// ---------- Client-side show notes (safe subset renderer) ----------

function ShowNotes({ markdown }: { markdown: string }) {
  // Lightweight, safe rendering: no raw HTML is ever injected — markdown
  // source is converted to React elements (links allowed, sanitized text).
  const blocks = useMemo(() => {
    const lines = String(markdown || '')
      .replace(/\r\n/g, '\n')
      .split('\n');
    const out: React.ReactNode[] = [];
    let list: string[] = [];
    let key = 0;

    const flushList = () => {
      if (list.length) {
        out.push(
          <ul key={key++} className="my-2 list-disc space-y-1 pl-5 text-brand-text">
            {list.map((li, i) => (
              <li key={i}>{inline(li)}</li>
            ))}
          </ul>
        );
        list = [];
      }
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) { flushList(); continue; }
      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) {
        flushList();
        const level = h[1].length;
        const cls =
          level === 1
            ? 'mt-4 text-lg font-bold text-brand-heading'
            : level === 2
              ? 'mt-3 text-base font-bold text-brand-heading'
              : 'mt-3 text-sm font-bold text-brand-heading';
        out.push(<p key={key++} className={cls}>{inline(h[2])}</p>);
        continue;
      }
      if (/^\s*[-*+]\s+/.test(line)) {
        list.push(line.replace(/^\s*[-*+]\s+/, ''));
        continue;
      }
      flushList();
      out.push(<p key={key++} className="my-1.5 text-brand-text">{inline(line)}</p>);
    }
    flushList();
    return out;
  }, [markdown]);

  return <div className="text-sm leading-relaxed">{blocks}</div>;
}

/** Inline markdown: **bold**, *italic*, [links](url) — rendered as safe React nodes. */
function inline(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  // Links first, then bold/italics inside the remaining text.
  const linkRe = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = linkRe.exec(text))) {
    if (m.index > last) nodes.push(fmt(text.slice(last, m.index), key++));
    nodes.push(
      <a
        key={key++}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-primary hover:underline"
      >
        {m[1]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(fmt(text.slice(last), key++));
  return nodes;
}

function fmt(text: string, key: number): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <span key={key}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}
