import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Valor Odds — AI-Powered Sports Betting Intelligence',
    template: '%s · Valor Odds',
  },
  description:
    'Real-time arbitrage opportunities and AI-powered player props analysis across 25+ sports. Join thousands of smart bettors making data-driven decisions.',
  keywords: [
    'sports betting',
    'arbitrage',
    'player props',
    'AI betting',
    'valor odds',
    'discord betting bot',
  ],
  authors: [{ name: 'Valor Odds' }],
  openGraph: {
    type: 'website',
    url: 'https://valorodds.com',
    title: 'Valor Odds — AI-Powered Sports Betting Intelligence',
    description:
      'Real-time arbitrage + AI player props across 25+ sports. Professional insights, delivered to Discord and the web.',
    siteName: 'Valor Odds',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Valor Odds',
    description: 'Professional sports betting intelligence powered by AI.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}