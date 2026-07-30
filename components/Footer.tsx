import Link from 'next/link';
import { Zap } from 'lucide-react';
import { CookieSettingsButton } from '@/components/CookieSettingsButton';

export default function Footer() {
  return (
    <footer className="border-t border-brand-border mt-24">
      <div className="container-px mx-auto max-w-7xl py-12 grid gap-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 font-bold text-lg">
            <Zap className="h-5 w-5 text-brand-primary" />
            <span>Valor Odds</span>
          </div>
          <p className="mt-3 text-sm text-brand-muted max-w-xs">
            Professional sports betting intelligence powered by AI. Arbitrage and prop predictions across 25+ sports.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold mb-3">Product</h2>
          <ul className="space-y-2 text-sm text-brand-muted">
            <li><Link href="/#features" className="hover:text-brand-text">Features</Link></li>
            <li><Link href="/#examples" className="hover:text-brand-text">Live examples</Link></li>
            <li><Link href="/pricing" className="hover:text-brand-text">Pricing</Link></li>
            <li><Link href="/api-access" className="hover:text-brand-text">API Access</Link></li>
            <li><Link href="/docs" className="hover:text-brand-text">API Docs</Link></li>
            <li><Link href="/dashboard" className="hover:text-brand-text">Dashboard</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold mb-3">Company</h2>
          <ul className="space-y-2 text-sm text-brand-muted">
            <li><Link href="/about" className="hover:text-brand-text">About</Link></li>
            <li><a href="https://discord.gg/MfD933h9jb" target="_blank" rel="noreferrer" className="hover:text-brand-text">Discord community</a></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold mb-3">Legal</h2>
          <ul className="space-y-2 text-sm text-brand-muted">
            <li><Link href="/terms" className="hover:text-brand-text">Terms of service</Link></li>
            <li><Link href="/privacy" className="hover:text-brand-text">Privacy policy</Link></li>
            <li><Link href="/disclaimer" className="hover:text-brand-text">Disclaimer</Link></li>
            <li><CookieSettingsButton /></li>
          </ul>
          <p className="mt-4 text-xs text-brand-muted">
            ⚠️ Gambling involves risk. 18+. Bet responsibly.
          </p>
        </div>
      </div>
      <div className="border-t border-brand-border">
        <div className="container-px mx-auto max-w-7xl py-6 flex flex-col sm:flex-row justify-between gap-2 text-xs text-brand-muted">
          <p>© {new Date().getFullYear()} Valor Odds. All rights reserved.</p>
          <p>Powered by Valor Odds AI</p>
        </div>
      </div>
    </footer>
  );
}