import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { JsonLd } from '@/components/JsonLd';
import {
  buildMetadata,
  breadcrumbJsonLd,
  canonical,
  faqJsonLd,
} from '@/lib/seo';
import {
  getLiveMarketStats,
  getArbitrageTeasers,
  getSteamMoveTeasers,
  getInjuryFeed,
  getSportsbookRankings,
  getWeatherAlerts,
  getLiveNewsFeed,
} from '@/lib/public-data';
import LiveStatsBar from './LiveStatsBar';
import {
  TrendingUp,
  TrendingDown,
  Lock,
  ArrowRight,
  Cloud,
  HeartPulse,
  Newspaper,
  Trophy,
  Zap,
  AlertTriangle,
  Eye,
} from 'lucide-react';

export const revalidate = 120;

export const metadata: Metadata = buildMetadata({
  title: 'Live Market Intelligence — Real-Time Sports Betting Data',
  description:
    'Live sports betting market intelligence feed: arbitrage opportunities, line movement alerts, injury reports, sportsbook rankings, weather alerts, and breaking news — updated in real time across 25+ sports and 57+ sportsbooks.',
  path: '/market-intelligence',
  keywords: [
    'live sports betting data',
    'sports betting market intelligence',
    'arbitrage opportunities live',
    'line movement alerts',
    'steam moves',
    'injury reports',
    'sportsbook rankings',
    'sports betting news feed',
  ],
});

const MI_FAQS = [
  {
    q: 'What is live market intelligence in sports betting?',
    a: 'Live market intelligence is the continuous monitoring of sports betting markets — including odds movement, arbitrage opportunities, injury impacts, weather conditions, and sportsbook performance — to identify actionable edges in real time. Valor Odds aggregates all of these signals in one platform.',
  },
  {
    q: 'How often is the data on this page updated?',
    a: 'Our data pipelines refresh continuously. Odds snapshots update every few minutes, arbitrage detection runs in real time, injury reports sync hourly, and weather alerts update every 30 minutes. The live stats bar on this page refreshes every 60 seconds.',
  },
  {
    q: 'Why are some arbitrage opportunities masked?',
    a: 'We show the sport, market type, and edge percentage to demonstrate that opportunities exist right now. The specific matchup, sportsbooks, and exact odds are available to registered users — this lets us prove the value of our real-time detection engine while protecting the actionable details for our community.',
  },
  {
    q: 'How many sportsbooks does Valor Odds track?',
    a: 'We monitor 57+ sportsbooks across the US, Europe, and international markets, including DraftKings, FanDuel, BetMGM, Caesars, bet365, PointsBet, Bovada, Pinnacle, Unibet, and many more. Our sportsbook rankings page shows which books are most active and their relative performance.',
  },
];

function impactColor(impact: string): string {
  switch (impact?.toUpperCase()) {
    case 'HIGH':
      return 'text-red-400 bg-red-500/10 border-red-500/30';
    case 'MODERATE':
    case 'MEDIUM':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    default:
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  }
}

function statusColor(status: string): string {
  const s = status?.toLowerCase() || '';
  if (s.includes('out') || s.includes('injured') || s.includes('il'))
    return 'text-red-400 bg-red-500/10';
  if (s.includes('day') || s.includes('question') || s.includes('doubt'))
    return 'text-amber-400 bg-amber-500/10';
  return 'text-blue-400 bg-blue-500/10';
}

function sportLabel(s: string): string {
  return (s || '').toUpperCase();
}

function timeAgo(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function MarketIntelligencePage() {
  const [stats, arbTeasers, steamTeasers, injuries, rankings, weather, news] =
    await Promise.all([
      getLiveMarketStats(),
      getArbitrageTeasers(8),
      getSteamMoveTeasers(15),
      getInjuryFeed(undefined, 15),
      getSportsbookRankings(12),
      getWeatherAlerts(8),
      getLiveNewsFeed(undefined, 12),
    ]);

  return (
    <>
      <JsonLd
        data={[
          faqJsonLd(MI_FAQS),
          breadcrumbJsonLd([
            { name: 'Home', url: canonical('/') },
            { name: 'Market Intelligence', url: canonical('/market-intelligence') },
          ]),
        ]}
      />
      <Navbar />

      <main className="container-px mx-auto max-w-7xl py-12 sm:py-16">
        {/* Hero */}
        <header className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-brand-accent">
            Live Market Intelligence
          </div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold leading-tight">
            Real-time sports betting intelligence,{' '}
            <span className="gradient-text">live right now</span>
          </h1>
          <p className="mt-4 text-brand-muted text-lg">
            A live window into the Valor Odds data engine. Arbitrage opportunities, line
            movement, injury impacts, weather alerts, and sportsbook performance — all
            updating in real time across {stats.booksTracked}+ sportsbooks and 25+ sports.
          </p>
        </header>

        {/* Live Stats Bar */}
        <section className="mt-8">
          <LiveStatsBar initialStats={stats} />
        </section>

        {/* Arbitrage Teasers + Steam Moves */}
        <section className="mt-16 grid gap-8 lg:grid-cols-2">
          {/* Arbitrage Teasers */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-brand-accent" />
                <h2 className="text-xl font-bold">Live Arbitrage Opportunities</h2>
              </div>
              <span className="text-xs text-brand-muted">
                {arbTeasers.length > 0 ? `${arbTeasers.length} active` : 'scanning…'}
              </span>
            </div>
            <div className="space-y-2">
              {arbTeasers.length > 0 ? (
                arbTeasers.map((arb, i) => (
                  <div
                    key={i}
                    className="group flex items-center justify-between rounded-xl border border-brand-border bg-brand-surface p-4 hover:border-brand-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent font-bold text-sm">
                        {sportLabel(arb.sport).slice(0, 3)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{arb.market}</span>
                          <span className="text-xs text-brand-muted">{sportLabel(arb.sport)}</span>
                        </div>
                        <div className="text-xs text-brand-muted mt-0.5">
                          Detected {timeAgo(arb.detectedMinutesAgo)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-lg font-bold text-emerald-400">
                          +{arb.edgePct.toFixed(2)}%
                        </div>
                        <div className="text-xs text-brand-muted">edge</div>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-bg border border-brand-border">
                        <Lock className="h-4 w-4 text-brand-muted" />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">
                  Scanning 57+ sportsbooks for arbitrage opportunities…
                </div>
              )}
            </div>
            <div className="mt-4 rounded-xl border border-brand-border bg-brand-surface/50 p-4">
              <div className="flex items-start gap-3">
                <Lock className="h-4 w-4 text-brand-muted mt-0.5 shrink-0" />
                <p className="text-sm text-brand-muted">
                  Specific matchups, sportsbook names, and stake calculations are visible
                  to registered users. The edge percentages above are live — they show
                  what our engine is detecting right now.
                </p>
              </div>
            </div>
            <Link
              href="/auth/signup"
              className="mt-4 inline-flex items-center gap-2 text-sm text-brand-accent hover:underline"
            >
              Unlock full arbitrage feed <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Steam Moves */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-amber-400" />
                <h2 className="text-xl font-bold">Line Movement & Steam Moves</h2>
              </div>
              <span className="text-xs text-brand-muted">
                {steamTeasers.length > 0 ? `${steamTeasers.length} recent` : 'monitoring…'}
              </span>
            </div>
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {steamTeasers.length > 0 ? (
                steamTeasers.map((sm, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-surface p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-brand-muted">
                          {sportLabel(sm.sport)}
                        </span>
                        <span className="text-xs text-brand-muted">·</span>
                        <span className="text-xs text-brand-muted">{sm.marketType}</span>
                      </div>
                      <div className="mt-1 text-sm font-medium truncate">
                        {sm.homeTeam} vs {sm.awayTeam}
                      </div>
                      <div className="text-xs text-brand-muted mt-0.5">
                        {sm.outcomeName} · {timeAgo(sm.detectedMinutesAgo)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div
                          className={`flex items-center gap-1 text-sm font-bold ${
                            sm.direction === 'UP' ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {sm.direction === 'UP' ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          {sm.moveMagnitude}pt
                        </div>
                        <div className="text-xs text-brand-muted">
                          {sm.booksMoved}/{sm.totalBooks} books
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">
                  Monitoring line movement across all sportsbooks…
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-brand-muted">
              Shows the magnitude of line movement and how many sportsbooks moved
              simultaneously — a signal of sharp money. Before/after prices available in
              the dashboard.
            </p>
          </div>
        </section>

        {/* Injury Reports + Weather Alerts */}
        <section className="mt-16 grid gap-8 lg:grid-cols-2">
          {/* Injuries */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <HeartPulse className="h-5 w-5 text-red-400" />
              <h2 className="text-xl font-bold">Injury Reports</h2>
              <span className="text-xs text-brand-muted ml-auto">
                {injuries.length} active reports
              </span>
            </div>
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
              {injuries.length > 0 ? (
                injuries.map((inj, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-surface p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-brand-muted">{sportLabel(inj.sport)}</span>
                        <span className="text-sm font-medium truncate">{inj.playerName}</span>
                      </div>
                      <div className="text-xs text-brand-muted mt-0.5">
                        {inj.team} · {inj.position} · {inj.injuryType}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusColor(inj.status)}`}
                    >
                      {inj.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">
                  No recent injury reports.
                </div>
              )}
            </div>
          </div>

          {/* Weather */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Cloud className="h-5 w-5 text-blue-400" />
              <h2 className="text-xl font-bold">Stadium Weather Alerts</h2>
              <span className="text-xs text-brand-muted ml-auto">
                {weather.length} venues
              </span>
            </div>
            <div className="space-y-2">
              {weather.length > 0 ? (
                weather.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-surface p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{w.stadium}</div>
                      <div className="text-xs text-brand-muted mt-0.5">
                        {w.conditions} · {w.temperature}° · Wind {w.windSpeed}
                        {w.windGust ? ` (gusts ${w.windGust})` : ''}
                        {w.precipitation > 0 ? ` · ${w.precipitation}mm precip` : ''}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${impactColor(w.impact)}`}
                    >
                      {w.impact} impact
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">
                  No active weather alerts.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Sportsbook Rankings */}
        <section className="mt-16">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="h-5 w-5 text-yellow-400" />
            <h2 className="text-xl font-bold">Sportsbook Performance Rankings</h2>
            <span className="text-xs text-brand-muted ml-auto">
              {rankings.length > 0 && rankings[0].weekStarting
                ? `Week of ${rankings[0].weekStarting}`
                : ''}
            </span>
          </div>
          {rankings.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-brand-border bg-brand-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border text-left text-xs text-brand-muted">
                    <th className="p-3 font-medium">#</th>
                    <th className="p-3 font-medium">Sportsbook</th>
                    <th className="p-3 font-medium text-right">Lines tracked</th>
                    <th className="p-3 font-medium text-right">Arb appearances</th>
                    <th className="p-3 font-medium text-right">Best markets</th>
                    <th className="p-3 font-medium text-right">Avg hold %</th>
                    <th className="p-3 font-medium text-right">Freshness</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-brand-border/50 last:border-0 hover:bg-brand-elevated/50"
                    >
                      <td className="p-3 font-bold text-brand-muted">{r.rankPosition || i + 1}</td>
                      <td className="p-3 font-medium">{r.bookmakerName}</td>
                      <td className="p-3 text-right tabular-nums text-brand-muted">
                        {r.linesTracked.toLocaleString()}
                      </td>
                      <td className="p-3 text-right tabular-nums text-brand-muted">
                        {r.arbAppearances.toLocaleString()}
                      </td>
                      <td className="p-3 text-right tabular-nums text-brand-muted">
                        {r.bestMarketCount.toLocaleString()}
                      </td>
                      <td className="p-3 text-right tabular-nums text-brand-muted">
                        {r.avgHoldPercent != null ? `${r.avgHoldPercent.toFixed(2)}%` : '—'}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {r.lineFreshnessScore != null ? (
                          <span
                            className={
                              r.lineFreshnessScore >= 0.8
                                ? 'text-emerald-400'
                                : r.lineFreshnessScore >= 0.5
                                ? 'text-amber-400'
                                : 'text-red-400'
                            }
                          >
                            {(r.lineFreshnessScore * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-brand-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">
              Sportsbook performance data loading…
            </div>
          )}
          <p className="mt-3 text-xs text-brand-muted">
            Rankings based on lines tracked, arbitrage appearance frequency, market
            coverage, and line freshness across our monitoring network.
          </p>
        </section>

        {/* News Feed */}
        <section className="mt-16">
          <div className="flex items-center gap-2 mb-4">
            <Newspaper className="h-5 w-5 text-green-400" />
            <h2 className="text-xl font-bold">Breaking Sports News</h2>
            <span className="text-xs text-brand-muted ml-auto">
              {news.length} stories · last 12 hours
            </span>
          </div>
          {news.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {news.map((item, i) => (
                <a
                  key={i}
                  href={item.url || '#'}
                  target={item.url ? '_blank' : undefined}
                  rel="noreferrer"
                  className="group block rounded-xl border border-brand-border bg-brand-surface p-4 hover:border-brand-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-brand-accent">
                      {sportLabel(item.sport)}
                    </span>
                    <span className="text-xs text-brand-muted">·</span>
                    <span className="text-xs text-brand-muted">{item.source}</span>
                  </div>
                  <p className="text-sm font-medium leading-snug group-hover:text-brand-accent transition-colors line-clamp-3">
                    {item.headline}
                  </p>
                  <div className="mt-2 text-xs text-brand-muted">
                    {new Date(item.publishedAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-brand-muted">
              No recent news stories.
            </div>
          )}
        </section>

        {/* CTA */}
        <section className="mt-20 rounded-2xl border border-brand-primary/30 bg-gradient-to-br from-brand-surface to-brand-elevated p-8 sm:p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-accent/10">
              <Eye className="h-7 w-7 text-brand-accent" />
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold">
            This is just the surface
          </h2>
          <p className="mt-3 text-brand-muted max-w-2xl mx-auto">
            The full Valor Odds platform includes complete arbitrage opportunities with
            stake calculations, AI-powered player prop analysis, real-time Discord alerts,
            custom betting commands, and historical performance tracking. All fed by the
            same real-time data engine you see here.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup" className="btn-primary px-6 py-3 text-base">
              Get started free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className="btn-secondary px-6 py-3 text-base">
              View pricing
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-16 max-w-3xl">
          <h2 className="text-2xl font-bold">Market intelligence FAQ</h2>
          <dl className="mt-4 divide-y divide-brand-border rounded-xl border border-brand-border bg-brand-surface">
            {MI_FAQS.map((f, i) => (
              <div key={i} className="p-5">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-2 text-sm text-brand-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <Footer />
    </>
  );
}
