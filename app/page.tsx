import Link from 'next/link';
import type { Metadata } from 'next';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { Target, Bot, Trophy, Zap, BarChart3, Bell, Sparkles, ArrowRight, Check } from 'lucide-react';
import { buildMetadata, faqJsonLd, breadcrumbJsonLd, canonical, SITE } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import CommunityPolls from '@/components/CommunityPolls';
import { getTopOpportunities } from '@/lib/public-data';

export const metadata: Metadata = buildMetadata({
  title: 'Valor Odds — AI-Powered Sports Arbitrage & Player Props',
  description:
    'Real-time sports arbitrage opportunities and AI-powered player props analysis across MLB, NFL, NBA, NHL, soccer, UFC, and more. Start finding edges in seconds.',
  path: '/',
  keywords: [
    'sports arbitrage',
    'arbitrage betting',
    'positive ev betting',
    'ai sports betting',
    'player props',
    'best odds comparison',
    'live odds',
    'sharp sports bettor tools',
  ],
});

const HOME_FAQS = [
  {
    q: 'What is sports arbitrage betting?',
    a: 'Sports arbitrage betting (also called sure betting) is placing bets on all possible outcomes of a sporting event across different sportsbooks to guarantee a profit regardless of the result. Valor Odds surfaces arbitrage opportunities in real time.',
  },
  {
    q: 'Is Valor Odds free to use?',
    a: 'Yes. Valor Odds offers a free tier with live arbitrage and core tools. Premium and VIP plans unlock advanced filters, AI player props analysis, alert automation, and priority support.',
  },
  {
    q: 'Which sports does Valor Odds cover?',
    a: 'We cover 25+ sports including MLB, NFL, NBA, NHL, NCAA football and basketball, soccer (EPL / UCL / MLS), UFC / MMA, boxing, tennis, and more.',
  },
  {
    q: 'Is arbitrage betting legal?',
    a: "Arbitrage betting is legal in jurisdictions where sports betting itself is legal. Sportsbooks may limit or ban accounts used for arbitrage, so bettors should review each book's terms of service.",
  },
  {
    q: 'How does Valor Odds compare to Odds Jam, OddsPortal, or RebelBetting?',
    a: 'Valor Odds combines arbitrage detection with AI-driven player-prop edge analysis and native Discord + web delivery. Most competitors focus on one product category; we cover arbitrage, +EV, props, and injury-aware line movement in one subscription.',
  },
];

export default async function HomePage() {
  const topOpportunities = await getTopOpportunities(6);
  return (
    <>
      <JsonLd
        data={[
          faqJsonLd(HOME_FAQS),
          breadcrumbJsonLd([{ name: 'Home', url: canonical('/') }]),
        ]}
      />
      <Navbar />

      {/* Hero */}
      <section className="container-px mx-auto max-w-7xl pt-10 pb-16 sm:pt-24 sm:pb-28">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-3 py-1 text-xs text-brand-muted">
            <Sparkles className="h-3.5 w-3.5 text-brand-accent" />
            AI-driven insights
          </div>
          <h1 className="mt-6 text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15] sm:leading-[1.1]">
            Professional sports analytics{' '}
            <span className="gradient-text">Powered by AI</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-brand-muted max-w-2xl">
            Real-time arbitrage opportunities and AI-powered player props across 25+ sports.
            Join thousands of data-driven users making smarter decisions.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link href="/auth/signup" className="btn-primary px-6 py-3 text-base">
              Get started free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="#examples" className="btn-secondary px-6 py-3 text-base">
              View live examples
            </Link>
          </div>
          <div className="mt-10 sm:mt-12 grid grid-cols-3 gap-3 sm:gap-6 max-w-md">
            {[
              { n: '25+', l: 'Sports covered' },
              { n: '1,000+', l: 'Daily opportunities' },
              { n: 'High', l: 'AI accuracy' },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-2xl sm:text-3xl font-bold gradient-text">{s.n}</div>
                <div className="text-[10px] sm:text-xs text-brand-muted mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community Poll — Who will win today? */}
      <CommunityPolls />

      {/* Features */}
      <section id="features" className="container-px mx-auto max-w-7xl py-10 sm:py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-4xl font-bold">Why choose Valor Odds?</h2>
          <p className="mt-3 text-brand-muted">
            Professional-grade analytics at your fingertips.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Target, title: 'Arbitrage detection', desc: 'Scan 25+ sports every 20 minutes for guaranteed profit opportunities.', items: ['Real-time odds monitoring', 'Automatic profit calculations', 'Multi-sportsbook coverage'] },
            { icon: Bot, title: 'AI-powered analysis', desc: 'Our proprietary analysis engine, powered by best-in-class LLMs, turns raw odds into actionable plays.', items: ['Risk assessment (Low/Med/High)', 'Confidence scores (1–10)', 'Actionable recommendations'], featured: true },
            { icon: Trophy, title: 'Player props', desc: 'AI-driven predictions for top players, backed by real-time stats.', items: ['Over/Under likelihood %', 'Performance predictions', 'Betting recommendations'] },
            { icon: Zap, title: 'Custom AI commands', desc: 'On-demand analysis for any game or player.', items: ['!analyze any game', '!predict any player', 'Instant AI responses'] },
            { icon: BarChart3, title: 'Market intelligence', desc: 'Understand the odds landscape across every sport.', items: ['Overall market assessment', 'Best opportunities ranked', 'Risk factors identified'] },
            { icon: Bell, title: 'Real-time alerts', desc: 'Instant notifications for high-value opportunities.', items: ['14 sport-specific channels', 'Custom alert preferences', 'Mobile push notifications'] },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={`card-interactive ${f.featured ? 'border-brand-primary/50 ring-1 ring-brand-primary/20' : ''}`}
              >
                {f.featured && (
                  <div className="badge-primary mb-3">Most popular</div>
                )}
                <div className="w-10 h-10 rounded-lg bg-brand-primary/20 flex items-center justify-center text-brand-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-brand-muted">{f.desc}</p>
                <ul className="mt-4 space-y-1.5 text-sm text-brand-muted">
                  {f.items.map((i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <Check className="h-4 w-4 text-brand-success mt-0.5 shrink-0" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Live examples preview — real arbitrage data from custom_api_compare */}
      <section id="examples" className="container-px mx-auto max-w-7xl py-10 sm:py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-4xl font-bold">Today's top opportunities</h2>
          <p className="mt-3 text-brand-muted">Real arbitrage opportunities detected in the last 24 hours.</p>
        </div>
        {topOpportunities.length > 0 ? (
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {topOpportunities.map((opp) => (
              <div key={opp.match} className="card-interactive">
                <div className="flex items-center justify-between">
                  <span className="badge-primary">{opp.sportEmoji} {opp.sportLabel}</span>
                  <span className="badge-success">{opp.profitPct.toFixed(1)}% profit</span>
                </div>
                <h3 className="mt-4 font-semibold text-base">{opp.match}</h3>
                <div className="mt-4 rounded-lg bg-brand-elevated border border-brand-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-brand-primaryText">
                      {opp.freshness === 'LIVE' ? '🟢 Live' : opp.freshness === 'RECENT' ? '🟡 Recent' : '⚪ Detected'}
                    </div>
                    <div className="text-xs text-brand-muted">
                      {opp.detectedMinutesAgo < 1 ? 'just now' : opp.detectedMinutesAgo === 1 ? '1 min ago' : `${opp.detectedMinutesAgo} min ago`}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-brand-surface border border-brand-border p-2">
                      <div className="text-brand-muted">{opp.homeTeam}</div>
                      <div className="font-bold text-brand-text">{opp.bestHomeOdds > 0 ? `+${opp.bestHomeOdds}` : opp.bestHomeOdds}</div>
                      <div className="text-brand-primary text-[10px] truncate">{opp.bestHomeBook}</div>
                    </div>
                    <div className="rounded bg-brand-surface border border-brand-border p-2">
                      <div className="text-brand-muted">{opp.awayTeam}</div>
                      <div className="font-bold text-brand-text">{opp.bestAwayOdds > 0 ? `+${opp.bestAwayOdds}` : opp.bestAwayOdds}</div>
                      <div className="text-brand-primary text-[10px] truncate">{opp.bestAwayBook}</div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-brand-muted">
                    Guaranteed profit across two sportsbooks. Stake on both sides to lock in {opp.profitPct.toFixed(1)}% regardless of outcome.
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-10 text-center text-brand-muted">
            <p>Scanning 57+ sportsbooks for live arbitrage opportunities…</p>
            <p className="text-sm mt-1">Opportunities appear here as soon as they're detected.</p>
          </div>
        )}
        <div className="mt-10 text-center">
          <Link
            href="/market-intelligence"
            className="inline-flex items-center gap-2 text-brand-primary hover:text-brand-accent font-semibold transition-colors"
          >
            See our live market intelligence dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* API Access banner */}
      <section className="container-px mx-auto max-w-7xl py-10 sm:py-16">
        <div className="rounded-2xl bg-gradient-card border border-brand-primary/30 p-5 sm:p-10 flex flex-col lg:flex-row items-center gap-8">
          <div className="flex-1 text-center lg:text-left">
            <div className="badge-secondary mx-auto lg:mx-0 w-fit mb-4">⚡ DEVELOPER / API PLATFORM</div>
            <h2 className="text-2xl sm:text-4xl font-bold">Build on our sports data & odds APIs</h2>
            <p className="mt-3 text-brand-muted max-w-2xl">
              Get direct API access to real-time data across 26 sports and our premium Odds API.
              Build your own bundle, pick a monthly ping pool, and monitor everything from your own
              API dashboard — with optional pay-per-overage billing so you're never caught off guard.
            </p>
            <div className="mt-6 flex gap-3 justify-center lg:justify-start flex-wrap">
              <Link href="/api-access" className="btn-primary px-6 py-3">
                Explore API Access <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/api-access/manage" className="btn-secondary px-6 py-3">
                API Dashboard
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 w-full lg:w-auto lg:min-w-[280px]">
            {[
              { label: '26 sports', d: 'Real-time data feeds' },
              { label: 'Odds API', d: 'Premium, priced separately' },
              { label: 'Build-your-own', d: 'Bundle any sports you need' },
              { label: 'Live usage', d: 'Track pings in real time' },
            ].map((b) => (
              <div key={b.label} className="card p-3 text-center">
                <div className="font-semibold text-sm">{b.label}</div>
                <div className="text-xs text-brand-muted mt-1">{b.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VIP highlight */}
      <section className="container-px mx-auto max-w-7xl py-12 sm:py-20">
        <div className="rounded-2xl bg-gradient-card border border-brand-primary/30 p-6 sm:p-10 text-center">
          <div className="badge-warning mx-auto w-fit mb-4">🌟 VIP EXCLUSIVE</div>
          <h2 className="text-2xl sm:text-4xl font-bold">Be part of the Valor Odds journey</h2>
          <p className="mt-3 text-brand-muted max-w-2xl mx-auto">
            VIP members don't just use Valor Odds — they help build it.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 text-left">
            {[
              { icon: '🎯', title: 'Direct bot input', d: 'Suggest features, vote on priorities, see ideas shipped.' },
              { icon: '👥', title: 'Live dev meetings', d: 'Monthly video calls with the dev team.' },
              { icon: '🚀', title: 'Shape the future', d: 'Help design the upcoming Valor Odds mobile app.' },
              { icon: '📱', title: 'Mobile app beta', d: 'First access before public release. VIP-only.' },
            ].map((b) => (
              <div key={b.title} className="card">
                <div className="text-2xl">{b.icon}</div>
                <h3 className="mt-3 font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-brand-muted">{b.d}</p>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="btn-primary mt-10 px-6 py-3">
            Become a VIP <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container-px mx-auto max-w-7xl py-10 sm:py-16">
        <div className="rounded-2xl bg-gradient-hero p-6 sm:p-10 text-center">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">Ready to start winning?</h2>
          <p className="mt-3 text-white/90 max-w-2xl mx-auto">
            Join Valor Odds and get instant access to AI-powered sports analytics.
          </p>
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <Link href="/auth/signup" className="btn bg-white text-brand-bg hover:bg-white/90 px-6 py-3 text-base">
              Create an account
            </Link>
            <a
              href="https://discord.gg/MfD933h9jb"
              target="_blank"
              rel="noreferrer"
              className="btn bg-brand-bg/20 backdrop-blur text-white border border-white/30 hover:bg-brand-bg/30 px-6 py-3 text-base"
            >
              Join Discord
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}