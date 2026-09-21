/**
 * DiamondDraft — Head-to-head schedule generator.
 *
 * Pure round-robin (circle method) scheduler. Given the league's member ids
 * and a number of regular-season weeks, produces one matchup per team per
 * week (or a bye when the league has an odd number of teams).
 *
 * The schedule repeats the round-robin cycle if `weeks` exceeds the number of
 * unique rounds (n-1), which is the standard fantasy-football behaviour.
 */

export interface ScheduledMatchup {
  week: number;
  homeMemberId: string;
  awayMemberId: string;
}

/** Sentinel used internally to represent a bye in an odd-sized league. */
const BYE = '__BYE__';

/**
 * Build the base round-robin rounds (each round = n/2 pairings).
 * Uses the circle method: team 0 is fixed, the rest rotate.
 */
function roundRobinRounds(teams: string[]): [string, string][][] {
  const arr = [...teams];
  const n = arr.length;
  const rounds: [string, string][][] = [];

  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push([arr[i], arr[n - 1 - i]]);
    }
    rounds.push(pairs);
    // Rotate: keep arr[0] fixed, move the last element to index 1.
    const last = arr.pop()!;
    arr.splice(1, 0, last);
  }

  return rounds;
}

/**
 * Generate a full weekly schedule.
 *
 * @param memberIds league member ids (order does not matter)
 * @param weeks     number of regular-season weeks to schedule
 */
export function generateSchedule(memberIds: string[], weeks: number): ScheduledMatchup[] {
  if (memberIds.length < 2 || weeks < 1) return [];

  const teams = [...memberIds];
  if (teams.length % 2 !== 0) teams.push(BYE);

  const rounds = roundRobinRounds(teams);
  const out: ScheduledMatchup[] = [];

  for (let w = 1; w <= weeks; w++) {
    const round = rounds[(w - 1) % rounds.length];
    round.forEach(([a, b], i) => {
      if (a === BYE || b === BYE) return; // bye week — no matchup
      // Alternate home/away across weeks so no team is always "home".
      const flip = (w + i) % 2 === 0;
      out.push({
        week: w,
        homeMemberId: flip ? a : b,
        awayMemberId: flip ? b : a,
      });
    });
  }

  return out;
}

/** Default regular-season length by sport. */
export function defaultSeasonWeeks(sport: string): number {
  if (sport === 'MLB') return 22;
  if (sport === 'NCAAF') return 12;
  return 14; // NFL
}
