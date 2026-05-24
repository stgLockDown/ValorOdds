'use client';

import { useEffect, useState } from 'react';
import type { OddsFormat } from './format-odds';

/**
 * Module-level cache of the user's odds-format preference. The dashboard
 * mounts many tabs, each of which needs the same value; without a shared
 * cache every tab would re-fetch `/api/dashboard/preferences` on mount,
 * and they could disagree mid-flight. We keep the cache here so:
 *
 *   - The first tab that mounts fires the fetch
 *   - Every subsequent mount reads the resolved value synchronously
 *   - When the Preferences tab saves, it can call `setOddsFormatCache`
 *     to broadcast the new value to every other tab without a refetch.
 */
let cached: OddsFormat | null = null;
let inflight: Promise<OddsFormat> | null = null;
const subscribers = new Set<(f: OddsFormat) => void>();

function notify(f: OddsFormat) {
  for (const sub of subscribers) sub(f);
}

/**
 * Programmatic cache update for use by the Preferences tab when the user
 * saves a new odds format.
 */
export function setOddsFormatCache(format: OddsFormat) {
  cached = format;
  notify(format);
}

async function fetchOddsFormat(): Promise<OddsFormat> {
  try {
    const res = await fetch('/api/dashboard/preferences', { cache: 'no-store' });
    if (!res.ok) return 'american';
    const json = await res.json();
    const f = json?.data?.odds_format;
    if (f === 'decimal' || f === 'fractional' || f === 'american') return f;
    return 'american';
  } catch {
    return 'american';
  }
}

/**
 * React hook that returns the user's preferred odds format. Defaults to
 * `american` until preferences load (so the dashboard never accidentally
 * shows decimal/European odds while waiting for the request).
 */
export function useOddsFormat(): OddsFormat {
  const [format, setFormat] = useState<OddsFormat>(cached ?? 'american');

  useEffect(() => {
    if (cached) {
      setFormat(cached);
    }
    if (cached === null) {
      if (!inflight) {
        inflight = fetchOddsFormat().then((f) => {
          cached = f;
          notify(f);
          inflight = null;
          return f;
        });
      }
      inflight.then((f) => setFormat(f));
    }
    subscribers.add(setFormat);
    return () => {
      subscribers.delete(setFormat);
    };
  }, []);

  return format;
}
