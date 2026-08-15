'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that powers Web Push notifications.
 * Rendered once in the root layout; a no-op when SWs aren't supported.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration failure is non-fatal; push just won't be available.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
