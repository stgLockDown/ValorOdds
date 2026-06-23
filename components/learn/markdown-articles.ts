/**
 * Markdown-authored Learn articles.
 *
 * Add a new SEO article by appending an entry here — no TSX required. The
 * `slug` must match a corresponding entry in ARTICLE_MANIFEST (manifest.ts).
 * Bodies are rendered by <MarkdownArticle>.
 */

export const MARKDOWN_ARTICLES: Record<string, string> = {
  'best-odds-comparison-guide': `
Shopping for the best line is the single most reliable habit a sports bettor
can build. It does not require predicting games better than anyone else — it
just requires never accepting a worse price than the market offers. This guide
explains **odds comparison**, why it quietly compounds into a large edge, and
how to do it in seconds with Valor Odds.

## What "line shopping" actually means

Every sportsbook prices the same game slightly differently. One book might post
the Yankees at \`-130\` while another has them at \`-118\`. Both are betting on
the exact same outcome — but the \`-118\` price pays you more for every dollar
risked. Over hundreds of bets, consistently taking the better number is the
difference between a losing and a winning year.

## Why a few cents of odds matter so much

Sportsbook margin (the "vig" or "juice") is typically 4–5% on a standard
two-way market. If you always bet into the best available price across many
books, you can cut the effective vig dramatically — sometimes to nearly zero on
the sharpest markets. A bettor who wins 53% of bets at \`-110\` is roughly
break-even; the same bettor getting \`-104\` on average is solidly profitable.
Nothing about their handicapping changed — only the price they paid.

## How to compare odds the fast way

1. **Pick your game and market** (moneyline, spread, total, or a player prop).
2. **See every book's price side by side.** Valor Odds aggregates the major
   books in real time so you don't tab between a dozen apps.
3. **Take the best number** — and confirm it's still live before you bet, since
   lines move.

## Where odds comparison becomes arbitrage

When two books disagree enough that betting *both* sides locks in a profit,
line shopping becomes [arbitrage](/learn/what-is-arbitrage-betting). When the
best available price simply beats the true probability, it becomes a
[+EV bet](/learn/positive-ev-betting-explained). Both start from the same
discipline: never bet blind to the rest of the market.

## Try it now

Open any [sport hub](/sports) to see live best-price tables, or jump straight
to [live arbitrage](/arbitrage) to see where the books currently disagree.
`.trim(),

  'how-sportsbooks-set-odds': `
To beat the market you first have to understand how the market is made. This
article walks through **how sportsbooks set and move odds**, what the vig is,
and how that knowledge helps you find value.

## Step 1: the opening line

A book's traders (and increasingly, models) set an **opening line** that
reflects their best estimate of the true probability of each outcome, then add
a margin. Sharp books open early with lower limits; recreational books often
copy the sharp number.

## Step 2: the margin (vig / juice)

A fair coin flip is \`+100\` on each side (50% implied each, summing to 100%).
A book instead posts something like \`-110 / -110\`, which implies ~52.4% per
side — about **104.8% total**. That extra ~4.8% is the **overround**: the
book's built-in margin. Your job as a bettor is to find prices where the
*true* probability is higher than the *implied* probability after vig.

## Step 3: line movement

After opening, the line moves for two reasons:

- **Money:** heavy action on one side shifts the price to balance the book's
  liability.
- **Information:** injuries, lineup news, weather, and sharp bets update the
  true probability.

Tracking how a line moves from open to close tells you whether your bet had
[closing line value](/learn/closing-line-value-clv) — the best long-run
predictor of winning.

## Step 4: where your edge comes from

You don't need to out-model the sharpest book. You need to:

1. **Shop for the best price** across books (see our
   [odds comparison guide](/learn/best-odds-comparison-guide)).
2. **Bet before the line corrects** when you have information or a stale price.
3. **Exploit disagreement** between books via
   [arbitrage](/learn/what-is-arbitrage-betting) and
   [+EV](/learn/positive-ev-betting-explained).

## How Valor Odds helps

Valor Odds tracks every line from open to close across the major books, flags
arbitrage and +EV opportunities the instant they appear, and layers AI
player-prop analysis on top — so you can act on a mispriced number before it
moves. Start on a [sport hub](/sports) or watch the
[live arbitrage feed](/arbitrage).
`.trim(),
};
