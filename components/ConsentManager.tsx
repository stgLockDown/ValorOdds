'use client';

/**
 * Cookie consent + Google Analytics (GA4) loader with Consent Mode v2.
 *
 * How it works:
 *  1. On first paint we initialise `dataLayer`/`gtag` and set Consent Mode
 *     defaults to DENIED for analytics & ad storage. Nothing is tracked and
 *     no GA cookies are written until the user explicitly accepts.
 *  2. We read the saved choice from localStorage:
 *       - 'granted' → update consent to granted + load gtag.js (GA fires).
 *       - 'denied'  → stay denied, do not load GA.
 *       - (none)    → show the Accept / Deny banner.
 *  3. Accept  → consent granted, GA loads, choice persisted.
 *     Deny    → consent stays denied, no GA, choice persisted.
 *  4. `window.openCookieSettings()` re-opens the banner so a user can change
 *     their mind later (wire a "Cookie settings" link to it, e.g. in a footer).
 *
 * The GA measurement ID defaults to the production property but can be
 * overridden via NEXT_PUBLIC_GA_MEASUREMENT_ID in Railway.
 */

import { useCallback, useEffect, useState } from 'react';

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-CF8YDKN259';
const STORAGE_KEY = 'valorodds_cookie_consent'; // 'granted' | 'denied'

declare global {
  interface Window {
    dataLayer?: unknown[];
    // gtag is intentionally loosely typed so it works for config/consent/event.
    gtag?: (...args: unknown[]) => void;
    openCookieSettings?: () => void;
    __vo_gaLoaded?: boolean;
  }
}

function pushGtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

/** Initialise gtag shim + Consent Mode defaults (denied). Safe to call once. */
function initConsentDefaults() {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      pushGtag(...args);
    };
  }
  // Default everything to denied until the user opts in (GDPR-friendly).
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500,
  });
  window.gtag('js', new Date());
}

/** Load gtag.js once and configure the property. */
function loadGtagScript() {
  if (typeof window === 'undefined' || window.__vo_gaLoaded) return;
  window.__vo_gaLoaded = true;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  // gtag shim already exists from initConsentDefaults(); just configure.
  window.gtag?.('config', GA_ID, { send_page_view: true, anonymize_ip: true });
}

/** Flip Consent Mode to granted and (lazily) load GA. */
function grantConsent() {
  if (typeof window === 'undefined') return;
  window.gtag?.('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
  });
  loadGtagScript();
}

/** Keep Consent Mode denied (explicit, in case of re-deny). */
function denyConsent() {
  if (typeof window === 'undefined') return;
  window.gtag?.('consent', 'update', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  });
}

export function ConsentManager() {
  const [visible, setVisible] = useState(false);

  // Initialise consent defaults + apply any saved choice on mount.
  useEffect(() => {
    initConsentDefaults();

    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* localStorage may be unavailable (private mode); treat as no choice */
    }

    if (saved === 'granted') {
      grantConsent();
    } else if (saved === 'denied') {
      denyConsent();
    } else {
      setVisible(true); // no choice yet → show banner
    }

    // Allow re-opening the banner later (e.g. a footer "Cookie settings" link).
    window.openCookieSettings = () => setVisible(true);
    return () => {
      if (window.openCookieSettings) delete window.openCookieSettings;
    };
  }, []);

  const persist = useCallback((choice: 'granted' | 'denied') => {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* ignore storage failures */
    }
  }, []);

  const onAccept = useCallback(() => {
    grantConsent();
    persist('granted');
    setVisible(false);
  }, [persist]);

  const onDeny = useCallback(() => {
    denyConsent();
    persist('denied');
    setVisible(false);
  }, [persist]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[100] px-4 pb-4 sm:px-6 sm:pb-6 animate-fade-in"
    >
      <div className="mx-auto max-w-3xl rounded-xl border border-brand-border bg-brand-surface/95 p-5 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-text sm:text-base">
              <span aria-hidden="true">🍪</span> We value your privacy
            </h2>
            <p className="text-xs leading-relaxed text-brand-muted sm:text-sm">
              We use cookies to analyze site traffic and improve your experience
              with Google Analytics. You can accept analytics cookies or decline
              — declining means no analytics data is collected.{' '}
              <a
                href="/privacy"
                className="text-brand-primary underline underline-offset-2 hover:no-underline"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>
          <div className="flex shrink-0 gap-3 sm:flex-col md:flex-row">
            <button
              type="button"
              onClick={onDeny}
              className="btn-secondary flex-1 whitespace-nowrap sm:flex-none"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="btn-primary flex-1 whitespace-nowrap sm:flex-none"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
