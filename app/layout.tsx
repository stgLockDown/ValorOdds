import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SITE, orgJsonLd, websiteJsonLd, softwareAppJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { WebVitals } from '@/components/WebVitals';
import { ConsentManager } from '@/components/ConsentManager';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';

/**
 * Self-hosted Inter via next/font. Eliminates the external roundtrip to
 * fonts.googleapis.com + fonts.gstatic.com, removes FOUT/FOIT (we preload
 * the weights we actually use), and ships only the subsets we need.
 *
 * `display: 'swap'` means text paints in the fallback font immediately while
 * Inter loads, then swaps once ready. This is the CWV-friendly default.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
  preload: true,
  fallback: [
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'Helvetica',
    'Arial',
    'sans-serif',
  ],
});

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
        url: `${SITE.url}/api/og?title=${encodeURIComponent('Valor Odds')}&subtitle=${encodeURIComponent('AI-Powered Sports Analytics')}`,
        width: 1200,
        height: 630,
        alt: 'Valor Odds — AI sports analytics',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: SITE.twitter,
    creator: SITE.twitter,
    title: 'Valor Odds — AI-Powered Sports Analytics',
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
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/manifest.webmanifest',
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
    other: {
      'msvalidate.01': process.env.NEXT_PUBLIC_BING_VERIFICATION || '',
    },
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
    <html lang="en" className={`dark ${inter.variable}`}>
      <head>
        <JsonLd data={[orgJsonLd(), websiteJsonLd(), softwareAppJsonLd()]} />
      </head>
      <body className={inter.className}>
        <ConsentManager />
        <WebVitals />
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}