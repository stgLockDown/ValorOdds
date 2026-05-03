'use client';

/**
 * Interactive widget builder. Lets partners pick a sport / theme / size /
 * tracking tag, previews the result in a live iframe, and generates a
 * one-click-copy embed snippet.
 *
 * Pure client component — no backend calls. The snippet itself points at
 * /widgets/best-odds/[sport], which is the ISR-cached public route.
 */

import { useMemo, useState } from 'react';

type Sport = { slug: string; fullName: string };

type Theme = 'dark' | 'light';

const THEMES: { key: Theme; label: string }[] = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
];

const SIZES = [
  { w: 360, h: 420, label: 'Sidebar (360×420)' },
  { w: 480, h: 480, label: 'In-article (480×480)' },
  { w: 720, h: 540, label: 'Full width (720×540)' },
];

export function EmbedBuilder({
  sports,
  siteUrl,
}: {
  sports: Sport[];
  siteUrl: string;
}) {
  const [sportSlug, setSportSlug] = useState(sports[0]?.slug ?? 'mlb');
  const [theme, setTheme] = useState<Theme>('dark');
  const [size, setSize] = useState(SIZES[1]);
  const [limit, setLimit] = useState(6);
  const [refTag, setRefTag] = useState('myblog');
  const [copied, setCopied] = useState(false);

  const src = useMemo(() => {
    const params = new URLSearchParams();
    params.set('theme', theme);
    params.set('limit', String(limit));
    if (refTag.trim()) params.set('ref', refTag.trim());
    return `${siteUrl}/widgets/best-odds/${sportSlug}?${params.toString()}`;
  }, [siteUrl, sportSlug, theme, limit, refTag]);

  const snippet = useMemo(() => {
    const title = `Best ${sports.find((s) => s.slug === sportSlug)?.fullName ?? ''} Odds`;
    return `<iframe
  src="${src}"
  title="${title} — powered by Valor Odds"
  width="${size.w}"
  height="${size.h}"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
  style="border:0;max-width:100%;border-radius:12px;overflow:hidden"
></iframe>`;
  }, [src, size, sports, sportSlug]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard rejected — user can still select the text manually */
    }
  }

  return (
    <section
      aria-labelledby="builder-heading"
      className="rounded-xl border border-white/10 bg-white/[0.02] p-6"
    >
      <h2 id="builder-heading" className="text-lg font-semibold mb-4">
        Build your embed
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <label className="text-xs text-slate-300">
          Sport
          <select
            value={sportSlug}
            onChange={(e) => setSportSlug(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          >
            {sports.map((s) => (
              <option key={s.slug} value={s.slug}>{s.fullName}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-300">
          Theme
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            className="mt-1 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          >
            {THEMES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-300">
          Size
          <select
            value={`${size.w}x${size.h}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              const next = SIZES.find((s) => s.w === w && s.h === h) ?? SIZES[1];
              setSize(next);
            }}
            className="mt-1 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          >
            {SIZES.map((s) => (
              <option key={`${s.w}x${s.h}`} value={`${s.w}x${s.h}`}>{s.label}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-300">
          Rows
          <input
            type="number"
            min={3}
            max={12}
            value={limit}
            onChange={(e) => setLimit(Math.min(Math.max(parseInt(e.target.value || '6', 10), 3), 12))}
            className="mt-1 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <label className="text-xs text-slate-300 sm:col-span-2">
          Tracking tag <span className="text-slate-500">(optional — tags outbound clicks with a UTM)</span>
          <input
            type="text"
            value={refTag}
            onChange={(e) => setRefTag(e.target.value.replace(/[^a-z0-9_-]/gi, '').slice(0, 32))}
            placeholder="e.g. myblog"
            className="mt-1 w-full rounded-md border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          />
        </label>
      </div>

      {/* Live preview */}
      <div
        className="mb-5 rounded-lg border border-white/10 bg-slate-950/40 p-2 flex justify-center"
        aria-label="Widget preview"
      >
        <iframe
          key={src}
          src={src}
          title="Valor Odds widget preview"
          width={size.w}
          height={size.h}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ border: 0, maxWidth: '100%', borderRadius: 12 }}
        />
      </div>

      {/* Snippet */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-300">Embed code</span>
          <button
            type="button"
            onClick={onCopy}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-teal-500/20 text-teal-200 border border-teal-500/30 hover:bg-teal-500/30 transition"
          >
            {copied ? 'Copied ✓' : 'Copy snippet'}
          </button>
        </div>
        <pre
          className="text-xs bg-slate-950/70 border border-white/10 rounded-md p-3 overflow-x-auto whitespace-pre text-slate-200"
          aria-label="Embed HTML snippet"
        >
{snippet}
        </pre>
      </div>
    </section>
  );
}