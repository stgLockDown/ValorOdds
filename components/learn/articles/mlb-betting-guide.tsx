import * as React from 'react';

export default function Article() {
  return (
    <>
      <p>
        Major League Baseball is the most data-rich sport in the world, which means it's
        also one of the most over-modeled. That makes finding edge hard on raw game lines, but
        it leaves plenty of room on specific markets where books still lag. Here's a
        practical, sharp-leaning guide.
      </p>

      <h2>The five MLB markets worth knowing</h2>
      <ul>
        <li>
          <strong>Moneyline.</strong> Who wins. Heavy public action, tight market. Edge is hard
          but real on short favorites priced inside -130 against public dogs.
        </li>
        <li>
          <strong>Run line.</strong> -1.5 / +1.5 spread. Often mispriced relative to moneyline
          because casual bettors over-weight the -1.5 price.
        </li>
        <li>
          <strong>Totals (O/U).</strong> Where weather and umpire effects create the most
          pre-game edge. See below.
        </li>
        <li>
          <strong>First Five Innings (F5).</strong> Removes bullpen variance. If you trust the
          starters more than the relievers, F5 lines are cleaner.
        </li>
        <li>
          <strong>Player props.</strong> Strikeouts, total bases, hits. Soft. See our{' '}
          <a href="/learn/player-props-edge">prop guide</a>.
        </li>
      </ul>

      <h2>Factors that move MLB markets</h2>
      <ol>
        <li>
          <strong>Starting pitcher changes.</strong> Scratched starters shift totals 0.5–1.5
          runs instantly. Beat the book to confirmed lineup news.
        </li>
        <li>
          <strong>Weather.</strong> Wind direction and speed at hitter-friendly parks (Wrigley,
          Coors, Great American) moves totals meaningfully. Wind out at Wrigley + 15mph adds
          ~0.4 expected runs.
        </li>
        <li>
          <strong>Umpires.</strong> Plate umps have wildly different zones. A tight strike-zone
          ump pushes totals higher (more walks, more runs).
        </li>
        <li>
          <strong>Bullpen usage.</strong> A team that used its high-leverage arms the last two
          nights will likely rely on middle relief tonight — value on the opposing side.
        </li>
        <li>
          <strong>Travel / rest.</strong> Team on the end of a west-to-east road trip with a day
          game after a night game is a real fade spot.
        </li>
      </ol>

      <h2>F5 and the bullpen</h2>
      <p>
        Full-game MLB lines embed bullpen variance, which is genuinely random. First-Five-Inning
        markets are a cleaner projection because they're essentially a starter-vs-starter
        bet. If you trust one starter and don't want to carry bullpen risk, F5 is the
        right market.
      </p>

      <h2>Totals strategy</h2>
      <p>
        Totals are usually where MLB edge lives for sharp bettors. Build (or subscribe to) a
        projection that blends starter xFIP, lineup wRC+ vs the specific handedness, bullpen
        recent usage, park factor, weather, and the plate umpire. Bet against books that haven't
        factored a late-breaking wind shift or ump change.
      </p>

      <h2>How Valor Odds helps MLB bettors</h2>
      <ul>
        <li>
          Live moneyline, run-line, totals, and F5 odds across every major sportsbook.
        </li>
        <li>Automatic arbitrage scanning on MLB markets.</li>
        <li>AI-powered pitcher and hitter props with matchup-aware projections.</li>
        <li>Injury and lineup alerts pushed to Discord as soon as they break.</li>
      </ul>
      <p>
        See <a href="/sports/mlb">our MLB hub</a> for live odds or{' '}
        <a href="/arbitrage/mlb">MLB arbitrage opportunities</a>.
      </p>
    </>
  );
}