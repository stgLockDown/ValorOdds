import type { Metadata } from 'next';
import Navbar from '@/components/MarketingNavbar';
import Footer from '@/components/Footer';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Disclaimer & Responsible Betting',
  description: 'Valor Odds responsible betting disclaimer. Sports betting involves risk. Never bet more than you can afford to lose.',
  path: '/disclaimer',
});

export default function DisclaimerPage() {
  return (
    <>
      <Navbar />
      <main className="container-px mx-auto max-w-3xl py-16 prose-chat">
        <h1 className="text-3xl font-bold mb-4">Disclaimer</h1>
        <p className="mt-6">
          ⚠️ Valor Odds is an informational and analytical tool only. Nothing on this site constitutes
          financial, investment, or gambling advice. All bets carry risk of total loss. You are solely
          responsible for your betting decisions and for complying with the laws of your jurisdiction.
        </p>
        <p className="mt-4">
          If you or someone you know has a gambling problem, call 1-800-522-4700 or visit{' '}
          <a href="https://www.ncpgambling.org/" target="_blank" rel="noreferrer" className="text-brand-primary">
            ncpgambling.org
          </a>.
        </p>
      </main>
      <Footer />
    </>
  );
}