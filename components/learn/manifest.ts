/**
 * Pure TypeScript manifest of Learn articles.
 *
 * This file is deliberately JSX-free so it can be imported by metadata-only
 * contexts (sitemap, RSS, route metadata) where Next's metadata loader parses
 * the import chain strictly as TS. Keeping this list separate from
 * ./index.tsx avoids forcing those loaders through our TSX article bodies.
 *
 * index.tsx consumes this manifest as the authoritative article list and
 * attaches the rendered React bodies for the article pages.
 */

export type ArticleCategory =
  | 'Arbitrage'
  | 'Strategy'
  | 'Bankroll'
  | 'Props'
  | 'MLB'
  | 'NFL'
  | 'NBA'
  | 'Glossary';

export type ArticleMeta = {
  slug: string;
  title: string;
  description: string;
  category: ArticleCategory;
  published: string; // ISO
  updated?: string; // ISO
  readingMinutes: number;
  keywords: string[];
  author?: string;
};

export const ARTICLE_MANIFEST: ArticleMeta[] = [
  {
    slug: 'what-is-arbitrage-betting',
    title: 'What is arbitrage betting? A complete guide',
    description:
      'Arbitrage betting (arb betting / sure betting) is placing bets on every outcome of an event across different sportsbooks to lock in a guaranteed profit. Here is how the math works, a full example, and the real-world risks.',
    category: 'Arbitrage',
    published: '2026-05-01',
    updated: '2026-05-01',
    readingMinutes: 8,
    keywords: [
      'arbitrage betting',
      'arb betting',
      'sure betting',
      'sports arbitrage',
      'risk free sports betting',
      'how does arbitrage betting work',
    ],
    author: 'Valor Odds',
  },
  {
    slug: 'positive-ev-betting-explained',
    title: 'Positive EV (+EV) betting explained',
    description:
      'Positive expected value betting is the mathematical foundation of every long-term profitable bettor. Learn what +EV means, how to calculate it, and how to find +EV bets consistently across sportsbooks.',
    category: 'Strategy',
    published: '2026-05-02',
    readingMinutes: 10,
    keywords: [
      'positive ev betting',
      'ev sports betting',
      '+ev bets',
      'expected value betting',
      'how to find ev bets',
    ],
    author: 'Valor Odds',
  },
  {
    slug: 'closing-line-value-clv',
    title: 'Closing line value (CLV) — the sharp bettor KPI',
    description:
      'Closing line value (CLV) is the single most important metric for measuring long-term sports betting edge. Here is what it means, how to calculate it, why sportsbooks track it, and how to improve yours.',
    category: 'Strategy',
    published: '2026-05-03',
    readingMinutes: 7,
    keywords: [
      'closing line value',
      'clv betting',
      'sharp bettor metrics',
      'how to measure betting edge',
    ],
    author: 'Valor Odds',
  },
  {
    slug: 'kelly-criterion-bet-sizing',
    title: 'Kelly criterion and bet sizing',
    description:
      'The Kelly criterion is the optimal bet-sizing formula when you have a known edge. Here is the math, why most sharp bettors use fractional Kelly, and when to bet less than the formula suggests.',
    category: 'Bankroll',
    published: '2026-05-04',
    readingMinutes: 9,
    keywords: [
      'kelly criterion',
      'kelly betting',
      'bet sizing',
      'fractional kelly',
      'sports betting bankroll',
    ],
    author: 'Valor Odds',
  },
  {
    slug: 'player-props-edge',
    title: 'Finding edge in player props',
    description:
      'Player prop markets are softer than game lines, but spotting edge takes discipline. Here is a practical framework for finding mispriced player props across every major sport.',
    category: 'Props',
    published: '2026-05-05',
    readingMinutes: 8,
    keywords: [
      'player props',
      'prop betting strategy',
      'player prop research',
      'nba player props',
      'nfl player props',
      'mlb player props',
    ],
    author: 'Valor Odds',
  },
  {
    slug: 'mlb-betting-guide',
    title: 'MLB betting: a beginner-to-sharp guide',
    description:
      'Everything you need to bet MLB profitably — moneyline, F5, run lines, totals, starting-pitcher factors, weather, umpires, and the markets with the most structural edge.',
    category: 'MLB',
    published: '2026-05-06',
    readingMinutes: 12,
    keywords: [
      'mlb betting guide',
      'baseball betting strategy',
      'mlb first five innings',
      'mlb run line',
      'best mlb markets',
    ],
    author: 'Valor Odds',
  },
  {
    slug: 'nfl-betting-guide',
    title: 'NFL betting guide',
    description:
      'Spreads, totals, teasers, correlated parlays, and how to beat the public in NFL markets. A practical playbook for NFL bettors who want to move from recreational to sharp.',
    category: 'NFL',
    published: '2026-05-07',
    readingMinutes: 11,
    keywords: [
      'nfl betting guide',
      'nfl spread betting',
      'nfl totals',
      'nfl teasers',
      'nfl betting strategy',
    ],
    author: 'Valor Odds',
  },
  {
    slug: 'nba-betting-guide',
    title: 'NBA betting guide',
    description:
      'NBA markets move on pace, lineup changes, and rest. Here is a practical guide to NBA spread, total, and player-prop betting — and why injury-driven line movement is the biggest source of edge in the league.',
    category: 'NBA',
    published: '2026-05-08',
    readingMinutes: 10,
    keywords: [
      'nba betting guide',
      'nba betting strategy',
      'nba player props',
      'nba spread betting',
      'nba totals',
    ],
    author: 'Valor Odds',
  },
];

export function metaBySlug(slug: string): ArticleMeta | null {
  return ARTICLE_MANIFEST.find((a) => a.slug === slug) ?? null;
}

export function allArticleMeta(): ArticleMeta[] {
  return [...ARTICLE_MANIFEST].sort((a, b) => (a.published < b.published ? 1 : -1));
}