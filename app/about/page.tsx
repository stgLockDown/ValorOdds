import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function AboutPage() {
  return (
    <>
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
      </main>
      <Footer />
    </>
  );
}