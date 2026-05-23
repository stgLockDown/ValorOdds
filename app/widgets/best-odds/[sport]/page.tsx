import { notFound } from 'next/navigation';
import { SPORTS, SITE, canonical } from '@/lib/seo';
import { getBestOddsBySportMarket, fmtAmerican } from '@/lib/public-data';

/**
 * Embeddable "best odds" widget.
 *
 * Designed for third-party embedding via <iframe> on partner blogs,
 * podcaster sites, and affiliate landing pages. Every render:
 *   - renders a compact best-price table for a given sport (moneyline).
 *   - carries a visible "Powered by Valor Odds" link (backlink equity).
 *   - is noindex'd (see app/widgets/layout.tsx).
 *   - overrides X-Frame-Options via next.config.mjs so the iframe is
 *     actually allowed to render on any origin.
 *
 * Revalidation: 120s via the cached public-data layer. Partners get fresh
 * odds automatically — no API key or maintenance required on their end.
 *
 * Routes:
 *   /widgets/best-odds/mlb
 *   /widgets/best-odds/nfl
 *   ...
 */

export const revalidate = 120;

export function generateStaticParams() {
  return SPORTS.map((s) => ({ sport: s.slug }));
}

const THEMES = {
  dark: {
    bg: '#0A1628',
    panel: '#0F1E33',
    border: '#1E3A5F',
    text: '#E5EEF8',
    muted: '#8AA0BC',
    accent: '#4FD1C5',
  },
  light: {
    bg: '#FFFFFF',
    panel: '#F8FAFC',
    border: '#E2E8F0',
    text: '#0F172A',
    muted: '#64748B',
    accent: '#0EA5E9',
  },
} as const;

type ThemeKey = keyof typeof THEMES;

function resolveTheme(v: string | string[] | undefined): ThemeKey {
  const s = Array.isArray(v) ? v[0] : v;
  return s === 'light' ? 'light' : 'dark';
}

export default async function WidgetBestOdds({
  params,
  searchParams,
}: {
  params: { sport: string };
  searchParams: { theme?: string; limit?: string; ref?: string };
}) {
  const sport = SPORTS.find((s) => s.slug === params.sport);
  if (!sport) notFound();

  const theme = THEMES[resolveTheme(searchParams.theme)];
  const limit = Math.min(Math.max(parseInt(searchParams.limit ?? '6', 10) || 6, 3), 12);
  const refTag = (searchParams.ref ?? 'embed').replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
  const utm = `?utm_source=widget&utm_medium=embed&utm_campaign=best-odds&utm_content=${refTag}`;

  let rows: Awaited<ReturnType<typeof getBestOddsBySportMarket>> = [];
  try {
    rows = await getBestOddsBySportMarket(sport.code, 'MONEYLINE', limit);
  } catch {
    rows = [];
  }

  const sportHubUrl = `${SITE.url}/sports/${sport.slug}${utm}`;
  const attributionUrl = `${SITE.url}${utm}`;

  return (
    <main
      style={{
        margin: 0,
        padding: 16,
        background: theme.bg,
        color: theme.text,
        minHeight: 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: theme.muted, textTransform: 'uppercase' }}>
            Best {sport.fullName} Moneyline
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Live across sportsbooks</div>
        </div>
        <a
          href={sportHubUrl}
          target="_blank"
          rel="noopener"
          style={{
            fontSize: 12,
            color: theme.accent,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          See all →
        </a>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            border: `1px solid ${theme.border}`,
            background: theme.panel,
            borderRadius: 8,
            padding: 16,
            fontSize: 13,
            color: theme.muted,
          }}
        >
          No upcoming {sport.fullName} games at this time.{' '}
          <a
            href={sportHubUrl}
            target="_blank"
            rel="noopener"
            style={{ color: theme.accent }}
          >
            Check the full board →
          </a>
        </div>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: theme.muted, fontWeight: 500 }}>
                Matchup
              </th>
              <th style={{ textAlign: 'right', padding: '8px 12px', color: theme.muted, fontWeight: 500 }}>
                Best price
              </th>
              <th style={{ textAlign: 'right', padding: '8px 12px', color: theme.muted, fontWeight: 500 }}>
                Book
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              // Pick the best-priced outcome (highest American-odds value).
              const best = r.outcomes.reduce(
                (a, b) => (b.price > a.price ? b : a),
                r.outcomes[0],
              );
              const matchup = `${r.awayTeam} @ ${r.homeTeam}`;
              return (
                <tr
                  key={r.gameId ?? i}
                  style={{ borderTop: `1px solid ${theme.border}` }}
                >
                  <td style={{ padding: '10px 12px' }}>{matchup}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmtAmerican(best?.price ?? 0)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: theme.muted }}>
                    {best?.bookmaker ?? '\u2014'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div
        style={{
          marginTop: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: theme.muted,
        }}
      >
        <span>Updated live · 21+ · Gamble responsibly</span>
        <a
          href={attributionUrl}
          target="_blank"
          rel="noopener"
          style={{ color: theme.muted, textDecoration: 'none' }}
        >
          Powered by{' '}
          <span style={{ color: theme.accent, fontWeight: 600 }}>Valor Odds</span>
        </a>
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: { params: { sport: string } }) {
  const sport = SPORTS.find((s) => s.slug === params.sport);
  if (!sport) return {};
  return {
    title: `Best ${sport.fullName} Odds Widget`,
    description: `Embeddable best ${sport.fullName} moneyline widget powered by Valor Odds.`,
    alternates: { canonical: canonical(`/widgets/best-odds/${sport.slug}`) },
    robots: { index: false, follow: true },
  };
}