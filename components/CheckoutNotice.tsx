'use client';

import { useEffect, useState } from 'react';

/**
 * Reads `?checkout=cancelled` on the client so the /pricing page no longer
 * needs to consume `searchParams` on the server (which would force dynamic
 * rendering). Pure presentational notice.
 */
export default function CheckoutNotice() {
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCancelled(params.get('checkout') === 'cancelled');
  }, []);

  if (!cancelled) return null;

  return (
    <div className="mt-6 badge-warning">Checkout canceled — you were not charged.</div>
  );
}
