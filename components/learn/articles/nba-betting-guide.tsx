import * as React from 'react';

export default function Article() {
  return (
    <>
      <p>
        The NBA is unique among major sports because individual-player injuries can swing spread
        and total lines by 5+ points. That makes the league extraordinarily information-sensitive
        — and one of the best places to find edge if you're fast, systematic, and ruthless
        about line shopping.
      </p>

      <h2>The NBA markets worth knowing</h2>
      <ul>
        <li>
          <strong>Spread.</strong> Shrinks and moves violently on injury news.
        </li>
        <li>
          <strong>Total.</strong> Pace and defensive rating projections drive these.
        </li>
        <li>
          <strong>Moneyline.</strong> Valuable on dogs in back-to-back spots, especially when
          the favorite is resting stars.
        </li>
        <li>
          <strong>Player props.</strong> Points, rebounds, assists, 3PM, PRA combos. The softest
          market in the NBA.
        </li>
        <li>
          <strong>Quarter / half lines.</strong> Less-modeled by books, more-modeled by sharps.
        </li>
      </ul>

      <h2>Pace and total projection</h2>
      <p>
        NBA totals are fundamentally a function of pace (possessions per game) and efficiency
        (points per possession). Build your total projection as{' '}
        <code>ppg = team_pace × team_efficiency × opp_defensive_adjustment × 2</code> and
        compare to the market.
      </p>

      <h2>The injury news game</h2>
      <p>
        The single biggest daily alpha in NBA betting is being faster than the book on lineup
        news. A star scratch moves the line 5–10 points. Subscribe to injury wire alerts, watch
        starting-lineup announcements, and act before the market reprices.
      </p>
      <p>
        Valor Odds routes real-time NBA injury alerts to Discord so you can act on news within
        seconds of it breaking.
      </p>

      <h2>Back-to-back and rest effects</h2>
      <ul>
        <li>
          Second leg of a back-to-back: -1 to -2 points on the team in question, more if
          traveling.
        </li>
        <li>
          3 games in 4 nights: meaningful fade spot, especially against rested opponents.
        </li>
        <li>
          Star rest ("load management"): books usually react but often not fully.
        </li>
      </ul>

      <h2>Player prop strategy</h2>
      <ol>
        <li>
          Build projections tied to usage, pace, and defensive matchup.
        </li>
        <li>
          Focus on players whose usage jumps due to a teammate out. Example: star out → second
          star's usage goes from 28% to 34% → points over.
        </li>
        <li>
          Combine-prop markets (PRA, PR, etc.) are the softest; single-category markets are the
          tightest.
        </li>
      </ol>

      <h2>How Valor Odds helps NBA bettors</h2>
      <ul>
        <li>Live NBA spread / total / moneyline across every book.</li>
        <li>Instant injury and lineup alerts.</li>
        <li>AI player-prop edge surfacing, tuned for usage-shift spots.</li>
        <li>NBA-specific arbitrage scanning and +EV filters.</li>
      </ul>
      <p>
        Jump to <a href="/sports/nba">NBA odds</a> or{' '}
        <a href="/arbitrage/nba">NBA arbitrage opportunities</a>.
      </p>
    </>
  );
}