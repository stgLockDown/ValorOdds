'use client';

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';

export default function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    try {
      const resp = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await resp.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert(data?.error || 'Failed to open billing portal');
        setLoading(false);
      }
    } catch {
      alert('Network error');
      setLoading(false);
    }
  }

  return (
    <button onClick={openPortal} className="btn-primary" disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      Manage billing
    </button>
  );
}