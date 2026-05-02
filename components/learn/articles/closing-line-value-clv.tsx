import * as React from 'react';

export default function Article() {
  return (
    <>
      <p>
        <strong>Closing line value</strong>, or <strong>CLV</strong>, is the difference between
        the price you bet and the price at which the market closed. If you bet the Lakers at{' '}
        <code>-4</code> and the line closed at <code>-6</code>, you have +2 points of CLV on
        that bet. Do that consistently, and you are provably beating the market — even if
        individual results are volatile.
      </p>

      <h2>Why CLV matters more than W/L</h2>
      <p>
        Win percentage is a terrible short-term signal. A sharp bettor on a bad run and a
        recreational bettor on a hot streak can have the same record for 50 bets. CLV cuts
        through the noise: because the closing line is the market's most informed price,
        consistently beating it is mathematical proof of edge.
      </p>
      <p>
        Every serious sportsbook tracks your CLV. If you're reliably getting +CLV, you
        will get limited. That's annoying, but it's also the single best signal that
        you're doing something right.
      </p>

      <h2>How to calculate CLV</h2>
      <p>There are two common methods:</p>
      <ol>
        <li>
          <strong>Point CLV (spreads / totals):</strong> Simple difference in line. Bet{' '}
          <code>-4</code>, close <code>-6</code>, CLV = +2.
        </li>
        <li>
          <strong>Probability CLV (moneyline / props):</strong> Convert both prices to implied
          probability and subtract. Bet <code>+120</code> (45.5%), close <code>+100</code>{' '}
          (50.0%), CLV = +4.5 percentage points.
        </li>
      </ol>

      <h2>How to improve your CLV</h2>
      <ul>
        <li>
          <strong>Line shop every bet.</strong> Never place without checking 2–3 books. This
          alone lifts CLV meaningfully.
        </li>
        <li>
          <strong>Act on sharp-book moves.</strong> When Pinnacle / Circa move, weaker books
          usually follow. Beat the slow books to the steam move.
        </li>
        <li>
          <strong>Bet early when you have a model edge; bet late for injury news.</strong>{' '}
          Knowing which side of the closing line to land on depends on where your information
          edge is.
        </li>
      </ul>

      <h2>Tracking CLV with Valor Odds</h2>
      <p>
        Our dashboard records the price you bet and diff it against the closing line when the
        market resolves. After a few hundred bets you will have a meaningful CLV curve — the
        closest thing sports betting has to a profit attribution chart.
      </p>

      <h2>Related reading</h2>
      <ul>
        <li>
          <a href="/learn/positive-ev-betting-explained">Positive EV betting explained</a>
        </li>
        <li>
          <a href="/learn/what-is-arbitrage-betting">What is arbitrage betting?</a>
        </li>
      </ul>
    </>
  );
}