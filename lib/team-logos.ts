/**
 * Team logo + abbreviation lookup for MLB and NFL.
 *
 * ESPN's public CDN serves team logos at a predictable URL keyed by a
 * lowercase 2-4 letter team abbreviation:
 *
 *   https://a.espncdn.com/i/teamlogos/{nfl|mlb}/500/{abbrev}.png
 *
 * The odds feed writes full display names ("Buffalo Bills", "New York
 * Yankees") that don't always match ESPN's exact display name casing/city
 * abbreviations (see lib/espn-scores.ts CITY_ABBREVIATIONS), so this module
 * keys off `normalizeTeam()` from that file to resolve the ESPN
 * abbreviation reliably regardless of which upstream feed variant we saw.
 */

import { normalizeTeam } from './espn-scores';

const NFL_TEAMS: [string, string][] = [
  ['Arizona Cardinals', 'ARI'],
  ['Atlanta Falcons', 'ATL'],
  ['Baltimore Ravens', 'BAL'],
  ['Buffalo Bills', 'BUF'],
  ['Carolina Panthers', 'CAR'],
  ['Chicago Bears', 'CHI'],
  ['Cincinnati Bengals', 'CIN'],
  ['Cleveland Browns', 'CLE'],
  ['Dallas Cowboys', 'DAL'],
  ['Denver Broncos', 'DEN'],
  ['Detroit Lions', 'DET'],
  ['Green Bay Packers', 'GB'],
  ['Houston Texans', 'HOU'],
  ['Indianapolis Colts', 'IND'],
  ['Jacksonville Jaguars', 'JAX'],
  ['Kansas City Chiefs', 'KC'],
  ['Las Vegas Raiders', 'LV'],
  ['Los Angeles Chargers', 'LAC'],
  ['Los Angeles Rams', 'LAR'],
  ['Miami Dolphins', 'MIA'],
  ['Minnesota Vikings', 'MIN'],
  ['New England Patriots', 'NE'],
  ['New Orleans Saints', 'NO'],
  ['New York Giants', 'NYG'],
  ['New York Jets', 'NYJ'],
  ['Philadelphia Eagles', 'PHI'],
  ['Pittsburgh Steelers', 'PIT'],
  ['San Francisco 49ers', 'SF'],
  ['Seattle Seahawks', 'SEA'],
  ['Tampa Bay Buccaneers', 'TB'],
  ['Tennessee Titans', 'TEN'],
  ['Washington Commanders', 'WSH'],
  // Common feed variants
  ['Washington Redskins', 'WSH'],
  ['Oakland Raiders', 'LV'],
  ['San Diego Chargers', 'LAC'],
  ['St Louis Rams', 'LAR'],
];

const MLB_TEAMS: [string, string][] = [
  ['Arizona Diamondbacks', 'ARI'],
  ['Athletics', 'ATH'],
  ['Oakland Athletics', 'ATH'],
  ['Atlanta Braves', 'ATL'],
  ['Baltimore Orioles', 'BAL'],
  ['Boston Red Sox', 'BOS'],
  ['Chicago Cubs', 'CHC'],
  ['Chicago White Sox', 'CHW'],
  ['Cincinnati Reds', 'CIN'],
  ['Cleveland Guardians', 'CLE'],
  ['Cleveland Indians', 'CLE'],
  ['Colorado Rockies', 'COL'],
  ['Detroit Tigers', 'DET'],
  ['Houston Astros', 'HOU'],
  ['Kansas City Royals', 'KC'],
  ['Los Angeles Angels', 'LAA'],
  ['Los Angeles Dodgers', 'LAD'],
  ['Miami Marlins', 'MIA'],
  ['Milwaukee Brewers', 'MIL'],
  ['Minnesota Twins', 'MIN'],
  ['New York Mets', 'NYM'],
  ['New York Yankees', 'NYY'],
  ['Philadelphia Phillies', 'PHI'],
  ['Pittsburgh Pirates', 'PIT'],
  ['San Diego Padres', 'SD'],
  ['San Francisco Giants', 'SF'],
  ['Seattle Mariners', 'SEA'],
  ['St. Louis Cardinals', 'STL'],
  ['Tampa Bay Rays', 'TB'],
  ['Texas Rangers', 'TEX'],
  ['Toronto Blue Jays', 'TOR'],
  ['Washington Nationals', 'WSH'],
];

function buildIndex(pairs: [string, string][]): Map<string, string> {
  const m = new Map<string, string>();
  for (const [name, abbrev] of pairs) {
    m.set(normalizeTeam(name), abbrev);
  }
  return m;
}

const NFL_INDEX = buildIndex(NFL_TEAMS);
const MLB_INDEX = buildIndex(MLB_TEAMS);

/** Resolve an ESPN team abbreviation for MLB/NFL from any team-name feed variant. */
export function espnAbbrev(sportCode: string, teamName: string | null | undefined): string | null {
  if (!teamName) return null;
  const key = normalizeTeam(teamName);
  const code = (sportCode || '').toUpperCase();
  if (code === 'NFL') return NFL_INDEX.get(key) ?? null;
  if (code === 'MLB') return MLB_INDEX.get(key) ?? null;
  return null;
}

/** ESPN CDN logo URL for a team, or null when unsupported/unresolvable. */
export function teamLogoUrl(sportCode: string, teamName: string | null | undefined): string | null {
  const abbrev = espnAbbrev(sportCode, teamName);
  if (!abbrev) return null;
  const path = (sportCode || '').toUpperCase() === 'NFL' ? 'nfl' : 'mlb';
  return `https://a.espncdn.com/i/teamlogos/${path}/500/${abbrev.toLowerCase()}.png`;
}
