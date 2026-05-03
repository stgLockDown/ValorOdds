# Data journalism briefs

Data-first stories we can pitch journalists. Each one is a
"hook + dataset + chart" package. Goal: earn high-authority backlinks from
tier-one sports business publications by being the source for a story,
not the subject.

**The pattern:** pull a clean, shareable CSV, write a 500-word summary,
pitch it. If the reporter runs with it, they cite our data — which means
they link to us.

## Playbook for each brief

1. Write the hook (1 sentence the journalist could use as the subhead).
2. Pull the raw data to a CSV, host it at `valorodds.com/data/<slug>.csv`.
3. Generate the hero chart (PNG + SVG) via our internal charting tooling.
4. Write the 500-word summary (methodology + top 3 findings).
5. Email it to the tier-1 list (`pitch-journalists.md` Template 2).
6. Post the summary on our blog with the dataset linked.

Journalists mostly want: a headline number, a chart, and the CSV.

---

## Brief 1 — "The $X a US sports bettor leaves on the table by not line shopping"

**Hook.** The average bettor sticks to one sportsbook. We tracked [N]
moneyline markets across 30+ books and found the median price gap was [X]
American-odds points — which compounds to [Y]% of annual bankroll for a
typical retail bettor.

**Dataset.** Per-book moneyline prices at lock time for every major US
game over [period]. Columns: `event_id, sport, matchup, book, price,
locked_at`.

**Findings.**
1. Median gap between best and worst available price.
2. Which books most frequently have the best price (by sport).
3. Total dollar cost of not line-shopping, per average $100/game bettor
   over a 162-game MLB season / 17-game NFL season.

**Chart.** Histogram of price-gap distribution (American-odds units on X,
frequency on Y), plus a table of "best-price win rate by book."

**Pitchable angle:** "Retail sports bettors leave $X on the table annually
by not comparing prices, new data shows."

---

## Brief 2 — "Where arbitrage is actually hiding"

**Hook.** Arbitrage is supposed to be vanishing as books sync. Our data
shows the opposite in one segment: [specific market or sport].

**Dataset.** All arbitrage opportunities our system detected over the
last 90 days. Columns: `sport, market, edge_pct, duration_seconds,
books_involved, detected_at`.

**Findings.**
1. Which sport has the most arbitrage per day.
2. Median edge (%) per sport.
3. How quickly an opportunity disappears (p50, p95, p99 lifetime).
4. Books most frequently on one side of a valid arb (reveals the softer
   books).

**Chart.** Bar chart of daily arbitrage count by sport + line chart of
median edge-%-over-time.

**Pitchable angle:** "Despite book consolidation, arbitrage opportunities
in [sport] are up [X]% in [year] — here's why."

---

## Brief 3 — "The player prop gold rush"

**Hook.** Player props now account for [X]% of handle at major US books
but prices vary wildly — we measured the spread.

**Dataset.** Same-player, same-prop, same-event prices across books for
one season in [NBA/NFL/MLB]. Columns: `player_id, prop_type, line, book,
over_price, under_price, game_id`.

**Findings.**
1. Average disagreement between books on the same prop (in American-odds
   units).
2. Which prop types have the widest disagreement (usually anytime-TD,
   longest-made-shot, first-TD-scorer).
3. The books that are slowest to move on sharp action.

**Chart.** Scatter plot of "book disagreement" by prop type.

**Pitchable angle:** "Player props are the new wild west of US sports
betting — books disagree by [X] odds points on average."

---

## Brief 4 — "Line movement in the 15 minutes before kickoff"

**Hook.** Sharp money floods books in the final 15 minutes. Our data
shows by how much — and which books absorb it.

**Dataset.** Every 30-second odds snapshot for the final hour of every
NFL / NBA game over [period]. Columns: `event_id, book, market, price,
snapshot_at`.

**Findings.**
1. Average absolute price movement in the final 15 minutes.
2. Which books move first (the sharpest books).
3. Which books move last (the books with the best close-to-close CLV
   opportunities for sharp bettors).

**Chart.** Faceted line chart showing price movement for each book over
the final hour of a representative game.

**Pitchable angle:** "Sharp money shapes the final 15 minutes — here's
how much the line moves, by book."

---

## Brief 5 — "What the books don't want you to know: closing line value by user tier"

**Hook.** Sportsbooks limit winning customers. We used CLV data to show
how small an edge you need before you get limited.

**Dataset.** Synthetic / anonymous — pulled from our user cohort (with
explicit opt-in). Buckets users by CLV %, tracks account-action status
(open, reduced, closed) across major books.

**Findings.**
1. The CLV threshold at which accounts start getting limited, by book.
2. Average time from "first winning bet" to "first limit," by book.
3. Books that never limit vs. books that limit within weeks.

**Chart.** Survival curve — probability of account remaining unlimited
vs. CLV percentile.

**Pitchable angle:** "You don't have to be a pro to get limited: new
data on when sportsbooks shut down winning accounts."

---

## Measurement

Track pitches in the same spreadsheet as affiliate outreach, with an
extra column: `dataset_cited?`. Even if a reporter doesn't link, if they
cite our dataset it's still valuable — it's the first step.

Target: **one tier-1 data journalism hit per quarter.** A single Legal
Sports Report or SBC Americas citation is worth months of cold outreach.