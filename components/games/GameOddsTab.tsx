import {
  getFullOddsBreakdown,
  fmtAmerican,
  type GameCard,
} from '@/lib/games-data';

/**
 * Odds tab — every sportsbook's price for moneyline / spread / total,
 * broken out side-by-side. Best price in each column is highlighted.
 */
export default async function GameOddsTab({ game }: { game: GameCard }) {
  const books = await getFullOddsBreakdown(game.sport, game.gameId, game.homeTeam, game.awayTeam);

  // Pre-compute best price per column for highlighting.
  const bestAwayMl = Math.max(...books.map((b) => b.moneyline.away ?? -Infinity));
  const bestHomeMl = Math.max(...books.map((b) => b.moneyline.home ?? -Infinity));
  const bestAwaySpreadPrice = Math.max(...books.map((b) => b.spread.away.price ?? -Infinity));
  const bestHomeSpreadPrice = Math.max(...books.map((b) => b.spread.home.price ?? -Infinity));
  const bestOverPrice = Math.max(...books.map((b) => b.total.over.price ?? -Infinity));
  const bestUnderPrice = Math.max(...books.map((b) => b.total.under.price ?? -Infinity));

  if (books.length === 0) {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">
        No odds data available for this game yet. Odds typically appear 24–48 hours before kickoff / first pitch.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-brand-border bg-brand-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-border bg-brand-elevated/40 text-xs uppercase tracking-wider text-brand-muted">
            <th rowSpan={2} className="px-3 py-3 text-left">Sportsbook</th>
            <th colSpan={2} className="px-3 py-2 text-center border-l border-brand-border">Moneyline</th>
            <th colSpan={2} className="px-3 py-2 text-center border-l border-brand-border">Spread</th>
            <th colSpan={2} className="px-3 py-2 text-center border-l border-brand-border">Total</th>
          </tr>
          <tr className="border-b border-brand-border bg-brand-elevated/40 text-[11px] text-brand-muted">
            <th className="px-3 py-2 text-center border-l border-brand-border">{shortName(game.awayTeam)}</th>
            <th className="px-3 py-2 text-center">{shortName(game.homeTeam)}</th>
            <th className="px-3 py-2 text-center border-l border-brand-border">{shortName(game.awayTeam)}</th>
            <th className="px-3 py-2 text-center">{shortName(game.homeTeam)}</th>
            <th className="px-3 py-2 text-center border-l border-brand-border">Over</th>
            <th className="px-3 py-2 text-center">Under</th>
          </tr>
        </thead>
        <tbody>
          {books.map((b) => (
            <tr key={b.bookmaker} className="border-b border-brand-border last:border-0 hover:bg-brand-elevated/30">
              <td className="px-3 py-2.5 font-medium">{b.bookmaker}</td>
              <MlCell price={b.moneyline.away} best={bestAwayMl} />
              <MlCell price={b.moneyline.home} best={bestHomeMl} />
              <SpreadCell point={b.spread.away.point} price={b.spread.away.price} best={bestAwaySpreadPrice} />
              <SpreadCell point={b.spread.home.point} price={b.spread.home.price} best={bestHomeSpreadPrice} />
              <TotalCell point={b.total.over.point} price={b.total.over.price} best={bestOverPrice} />
              <TotalCell point={b.total.under.point} price={b.total.under.price} best={bestUnderPrice} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortName(team: string): string {
  const parts = String(team || '').split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : team;
}

function MlCell({ price, best }: { price: number | null; best: number }) {
  if (price == null) return <td className="px-3 py-2.5 text-center text-brand-muted">—</td>;
  const isBest = price === best && price > 0;
  return (
    <td className={`px-3 py-2.5 text-center font-mono ${isBest ? 'text-brand-accent font-bold' : 'text-brand-text'}`}>
      {fmtAmerican(price)}
    </td>
  );
}

function SpreadCell({ point, price, best }: { point: number | null; price: number | null; best: number }) {
  if (point == null && price == null) return <td className="px-3 py-2.5 text-center text-brand-muted">—</td>;
  const isBest = price != null && price === best && price > 0;
  return (
    <td className={`px-3 py-2.5 text-center font-mono ${isBest ? 'text-brand-accent font-bold' : 'text-brand-text'}`}>
      {point != null ? `${point > 0 ? '+' : ''}${point}` : ''}{' '}
      <span className="text-xs text-brand-muted">{price != null ? fmtAmerican(price) : ''}</span>
    </td>
  );
}

function TotalCell({ point, price, best }: { point: number | null; price: number | null; best: number }) {
  if (point == null && price == null) return <td className="px-3 py-2.5 text-center text-brand-muted">—</td>;
  const isBest = price != null && price === best && price > 0;
  return (
    <td className={`px-3 py-2.5 text-center font-mono ${isBest ? 'text-brand-accent font-bold' : 'text-brand-text'}`}>
      {point != null ? `O${point}` : ''}{' '}
      <span className="text-xs text-brand-muted">{price != null ? fmtAmerican(price) : ''}</span>
    </td>
  );
}
