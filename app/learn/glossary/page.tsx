import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { buildMetadata, breadcrumbJsonLd, canonical } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export const metadata: Metadata = buildMetadata({
  title: 'Sports betting glossary — terms sharp bettors actually use',
  description:
    'Definitions for every sports betting term that matters — arbitrage, CLV, EV, juice, steam, middle, limit, Kelly, and more. Built for bettors who want to understand the language sharp bettors use.',
  path: '/learn/glossary',
  keywords: [
    'sports betting glossary',
    'sports betting terms',
    'sharp betting vocabulary',
    'betting definitions',
  ],
});

type Term = { term: string; def: string; slug?: string };

const TERMS: Term[] = [
  { term: 'Arbitrage', def: 'Placing bets on all outcomes of an event across different sportsbooks such that the combined return is positive regardless of who wins.', slug: 'what-is-arbitrage-betting' },
  { term: 'Bankroll', def: 'The total capital you have allocated specifically to sports betting. Should be money you can afford to lose.' },
  { term: 'Book / Sportsbook', def: 'A company that accepts sports wagers. DraftKings, FanDuel, Pinnacle, and BetMGM are all books.' },
  { term: 'CLV (Closing Line Value)', def: 'The difference between the price you bet and the price at which the market closed. The single best measure of long-term betting edge.', slug: 'closing-line-value-clv' },
  { term: 'Dog / Underdog', def: 'The team / side expected to lose. Typically paid out at plus-money American odds (e.g., +150).' },
  { term: 'EV (Expected Value)', def: 'The mathematically expected profit per dollar staked on a bet, averaged across all outcomes. Positive EV = +EV = profitable long-term.', slug: 'positive-ev-betting-explained' },
  { term: 'F5 (First Five)', def: 'An MLB market that settles on the score after five innings, avoiding bullpen variance.' },
  { term: 'Favorite', def: 'The team / side expected to win. Paid out at minus-money American odds (e.g., -200).' },
  { term: 'Handle', def: 'Total dollars wagered on an event or over a period.' },
  { term: 'Hedge', def: 'Placing a second bet on the opposite side to reduce risk or lock in profit on an open ticket.' },
  { term: 'Hold', def: "The sportsbook's built-in margin, also called vig or juice." },
  { term: 'Implied Probability', def: 'The probability of an outcome as priced by the sportsbook. +150 implies 40%, -200 implies 66.7%.' },
  { term: 'Juice / Vig', def: "The sportsbook's commission, baked into the price. A -110/-110 market carries about 4.5% juice." },
  { term: 'Kelly Criterion', def: 'An optimal bet-sizing formula given a known edge. Most sharp bettors use fractional (half or quarter) Kelly.', slug: 'kelly-criterion-bet-sizing' },
  { term: 'Limit', def: 'The maximum stake a sportsbook will accept on a bet. Sharp bettors routinely get limited below recreational limits.' },
  { term: 'Line Shopping', def: 'Comparing prices across multiple sportsbooks to get the best number available on a bet.' },
  { term: 'Middling', def: 'Betting both sides of a moved line (e.g., +3 and -4) so that both bets can win if the final margin falls in between.' },
  { term: 'Moneyline', def: 'A bet on who wins outright, with no spread involved.' },
  { term: 'Parlay', def: 'A combined bet on multiple selections. All legs must hit to win. High variance, typically high hold.' },
  { term: "Pick'em", def: 'A game with no favorite — prices set at even odds.' },
  { term: 'Player Prop', def: "A bet on an individual player's performance (yards, points, rebounds, strikeouts, etc.).", slug: 'player-props-edge' },
  { term: 'Push', def: 'A tie — the final score lands exactly on the spread or total, returning your stake.' },
  { term: 'Reverse Line Movement', def: 'When the line moves opposite to the public betting percentage, usually indicating sharp money on the other side.' },
  { term: 'Same-Game Parlay (SGP)', def: 'A parlay built from multiple bets in the same game. Books usually price these assuming independence, even when outcomes correlate.' },
  { term: 'Sharp', def: "A bettor (or sportsbook) that's informed, disciplined, and long-term profitable." },
  { term: 'Spread', def: 'A handicap applied to a game to balance the two sides (e.g., -6.5). You cover the spread or fail to.' },
  { term: 'Square', def: 'A casual / recreational bettor. Often used to describe the direction public money flows.' },
  { term: 'Steam', def: 'Rapid, coordinated line movement across many books, driven by sharp action or new information.' },
  { term: 'Teaser', def: "A parlay variant that lets you adjust each leg's spread by a fixed number of points in your favor, at the cost of lower payouts." },
  { term: 'Total (Over/Under)', def: 'A bet on whether the combined score of both teams will be over or under a set number.' },
  { term: 'Unit', def: 'A standardized bet size relative to your bankroll. Most bettors size a unit at 1% of bankroll.' },
];

export default function GlossaryPage() {
  const groups = TERMS.reduce<Record<string, Term[]>>((acc, t) => {
    const letter = t.term[0].toUpperCase();
    (acc[letter] ??= []).push(t);
    return acc;
  }, {});
  const letters = Object.keys(groups).sort();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: canonical('/') },
          { name: 'Learn', url: canonical('/learn') },
          { name: 'Glossary', url: canonical('/learn/glossary') },
        ])}
      />
      <Navbar />

      <main className="container-px mx-auto max-w-4xl py-12">
        <nav aria-label="Breadcrumb" className="text-xs text-brand-muted mb-6">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/learn" className="hover:underline">Learn</Link>
          <span className="mx-2">/</span>
          <span className="text-white">Glossary</span>
        </nav>

        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">Learn</div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold">
            Sports betting glossary
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            Every term a sharp bettor actually uses, in plain English. Hyperlinked to full guides
            where they exist.
          </p>
        </header>

        <nav
          aria-label="Glossary letters"
          className="mt-8 flex flex-wrap gap-2 text-sm"
        >
          {letters.map((l) => (
            <a
              key={l}
              href={`#${l}`}
              className="rounded-md border border-brand-border bg-brand-surface px-3 py-1 font-mono font-semibold hover:border-brand-accent"
            >
              {l}
            </a>
          ))}
        </nav>

        <div className="mt-10 space-y-12">
          {letters.map((l) => (
            <section key={l} id={l}>
              <h2 className="text-3xl font-extrabold text-brand-accent">{l}</h2>
              <dl className="mt-4 space-y-5">
                {groups[l].map((t) => (
                  <div key={t.term}>
                    <dt className="font-bold">
                      {t.slug ? (
                        <Link href={`/learn/${t.slug}`} className="hover:underline">
                          {t.term}
                        </Link>
                      ) : (
                        t.term
                      )}
                    </dt>
                    <dd
                      className="mt-1 text-brand-muted"
                      dangerouslySetInnerHTML={{ __html: t.def }}
                    />
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </main>

      <Footer />
    </>
  );
}