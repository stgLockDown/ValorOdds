import * as React from 'react';

export default function Article() {
  return (
    <>
      <p>
        Player prop markets (points, rebounds, assists, rushing yards, strikeouts, etc.) are
        usually the softest markets on the board. Because sportsbooks can't hedge them as
        efficiently as game lines, prop prices lag longer, move on worse information, and offer
        more mispricings — especially on non-featured players.
      </p>

      <h2>Where edge comes from</h2>
      <ol>
        <li>
          <strong>Projection edge.</strong> You (or your model) project an over/under-under range
          that's genuinely different from the posted line. This is the classic path.
        </li>
        <li>
          <strong>News edge.</strong> Lineup changes, defensive matchup shifts, and injury
          changes hit prop lines more slowly than game lines. If you watch the beat reporters,
          you can beat the book to the adjustment.
        </li>
        <li>
          <strong>Correlation edge.</strong> Correlated props (e.g., QB passing yards + top WR
          receiving yards) are often priced independently. Same-game parlays built on known
          correlations can print +EV.
        </li>
        <li>
          <strong>Recency bias.</strong> Books overreact to last week's performance.
          Players coming off two poor games often have props dragged too low.
        </li>
      </ol>

      <h2>A disciplined prop workflow</h2>
      <ol>
        <li>
          <strong>Start with a sharp consensus.</strong> Treat the Pinnacle-style sharp line as
          your anchor.
        </li>
        <li>
          <strong>Build a projection range, not a point.</strong> Estimate a central tendency
          plus error bars (e.g., points: 22 ± 5).
        </li>
        <li>
          <strong>Only bet when the book is outside your range.</strong> If your range is 22 ±
          5 and the book offers 19.5 O / 20.5 U, no edge. If they offer 17.5 O at <code>-105</code>,
          now it's interesting.
        </li>
        <li>
          <strong>Line shop aggressively.</strong> Prop prices swing across books more than any
          other market.
        </li>
        <li>
          <strong>Record everything.</strong> Track your CLV on props specifically.
        </li>
      </ol>

      <h2>How Valor Odds accelerates this</h2>
      <p>
        We pull every player prop from every tracked sportsbook, run AI projections based on
        usage, matchup, and injury context, and surface the largest gaps between our projection
        and the book line. Filter by sport, player, or minimum edge. Alerts push to Discord.
      </p>

      <h2>Related reading</h2>
      <ul>
        <li>
          <a href="/learn/positive-ev-betting-explained">Positive EV betting explained</a>
        </li>
        <li>
          <a href="/learn/closing-line-value-clv">Closing line value (CLV)</a>
        </li>
        <li>
          <a href="/learn/nba-betting-guide">NBA betting guide</a>
        </li>
      </ul>
    </>
  );
}