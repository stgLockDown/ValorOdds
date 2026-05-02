import * as React from 'react';

export default function Article() {
  return (
    <>
      <p>
        <strong>Positive EV betting</strong> (also written <em>+EV</em>) is the practice of only
        placing bets where the expected value is mathematically positive — meaning, over a large
        enough sample, the bet makes money. Every long-term profitable bettor operates on some
        version of this principle. Everything else — bankroll management, line shopping,
        arbitrage — exists to maximize and protect that edge.
      </p>

      <h2>The formula</h2>
      <p>Expected value of a bet is:</p>
      <pre><code>EV = (probability of winning × profit if win) - (probability of losing × stake)</code></pre>
      <p>
        If that number is positive, the bet is <em>+EV</em>. If it's negative, it's{' '}
        <em>-EV</em> and you should not place it, no matter how confident you feel.
      </p>

      <h2>A concrete example</h2>
      <p>
        A sportsbook offers an NBA moneyline at <code>+120</code>. Implied probability from the
        price is ~45.5%. Your model (or a sharper book's line) says the true probability is
        actually 50%.
      </p>
      <ul>
        <li>
          <strong>EV per $100 stake:</strong> (0.50 × $120) − (0.50 × $100) = $60 − $50 = <strong>$10 per bet</strong>.
        </li>
        <li>
          That's a 10% edge. Over 1,000 bets, you'd expect roughly $10,000 in profit.
        </li>
      </ul>

      <h2>How to find +EV bets in the real world</h2>
      <p>Two practical approaches:</p>
      <ol>
        <li>
          <strong>Build a model.</strong> Forecast true probabilities yourself (stats, power
          ratings, injury adjustments) and compare to market prices. Any bet where your estimate
          materially exceeds the implied probability is +EV.
        </li>
        <li>
          <strong>Use sharp books as your reference.</strong> Pinnacle, Circa, and a few others
          run with tighter margins and attract sharp action — their lines are considered close to
          "true" prices. If a recreational book lags the sharp line, you can exploit
          the gap. This is the core insight behind Valor Odds' +EV scanner.
        </li>
      </ol>

      <h2>Variance is real</h2>
      <p>
        A +EV bet can still lose. A +EV bettor with a 5% edge might still lose 40 bets in a row
        during normal variance. This is why bankroll management (see our{' '}
        <a href="/learn/kelly-criterion-bet-sizing">Kelly criterion guide</a>) matters more than
        any single wager.
      </p>

      <h2>How Valor Odds surfaces +EV</h2>
      <p>
        We continuously compare recreational-book prices against sharp consensus lines and
        surface the largest edges. Each opportunity shows the edge percentage, the sharp
        reference price, the book where you can place the bet, and an optional Kelly-sized stake
        recommendation. Alerts ship to Discord and the web in under a second.
      </p>

      <h2>Related reading</h2>
      <ul>
        <li>
          <a href="/learn/what-is-arbitrage-betting">What is arbitrage betting?</a>
        </li>
        <li>
          <a href="/learn/closing-line-value-clv">Closing line value (CLV)</a>
        </li>
        <li>
          <a href="/learn/kelly-criterion-bet-sizing">Kelly criterion & bet sizing</a>
        </li>
      </ul>
    </>
  );
}