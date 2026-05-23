import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SITE, orgJsonLd, websiteJsonLd, softwareAppJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

/**
 * Root metadata. Per-page titles compose via the `template` below. Every
 * field here is the default that propagates to pages which don't override it.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: 'Valor Odds — AI-Powered Sports Arbitrage & Player Props',
    template: '%s · Valor Odds',
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: SITE.keywords,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  category: 'sports',
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { email: false, telephone: false, address: false },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE.url,
    siteName: SITE.name,
    title: 'Valor Odds — AI-Powered Sports Arbitrage & Player Props',
    description: SITE.description,
    locale: SITE.locale,
    images: [
      {
        url: `${SITE.url}/api/og?title=${encodeURIComponent('Valor Odds')}&subtitle=${encodeURIComponent('AI-Powered Sports Betting Intelligence')}`,
        width: 1200,
        height: 630,
        alt: 'Valor Odds — AI sports betting intelligence',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: SITE.twitter,
    creator: SITE.twitter,
    title: 'Valor Odds — AI-Powered Sports Betting Intelligence',
    description: SITE.shortDescription,
    images: [`${SITE.url}/api/og?title=${encodeURIComponent('Valor Odds')}`],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/manifest.webmanifest',
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0A1628' },
    { media: '(prefers-color-scheme: light)', color: '#0A1628' },
  ],
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
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
        <JsonLd data={[orgJsonLd(), websiteJsonLd(), softwareAppJsonLd()]} />
      </head>
      <body>{children}</body>
    </html>
  );
}