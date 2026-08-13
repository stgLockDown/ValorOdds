import type { Metadata } from 'next';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { buildMetadata, breadcrumbJsonLd, canonical } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export const metadata: Metadata = buildMetadata({
  title: 'About Valor Odds',
  description:
    'Valor Odds is a data-driven sports betting intelligence platform. We combine real-time odds feeds with AI-powered analysis to surface arbitrage opportunities, +EV bets, and injury-aware prop insights across MLB, NFL, NBA, NHL, soccer, UFC, and more.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: canonical('/') },
          { name: 'About', url: canonical('/about') },
        ])}
      />
      <Navbar />
      <main className="container-px mx-auto max-w-3xl py-16 prose-chat">
        <h1 className="text-3xl font-bold mb-4">About Valor Odds</h1>
        <p className="mt-6">
          Valor Odds is a data-driven sports betting intelligence platform. We combine real-time odds
          feeds across dozens of sportsbooks with AI-powered analysis to surface arbitrage opportunities,
          prop bets with edge, and actionable market insights — in Discord, on the web, and soon on mobile.
        </p>
        <p className="mt-4">
          Our community lives primarily on Discord, where our bot delivers picks 24/7 across 25+ sports.
          This website is where you manage your account, subscription, and interact with the AI dashboard.
        </p>

        <h2 className="mt-10 text-xl font-bold">Who&apos;s behind it</h2>
        <p className="mt-4">
          Valor Odds is built and run by a small, independent team of sports bettors, engineers, and
          data folks who got tired of manually checking a dozen sportsbook tabs to find the best price
          on a bet. We&apos;re not a big-name media company or a sportsbook ourselves — we&apos;re
          practitioners first, and we built the tool we wanted to use.
        </p>
        <p className="mt-4">
          That background shapes how we work: every feature — from arbitrage detection to AI player-prop
          grading — starts as something the team actually uses to place better bets, and only ships
          publicly once it holds up under real money and real market conditions. We keep the team lean on
          purpose so we can stay hands-on with the product and responsive to the community that uses it
          every day.
        </p>
        <p className="mt-4">
          Have questions about who&apos;s running things or want to get in touch directly? Reach us any
          time at{' '}
          <a href="mailto:support@valorodds.com" className="text-brand-accent underline">
            support@valorodds.com
          </a>{' '}
          or drop into our Discord — we read every message.
        </p>
      </main>
      <Footer />
    </>
  );
}