export default function Article() {
  return (
    <>
      <p>
        <strong>Arbitrage betting</strong> (also called <em>arbing</em> or a{' '}
        <em>surebet</em>) is the practice of placing bets on every possible outcome of an event
        across different sportsbooks so that no matter which side wins, the combined payout is
        greater than the combined stake. Done correctly, it is a mathematically risk-free profit.
      </p>

      <h2>Why arbitrage exists</h2>
      <p>
        Sportsbooks do not all price markets identically. Each book sets its own line based on
        its own model, its own customer base, and its own liability. When two books disagree
        enough, the combined prices imply a probability of less than 100% — and a bettor can
        capture that gap.
      </p>

      <h2>A simple example</h2>
      <p>
        Suppose an NBA game has two outcomes and two sportsbooks price the moneyline as follows:
      </p>
      <ul>
        <li>
          <strong>Book A — Home team:</strong> <code>+120</code> (implied probability ~45.5%).
        </li>
        <li>
          <strong>Book B — Away team:</strong> <code>+110</code> (implied probability ~47.6%).
        </li>
      </ul>
      <p>
        Combined implied probability is ~93.1%, which means there is roughly a 6.9% risk-free
        edge. With the right stake split across both sides, you lock in profit regardless of the
        outcome.
      </p>

      <h2>How to calculate the stake split</h2>
      <p>
        The stake on each side should be inversely proportional to its decimal odds. Given total
        bankroll <code>B</code> and decimal odds <code>d1</code> and <code>d2</code>:
      </p>
      <pre><code>stake1 = B × (1/d1) / (1/d1 + 1/d2)
stake2 = B × (1/d2) / (1/d1 + 1/d2)</code></pre>
      <p>
        Valor Odds does this math for you and displays the exact stake for each book the moment
        an opportunity appears.
      </p>

      <h2>Where arbitrage opportunities come from</h2>
      <ol>
        <li>
          <strong>Promotional boosts.</strong> A book offers an inflated price to attract
          customers, but a competing book has not moved. This is the most common retail-friendly
          source.
        </li>
        <li>
          <strong>Line lag.</strong> Sharp money hits one book and the line moves. Slower books
          do not move for seconds or even minutes, creating a gap.
        </li>
        <li>
          <strong>Market inefficiency in lower-profile sports.</strong> Secondary leagues, minor
          leagues, and early-week college lines often have wider disagreement between books.
        </li>
      </ol>

      <h2>The risks bettors forget</h2>
      <p>
        Arbitrage is only "risk-free" if every leg lands. The real-world risks are:
      </p>
      <ul>
        <li>
          <strong>Line moves before you place both legs.</strong> The price on the second book
          disappears while you are still clicking. Fast execution matters.
        </li>
        <li>
          <strong>Bet limits or voids.</strong> Some books void bets on obvious pricing errors,
          or limit winning accounts.
        </li>
        <li>
          <strong>Stale lines.</strong> An odds feed shows a price that no longer exists at the
          book.
        </li>
      </ul>

      <h2>How Valor Odds helps</h2>
      <p>
        We scan dozens of sportsbooks in real time and surface every arbitrage opportunity above
        a configurable edge threshold. Each opportunity comes with the exact stake split, the
        combined return, and deep links to the two (or more) books. Our average alert latency is
        under a second, which is the single most important factor for capturing arbitrage before
        lines correct.
      </p>

      <h2>Related reading</h2>
      <ul>
        <li>
          <a href="/learn/positive-ev-betting-explained">What is +EV betting?</a>
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