/**
 * Central SEO configuration and helpers.
 *
 * All public-facing pages should pull metadata through the helpers in this
 * file so we keep canonical URLs, OG tags, and JSON-LD consistent across the
 * site. Mirrors the metadata strategy of top-ranked sportsbooks
 * (DraftKings / FanDuel / Caesars): unique title + description per page,
 * canonical link, structured data, OG image, Twitter card.
 */

import type { Metadata } from 'next';

export const SITE = {
  name: 'Valor Odds',
  legalName: 'Valor Odds',
  url: 'https://valorodds.com',
  description:
    'Real-time sports arbitrage opportunities, AI-powered player props analysis, steam-move alerts, live injury reports, and live scores across MLB, NFL, NBA, NHL, NCAA, soccer, UFC, and more. Professional sports analytics on the web and Discord, with a developer API and a free betting education hub.',
  shortDescription:
    'Real-time arbitrage, AI player props, steam moves, injury alerts, live scores, and a betting education hub.',
  locale: 'en_US',
  twitter: '@valorodds',
  keywords: [
    // Core brand
    'valor odds',
    'valorodds',
    // Arbitrage
    'sports arbitrage',
    'arbitrage betting',
    'sure bets',
    'arb betting',
    // Value / analytics
    'positive ev betting',
    '+ev bets',
    'closing line value',
    'sharp betting tools',
    'sports betting analytics',
    'kelly criterion betting',
    // AI
    'ai sports betting',
    'ai betting analysis',
    'ai player props',
    'ai sports analyst',
    // Product categories
    'player props',
    'player prop research',
    'live odds',
    'best sportsbook odds',
    'odds comparison',
    'steam moves',
    'sharp money moves',
    'injury reports',
    'live sports scores',
    'sports betting alerts',
    // Sports
    'mlb betting',
    'nfl betting',
    'nba betting',
    'nhl betting',
    'ncaa betting',
    'soccer betting',
    'ufc betting',
    'tennis betting',
    // Education
    'sports betting glossary',
    'sports betting guide',
    'how to bet on sports',
    // Developer / API
    'sports data api',
    'sports odds api',
    // Use case
    'discord betting bot',
    'betting discord server',
    'fantasy sports draft',
  ],
  sameAs: [
    'https://twitter.com/valorodds',
    'https://discord.gg/valorodds',
    'https://www.linkedin.com/company/valorodds',
  ],
};

/** The known set of sports we cover. Keep in sync with the bot API. */
export const SPORTS = [
  { slug: 'mlb', code: 'MLB', name: 'MLB', fullName: 'Major League Baseball' },
  { slug: 'nfl', code: 'NFL', name: 'NFL', fullName: 'National Football League' },
  { slug: 'nba', code: 'NBA', name: 'NBA', fullName: 'National Basketball Association' },
  { slug: 'nhl', code: 'NHL', name: 'NHL', fullName: 'National Hockey League' },
  { slug: 'soccer', code: 'SOCCER', name: 'Soccer', fullName: 'Soccer (EPL, UCL, MLS)' },
  { slug: 'mma', code: 'MMA', name: 'UFC / MMA', fullName: 'Mixed Martial Arts' },
  { slug: 'boxing', code: 'BOXING', name: 'Boxing', fullName: 'Boxing' },
  { slug: 'tennis', code: 'TENNIS', name: 'Tennis', fullName: 'Tennis (ATP / WTA)' },
  { slug: 'ncaaf', code: 'NCAAF', name: 'NCAAF', fullName: 'NCAA Football' },
  { slug: 'ncaab', code: 'NCAAB', name: 'NCAAB', fullName: 'NCAA Basketball' },
] as const;

export type SportSlug = (typeof SPORTS)[number]['slug'];

/** Known betting markets we offer pages for. */
export const MARKETS = [
  { slug: 'moneyline', name: 'Moneyline', description: 'Pick the winner outright.' },
  { slug: 'spread', name: 'Point Spread', description: 'Bet against the handicap.' },
  { slug: 'totals', name: 'Totals (Over/Under)', description: 'Bet the combined score.' },
  { slug: 'player-props', name: 'Player Props', description: 'Bet on individual player performance.' },
  { slug: 'game-props', name: 'Game Props', description: 'Bet on specific in-game outcomes.' },
  { slug: 'futures', name: 'Futures', description: 'Season-long and long-term outcome markets.' },
  { slug: 'parlays', name: 'Parlays', description: 'Combine multiple selections into one bet.' },
  { slug: 'live', name: 'Live Betting', description: 'In-play betting while games unfold.' },
] as const;

/** Strip trailing slash and ensure leading slash. */
function normalizePath(path: string): string {
  if (!path) return '/';
  const p = path.startsWith('/') ? path : `/${path}`;
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

export function canonical(path: string): string {
  return `${SITE.url}${normalizePath(path)}`;
}

/**
 * Build a Metadata object with consistent defaults.
 * Pass only the fields that differ from global defaults.
 */
export function buildMetadata(args: {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageAlt?: string;
  keywords?: string[];
  type?: 'website' | 'article';
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
}): Metadata {
  const url = canonical(args.path);
  const image = args.image || `${SITE.url}/api/og?title=${encodeURIComponent(args.title)}`;
  const imageAlt = args.imageAlt || args.title;
  return {
    title: args.title,
    description: args.description,
    keywords: args.keywords,
    alternates: { canonical: url },
    openGraph: {
      type: args.type || 'website',
      url,
      siteName: SITE.name,
      title: args.title,
      description: args.description,
      locale: SITE.locale,
      images: [{ url: image, alt: imageAlt, width: 1200, height: 630 }],
      publishedTime: args.publishedTime,
      modifiedTime: args.modifiedTime,
      authors: args.authors,
    },
    twitter: {
      card: 'summary_large_image',
      site: SITE.twitter,
      creator: SITE.twitter,
      title: args.title,
      description: args.description,
      images: [image],
    },
    robots: args.noindex
      ? { index: false, follow: false, nocache: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
            'max-video-preview': -1,
          },
        },
  };
}

/* --------------------------------------------------------------------------
 * JSON-LD builders
 * ------------------------------------------------------------------------ */

export function orgJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    logo: `${SITE.url}/logo.png`,
    description: SITE.description,
    sameAs: SITE.sameAs,
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    description: SITE.description,
    publisher: { '@id': `${SITE.url}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE.url}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function softwareAppJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    operatingSystem: 'Web, iOS, Android',
    applicationCategory: 'SportsApplication',
    description: SITE.description,
    offers: [
      { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Premium', price: '29', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'VIP', price: '99', priceCurrency: 'USD' },
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '250',
    },
  };
}

export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

export function articleJsonLd(a: {
  title: string;
  description: string;
  url: string;
  image?: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    image: a.image ? [a.image] : undefined,
    datePublished: a.datePublished,
    dateModified: a.dateModified || a.datePublished,
    author: { '@type': 'Person', name: a.author || 'Valor Odds' },
    publisher: { '@id': `${SITE.url}/#organization` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
  };
}

export function sportsEventJsonLd(e: {
  name: string;
  url: string;
  startDate: string;
  endDate?: string;
  homeTeam: string;
  awayTeam: string;
  location?: string;
  sport: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: e.name,
    url: e.url,
    sport: e.sport,
    startDate: e.startDate,
    endDate: e.endDate,
    location: e.location
      ? { '@type': 'Place', name: e.location }
      : undefined,
    homeTeam: { '@type': 'SportsTeam', name: e.homeTeam },
    awayTeam: { '@type': 'SportsTeam', name: e.awayTeam },
    competitor: [
      { '@type': 'SportsTeam', name: e.homeTeam },
      { '@type': 'SportsTeam', name: e.awayTeam },
    ],
    organizer: { '@id': `${SITE.url}/#organization` },
  };
}

/** Convenience: render a JSON-LD script tag payload. */
export function jsonLdScript(payload: object): string {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}