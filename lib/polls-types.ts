/**
 * Shared types and display helpers for community polls.
 *
 * This file is safe to import from client components — it has no
 * Node.js-only dependencies (no `pg`, no `fs`). The DB-access functions
 * live in `lib/polls.ts` (server-side only).
 */

export type Poll = {
  id: number;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string; // ISO
  displayOrder: number;
  homeVotes: number;
  awayVotes: number;
  totalVotes: number;
  userVote: 'home' | 'away' | null;
};

export type PollDTO = {
  id: number;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  displayOrder: number;
  homeVotes: number;
  awayVotes: number;
  totalVotes: number;
};

/**
 * Normalise a sport code for display (e.g. AMERICAN_FOOTBALL -> NFL).
 */
export function sportLabel(sport: string): string {
  const map: Record<string, string> = {
    AMERICAN_FOOTBALL: 'NFL',
    BASKETBALL: 'NBA',
    BASEBALL: 'MLB',
    ICE_HOCKEY: 'NHL',
    SOCCER: 'Soccer',
    MMA: 'MMA',
    BOXING: 'Boxing',
    TENNIS: 'Tennis',
    GOLF: 'Golf',
    NASCAR: 'NASCAR',
    RUGBY_LEAGUE: 'Rugby',
    RUGBY_UNION: 'Rugby',
    CRICKET: 'Cricket',
    DARTS: 'Darts',
    CYCLING: 'Cycling',
    SNOOKER: 'Snooker',
    AUSSIE_RULES: 'AFL',
    HANDBALL: 'Handball',
    VOLLEYBALL: 'Volleyball',
    TABLE_TENNIS: 'Table Tennis',
    ESPORTS: 'Esports',
  };
  return map[sport] ?? sport.replace(/_/g, ' ');
}

/**
 * Emoji for each sport (used in the poll card).
 */
export function sportEmoji(sport: string): string {
  const map: Record<string, string> = {
    AMERICAN_FOOTBALL: '🏈',
    BASKETBALL: '🏀',
    BASEBALL: '⚾',
    ICE_HOCKEY: '🏒',
    SOCCER: '⚽',
    MMA: '🥊',
    BOXING: '🥊',
    TENNIS: '🎾',
    GOLF: '⛳',
    NASCAR: '🏁',
    RUGBY_LEAGUE: '🏉',
    RUGBY_UNION: '🏉',
    CRICKET: '🏏',
  };
  return map[sport] ?? '🏆';
}
