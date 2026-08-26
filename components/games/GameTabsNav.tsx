import Link from 'next/link';

export const GAME_TABS = [
  { slug: 'details', label: 'Details' },
  { slug: 'odds', label: 'Odds' },
  { slug: 'box-score', label: 'Box Score' },
  { slug: 'standings', label: 'Standings' },
  { slug: 'injuries', label: 'Injuries' },
  { slug: 'futures', label: 'Futures' },
] as const;

export type GameTabSlug = (typeof GAME_TABS)[number]['slug'];

/**
 * Shared tab bar for the per-game detail pages. `basePath` is the URL prefix
 * up to (but not including) the tab segment, e.g.
 * `/games/mlb/yankees-red-sox-2026-08-25` or
 * `/dashboard/games/nfl/bills-jets-2026-09-07`.
 */
export default function GameTabsNav({ basePath, activeTab }: { basePath: string; activeTab: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-brand-border">
      {GAME_TABS.map((tab) => (
        <Link
          key={tab.slug}
          href={`${basePath}/${tab.slug}`}
          className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === tab.slug
              ? 'border-brand-accent text-brand-accent'
              : 'border-transparent text-brand-muted hover:text-brand-text'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
