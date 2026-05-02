import * as React from 'react';

export default function Article() {
  return (
    <>
      <p>
        The <strong>Kelly criterion</strong> is a bet-sizing formula developed at Bell Labs in
        1956 that tells you the fraction of your bankroll to stake given a known edge. Sized
        correctly, it maximizes long-term geometric growth of your bankroll. Sized too
        aggressively, it blows you up faster than any other strategy.
      </p>

      <h2>The formula</h2>
      <pre><code>{`f* = (bp - q) / b

where
  f* = fraction of bankroll to stake
  b  = decimal payout on the bet (e.g. +150 → 1.5)
  p  = your estimated true probability of winning
  q  = 1 - p`}</code></pre>

      <h2>A worked example</h2>
      <p>
        You find a bet at <code>+120</code> (b = 1.2) where you estimate the true probability is
        50% (p = 0.5, q = 0.5).
      </p>
      <pre><code>{`f* = (1.2 × 0.5 − 0.5) / 1.2
   = (0.6 − 0.5) / 1.2
   = 0.0833 → stake 8.3% of bankroll`}</code></pre>

      <h2>Why full Kelly is usually wrong</h2>
      <p>
        Full Kelly assumes you know the true probability exactly. In sports, you never do — your
        model has error bars. If you mis-estimate the edge, full Kelly can compound that error
        and produce wild drawdowns. Most sharp bettors use <strong>fractional Kelly</strong>:
      </p>
      <ul>
        <li>
          <strong>Half Kelly</strong> — still captures ~75% of long-run growth with about half
          the volatility. The most common choice.
        </li>
        <li>
          <strong>Quarter Kelly</strong> — for bettors whose probability estimates are noisier
          (most recreational bettors should start here).
        </li>
      </ul>

      <h2>When to bet less than Kelly suggests</h2>
      <ul>
        <li>
          Your probability estimate is an approximation, not a known truth.
        </li>
        <li>
          Bet limits at the sportsbook cap you below Kelly anyway.
        </li>
        <li>
          Multiple correlated bets are already on the board (NBA first-half totals on multiple
          correlated games, for example).
        </li>
        <li>
          Your bankroll is small relative to the typical bet limit — you need more entries to
          average through variance.
        </li>
      </ul>

      <h2>Kelly in Valor Odds</h2>
      <p>
        Each +EV opportunity we surface includes an optional Kelly-sized stake suggestion based
        on your declared bankroll and preferred fraction (quarter, half, or full). You can
        override it per bet if you want.
      </p>

      <h2>Related reading</h2>
      <ul>
        <li>
          <a href="/learn/positive-ev-betting-explained">Positive EV betting explained</a>
        </li>
        <li>
          <a href="/learn/closing-line-value-clv">Closing line value (CLV)</a>
        </li>
      </ul>
    </>
  );
}