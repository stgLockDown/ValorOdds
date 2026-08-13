/**
 * Odds formatting helpers honoring the user's `web_user_preferences.odds_format`.
 *
 * The Discord bot stores American odds (integer like +150 / -122) in:
 *   - odds_snapshots.outcome_price
 *   - custom_api_compare.best_home_odds / best_away_odds
 *   - custom_api_events.raw_data.sportsbooks.{Book}.markets[].outcomes[].price_american
 *
 * The website's dashboard receives those raw American integers, so any
 * conversion to decimal / fractional has to happen at render time. This
 * module is the single source of truth for that conversion so the user's
 * "American odds, not European odds" preference is honored everywhere.
 */

export type OddsFormat = 'american' | 'decimal' | 'fractional';

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/**
 * Widest realistic bound for an American odds price. Some upstream feed
 * rows (notably a prediction-market source) occasionally write placeholder
 * values like +199900 / -200000 instead of a real spread price, and a raw
 * "0" occasionally appears where a price failed to resolve. Neither is a
 * valid American odds value, so we treat both as missing data rather than
 * rendering them (QA audit: "Invalid odds values on Moneyline page").
 */
const MAX_VALID_AMERICAN_ODDS = 100000;

function toAmericanInt(price: number | string | null | undefined): number | null {
  if (price === null || price === undefined || price === '') return null;
  const n = typeof price === 'string' ? parseFloat(price) : price;
  if (!isFiniteNumber(n)) return null;
  if (n === 0) return null;
  if (Math.abs(n) > MAX_VALID_AMERICAN_ODDS) return null;
  return Math.round(n);
}

/** American odds → decimal odds (multiplier including the stake). */
export function americanToDecimal(american: number): number {
  if (american >= 100) return american / 100 + 1;
  if (american <= -100) return 100 / Math.abs(american) + 1;
  // Value between -100 and 100 is invalid American odds; treat as even.
  return 2;
}

/** American odds → fractional string (e.g. "5/2", "1/4"). */
export function americanToFractional(american: number): string {
  if (american === 0) return '—';
  // Underdog (positive): american / 100
  // Favorite (negative): 100 / |american|
  let num: number;
  let den: number;
  if (american > 0) {
    num = american;
    den = 100;
  } else {
    num = 100;
    den = Math.abs(american);
  }
  // Reduce the fraction
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(Math.round(num), Math.round(den)) || 1;
  return `${Math.round(num / g)}/${Math.round(den / g)}`;
}

/**
 * Format any odds value (string or number) according to the user's
 * preferred display format. Always assumes the input is American odds
 * because that's what the bot stores. Returns "-" for missing data so
 * tables don't break.
 */
export function formatOddsByPref(
  price: number | string | null | undefined,
  format: OddsFormat = 'american',
): string {
  const american = toAmericanInt(price);
  if (american === null) return '—';

  switch (format) {
    case 'decimal':
      return americanToDecimal(american).toFixed(2);
    case 'fractional':
      return americanToFractional(american);
    case 'american':
    default:
      return american > 0 ? `+${american}` : `${american}`;
  }
}

/**
 * Tailwind text color class for an odds value. Positive (underdog) uses
 * green, negative (favorite) uses the brand primary color. Works on any
 * format because we resolve back to American before deciding sign.
 */
export function oddsColorClass(price: number | string | null | undefined): string {
  const american = toAmericanInt(price);
  if (american === null) return 'text-brand-muted';
  return american > 0 ? 'text-green-400' : 'text-brand-primary';
}
