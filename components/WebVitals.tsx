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
 * NOTE: gtag.js itself is loaded by <ConsentManager> only after the user
 * accepts analytics cookies (Google Consent Mode v2). This component never
 * loads GA on its own — it just reports metrics via window.gtag IF analytics
 * consent has been granted and gtag is present. If consent was denied,
 * window.gtag is absent (or consent is 'denied') and nothing is sent.
 *
 * If neither target applies the component does nothing in production, but it
 * still logs to console during development so engineers can spot regressions.
 */

import { useReportWebVitals } from 'next/web-vitals';

type Metric = {
  id: string;
  name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB' | string;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  delta?: number;
  navigationType?: string;
};

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

  useReportWebVitals((metric) => {
    // gtag only exists once the user has accepted analytics cookies (loaded by
    // <ConsentManager>). So this is a no-op when consent was denied.
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