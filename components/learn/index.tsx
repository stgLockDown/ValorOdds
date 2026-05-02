/**
 * Learn — article body registry.
 *
 * Imports the pure-TS manifest for metadata (used by sitemap / RSS / route
 * metadata) and adds the React body components keyed by slug. The body
 * imports only happen when this file is reached from an actual React render
 * path (app/learn/page.tsx, app/learn/[slug]/page.tsx), not from metadata
 * loaders.
 */

import type { ComponentType } from 'react';
import {
  ARTICLE_MANIFEST,
  metaBySlug,
  allArticleMeta,
  type ArticleMeta,
} from './manifest';

// JSX article bodies. Each module exports a default React component.
import WhatIsArbitrageBody from './articles/what-is-arbitrage-betting';
import PositiveEvBody from './articles/positive-ev-betting-explained';
import ClvBody from './articles/closing-line-value-clv';
import KellyBody from './articles/kelly-criterion-bet-sizing';
import PropsBody from './articles/player-props-edge';
import MlbGuideBody from './articles/mlb-betting-guide';
import NflGuideBody from './articles/nfl-betting-guide';
import NbaGuideBody from './articles/nba-betting-guide';

const BODIES: Record<string, ComponentType> = {
  'what-is-arbitrage-betting': WhatIsArbitrageBody,
  'positive-ev-betting-explained': PositiveEvBody,
  'closing-line-value-clv': ClvBody,
  'kelly-criterion-bet-sizing': KellyBody,
  'player-props-edge': PropsBody,
  'mlb-betting-guide': MlbGuideBody,
  'nfl-betting-guide': NflGuideBody,
  'nba-betting-guide': NbaGuideBody,
};

export type { ArticleMeta };

export function getArticle(
  slug: string,
): { meta: ArticleMeta; Body: ComponentType } | null {
  const meta = metaBySlug(slug);
  const Body = BODIES[slug];
  if (!meta || !Body) return null;
  return { meta, Body };
}

export function allArticles(): ArticleMeta[] {
  return allArticleMeta();
}

export { ARTICLE_MANIFEST };