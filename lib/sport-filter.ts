/**
 * Sport-key filter helpers for `odds_snapshots`-backed queries.
 *
 * The bot writes rows into `odds_snapshots` with `sport='BASKETBALL'`,
 * `sport_key='basketball_nba'` (matching The Odds API's vocabulary).
 * Filtering by `sport_key` is the only way to disambiguate NBA from
 * NCAAB/WNBA which all share `sport='BASKETBALL'`.
 *
 * Extracted into its own module so server components (lib/public-data)
 * and authenticated dashboard API routes (app/api/dashboard/*) share
 * one definition.
 */

/**
 * Each entry returns an array of LIKE patterns. Patterns ending with
 * `_` get a trailing `%` appended at query time so SOCCER fans out
 * across every soccer competition (`soccer_epl`, `soccer_usa_mls`,
 * `soccer_uefa_champs_league`, ...) in a single query.
 */
export const SPORT_KEY_PATTERNS: Record<string, string[]> = {
  NBA:    ['basketball_nba'],
  WNBA:   ['basketball_wnba'],
  NCAAB:  ['basketball_ncaab'],
  NFL:    ['americanfootball_nfl'],
  NCAAF:  ['americanfootball_ncaaf'],
  MLB:    ['baseball_mlb'],
  NHL:    ['icehockey_nhl'],
  MMA:    ['mma_mixed_martial_arts'],
  UFC:    ['mma_mixed_martial_arts'],
  BOXING: ['boxing_boxing'],
  TENNIS: ['tennis_atp', 'tennis_wta'],
  SOCCER: ['soccer_'],
};

/**
 * Build a SQL fragment + parameter list that filters `odds_snapshots`
 * (or any sibling table that carries the same `sport_key`) to the rows
 * belonging to the given public sport code. Returns null when the
 * sport is unknown so callers can short-circuit the query.
 *
 * The caller is responsible for splicing the returned `params` into
 * the right position of the final parameter array. `startParamIndex`
 * controls the `$N` placeholder numbering.
 */
export function sportFilterClause(
  sportCode: string,
  startParamIndex: number,
): { clause: string; params: string[] } | null {
  const patterns = SPORT_KEY_PATTERNS[(sportCode || '').toUpperCase()];
  if (!patterns || patterns.length === 0) return null;
  const ors: string[] = [];
  const params: string[] = [];
  let p = startParamIndex;
  for (const pat of patterns) {
    if (pat.endsWith('_')) {
      ors.push(`sport_key LIKE $${p}`);
      params.push(`${pat}%`);
    } else {
      ors.push(`sport_key = $${p}`);
      params.push(pat);
    }
    p += 1;
  }
  return { clause: ors.length === 1 ? ors[0] : `(${ors.join(' OR ')})`, params };
}
