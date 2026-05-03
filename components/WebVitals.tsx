'use client';

/**
 * Real-user monitoring for Core Web Vitals.
 *
 * Hooks Next.js' built-in `useReportWebVitals` to ship:
 *   - LCP (Largest Contentful Paint)
 *   - CLS (Cumulative Layout Shift)
 *   - INP (Interaction to Next Paint)  — replaced FID in Core Web Vitals 2024
 *   - FCP (First Contentful Paint)
 *   - TTFB (Time to First Byte)
 *
 * Delivery target is configurable:
 *   - NEXT_PUBLIC_GA_MEASUREMENT_ID → sends as GA4 `web_vitals` event.
 *   - NEXT_PUBLIC_VITALS_ENDPOINT   → falls back to a custom POST endpoint.
 *
 * If neither is set the component does nothing in production, but it still
 * logs to console during development so engineers can spot regressions.
 */

import { useReportWebVitals } from 'next/web-vitals';
import { useEffect } from 'react';

type Metric = {
  id: string;
  name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB' | string;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  delta?: number;
  navigationType?: string;
};

declare global {
  interface Window {
    gtag?: (
      command: 'event',
      eventName: string,
      params: Record<string, unknown>,
    ) => void;
  }
}

function reportToGA(metric: Metric) {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', metric.name, {
    event_category: 'web_vitals',
    event_label: metric.id,
    // GA4 expects integer values. CLS is a unitless ratio so multiply by 1000.
    value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
    metric_id: metric.id,
    metric_value: metric.value,
    metric_rating: metric.rating,
    metric_delta: metric.delta,
    non_interaction: true,
  });
}

function reportToCustomEndpoint(endpoint: string, metric: Metric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    timestamp: Date.now(),
  });

  // Prefer sendBeacon for reliability on page unload; fall back to fetch.
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const ok = navigator.sendBeacon(endpoint, body);
    if (ok) return;
  }
  void fetch(endpoint, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
  }).catch(() => {
    /* swallow — CWV reporting must never break the app */
  });
}

export function WebVitals() {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const endpoint = process.env.NEXT_PUBLIC_VITALS_ENDPOINT;

  // Load GA4 snippet if a measurement ID is configured. gtag.js is loaded
  // lazily and non-blocking; it does not impact LCP.
  useEffect(() => {
    if (!gaId || typeof window === 'undefined') return;
    if (window.gtag) return; // already loaded

    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(s);

    const inline = document.createElement('script');
    inline.text = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', '${gaId}', { send_page_view: true, anonymize_ip: true });
    `;
    document.head.appendChild(inline);
  }, [gaId]);

  useReportWebVitals((metric) => {
    if (gaId) reportToGA(metric as Metric);
    if (endpoint) reportToCustomEndpoint(endpoint, metric as Metric);

    // Always log in development so regressions are visible in DevTools.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(
        `[web-vitals] ${metric.name} ${metric.value.toFixed(2)} (${metric.rating ?? 'unknown'})`,
      );
    }
  });

  return null;
}