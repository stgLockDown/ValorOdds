/**
 * Sportsbook market classifier (website mirror of the Discord bot's
 * `shared/sportsbook_classifier.js`). Used to split arbitrage opportunities
 * into "domestic" (US) and "international" markets so we can apply the Basic
 * tier's per-day caps (1 domestic + 1 international per day).
 *
 * Keep these lists in sync with the bot. Matching is case-insensitive and uses
 * substring containment so feed variants (e.g. "Unibet UK", "Pinnacle (Guest)")
 * resolve correctly.
 */

export const US_SPORTSBOOKS: string[] = [
  'DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'PointsBet', 'BetRivers',
  'DraftKings (AN)', 'FanDuel (AN)', 'BetRivers (AN)',
  'ESPN/DraftKings',
  'Bovada',
  'Underdog Fantasy',
  'ESPN Bet', 'Barstool Sportsbook', 'Bally Bet',
  'WynnBET', 'Golden Nugget', 'Betway US',
  'Hard Rock', 'Fanatics',
  'Draft Kings', 'Fan Duel', 'Bet MGM', 'Bet365 US',
];

export const INTL_SPORTSBOOKS: string[] = [
  'Pinnacle', 'Pinnacle v3', 'Pinnacle (Guest)',
  'Smarkets', 'Matchbook',
  'bet365', '22Bet', 'Leon.bet',
  'Kambi/Unibet', 'Unibet (Detail)',
  'Unibet UK', 'Unibet SE', 'Unibet NL', 'Unibet BE',
  'Unibet RO', 'Unibet DE', 'Unibet DK', 'Unibet CA',
  'PAF', 'PAF (Detail)',
  'Svenska Spel', 'ATG',
  'Coolbet', 'ComeOn',
  '888sport IT', 'Bingoal', 'BetCity NL',
  'Ladbrokes AU', 'Neds AU',
  'MaxBet', 'MaxBet BA', 'MaxBet MK',
  'SoccerBet RS', 'SoccerBet BA',
  'Merkur RS',
  'BetOle RS', 'BetOle BA',
  '1xBet', 'BetWinner', 'Melbet', '1xBit', 'Linebet', 'MegaPari',
  '22Bet (Direct)',
  'William Hill', 'Paddy Power', 'Betfair',
  'Ladbrokes', 'Coral', 'BetVictor', 'Sky Bet',
  '888sport', 'Betway', '10bet', 'Unibet',
  'LeoVegas', 'Mr Green', 'Grosvenor',
  'Dafabet', 'SBOBET', '188BET', 'BetEasy',
  'Sportsbet', 'TAB', 'Neds', 'PointsBet INTL',
];

export type BookMarket = 'us' | 'intl' | 'unknown';
export type ArbMarket = 'domestic' | 'international' | 'mixed' | 'unknown';

/** Classify a single sportsbook as 'us' | 'intl' | 'unknown'. */
export function classifyBook(bookName: string | null | undefined): BookMarket {
  if (!bookName) return 'unknown';
  const n = String(bookName).toLowerCase().trim();
  if (!n) return 'unknown';
  // US first (higher priority for US users), mirroring the bot.
  for (const b of US_SPORTSBOOKS) {
    if (n.includes(b.toLowerCase())) return 'us';
  }
  for (const b of INTL_SPORTSBOOKS) {
    if (n.includes(b.toLowerCase())) return 'intl';
  }
  return 'unknown';
}

/**
 * Classify an arbitrage opportunity (defined by its two books) as
 * 'domestic' (both US), 'international' (both non-US), 'mixed', or 'unknown'.
 *
 * For Basic's daily split we treat anything that touches the US market as
 * "domestic" and everything else as "international", so each opportunity is
 * deterministically assigned to exactly one bucket.
 */
export function classifyArbMarket(
  book1: string | null | undefined,
  book2: string | null | undefined,
): ArbMarket {
  const m1 = classifyBook(book1);
  const m2 = classifyBook(book2);
  if (m1 === 'us' && m2 === 'us') return 'domestic';
  if (m1 === 'intl' && m2 === 'intl') return 'international';
  if (
    (m1 === 'us' && m2 === 'intl') ||
    (m1 === 'intl' && m2 === 'us')
  ) {
    return 'mixed';
  }
  if (m1 === 'us' || m2 === 'us') return 'domestic';
  if (m1 === 'intl' || m2 === 'intl') return 'international';
  return 'unknown';
}

/**
 * Bucket an arbitrage into 'domestic' | 'international' for the Basic daily
 * cap. "mixed" and "unknown" are treated as domestic so a US-based Basic user
 * always gets something actionable in their domestic slot.
 */
export function arbBucket(
  book1: string | null | undefined,
  book2: string | null | undefined,
): 'domestic' | 'international' {
  const m = classifyArbMarket(book1, book2);
  return m === 'international' ? 'international' : 'domestic';
}

/**
 * Canonical book identity — collapses duplicate feeds of the SAME underlying
 * sportsbook (e.g. "Pinnacle", "Pinnacle (Guest)", "pinnacle_v3") so two such
 * feeds are never treated as an arbitrage against each other. Mirrors the
 * bot's `normalizeBookName`.
 */
export function normalizeBookName(bookName: string | null | undefined): string {
  if (!bookName) return '';
  let k = String(bookName).toLowerCase().trim();
  if (!k) return '';
  k = k
    .replace(/\(\s*guest\s*\)/g, ' ')
    .replace(/[_\s]+v\d+\b/g, ' ')
    .replace(/[\s_]+/g, ' ')
    .trim();
  const aliases: Record<string, string> = {
    pinnacle: 'pinnacle',
    'pinnacle guest': 'pinnacle',
    betonline: 'betonline',
    betonlineag: 'betonline',
    mybookie: 'mybookie',
    mybookieag: 'mybookie',
    unibet: 'unibet',
    'unibet us': 'unibet',
    pointsbet: 'pointsbet',
    pointsbetus: 'pointsbet',
    'betrivers an': 'betrivers',
    'betrivers ny': 'betrivers',
  };
  return aliases[k] ?? k;
}

/** True when two book names refer to the SAME underlying book. */
export function isSameBook(
  book1: string | null | undefined,
  book2: string | null | undefined,
): boolean {
  const a = normalizeBookName(book1);
  const b = normalizeBookName(book2);
  return !!a && a === b;
}

/**
 * Canonical, human-readable display name for every `bookmaker_key` written
 * by the bot into `odds_snapshots`. Some historical rows have a raw/internal
 * value in `bookmaker_name` (e.g. "fanduel_an", "draftkings_an", lowercase
 * "betmgm", "paf", "caesars" for williamhill_us) instead of a clean label
 * (QA audit: "raw sportsbook key shown instead of formatted name").
 *
 * `bookmaker_key` is the stable, normalized identifier, so we key off that
 * first and only fall back to a cleaned-up `bookmaker_name` when the key
 * isn't in this table.
 */
const BOOKMAKER_DISPLAY_NAMES: Record<string, string> = {
  '1xbit': '1xBit',
  '22bet_direct': '22Bet',
  '888sport_it': '888sport',
  atg: 'ATG',
  atg_se: 'ATG',
  bet365: 'bet365',
  betcity_nl: 'BetCity',
  betmgm: 'BetMGM',
  betmgm_mi: 'BetMGM',
  betonlineag: 'BetOnline',
  betrivers: 'BetRivers',
  betwinner: 'BetWinner',
  bingoal: 'Bingoal',
  bovada: 'Bovada',
  bovada_an: 'Bovada',
  comeon: 'ComeOn',
  coolbet: 'Coolbet',
  draftkings: 'DraftKings',
  fanduel: 'FanDuel',
  kambiunibet: 'Kambi/Unibet',
  ladbrokes_au: 'Ladbrokes',
  leonbet: 'Leon.bet',
  linebet: 'Linebet',
  matchbook: 'Matchbook',
  megapari: 'MegaPari',
  melbet: 'Melbet',
  neds_au: 'Neds',
  paf: 'PAF',
  polymarket: 'Polymarket',
  svenska_spel: 'Svenska Spel',
  twentytwobet: '22Bet',
  unibet_be: 'Unibet',
  unibet_ca: 'Unibet',
  unibet_de: 'Unibet',
  unibet_dk: 'Unibet',
  unibet_nl: 'Unibet',
  unibet_ro: 'Unibet',
  unibet_se: 'Unibet',
  unibet_uk: 'Unibet',
  unibet_us: 'Unibet',
  williamhill_us: 'Caesars',
};

/**
 * Best-effort cleanup for a raw `bookmaker_name`/`bookmaker_key` string that
 * isn't in the lookup table above — turns snake_case/internal suffixes into
 * something presentable instead of rendering it verbatim.
 */
function titleCaseFallback(raw: string): string {
  return raw
    .replace(/_(an|us|ny|mi|v\d+)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length <= 3 && w === w.toLowerCase() ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Public formatter: given a bookmaker key and/or the (possibly raw/internal)
 * name column, return the clean, human-readable sportsbook name to show
 * users. Always prefer this over rendering `bookmaker_key`/`bookmaker_name`
 * directly in any UI.
 */
export function formatBookmakerName(
  bookmakerKey: string | null | undefined,
  bookmakerName?: string | null | undefined,
): string {
  const key = (bookmakerKey || '').toLowerCase().trim();
  if (key && BOOKMAKER_DISPLAY_NAMES[key]) return BOOKMAKER_DISPLAY_NAMES[key];

  const name = (bookmakerName || '').trim();
  if (name) {
    // If the "name" is really just the raw key (all lowercase, snake_case,
    // or has an internal suffix like _an/_us), clean it up instead of
    // showing it verbatim.
    const looksRaw = /^[a-z0-9_]+$/.test(name) && (name === name.toLowerCase());
    if (looksRaw) return titleCaseFallback(name);
    return name;
  }

  if (key) return titleCaseFallback(key);
  return 'Unknown';
}
