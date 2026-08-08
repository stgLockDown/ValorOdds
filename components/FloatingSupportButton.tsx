'use client';

import Link from 'next/link';
import { LifeBuoy, Headphones } from 'lucide-react';
import { useState } from 'react';

/**
 * Floating support button — visible on every dashboard page.
 * Renders a fixed-position button in the bottom-right corner.
 * Admins get a second button linking to the admin support dashboard.
 */
export default function FloatingSupportButton({ isAdmin }: { isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {isAdmin && (
        <Link
          href="/admin/support"
          className={`flex items-center gap-2 rounded-full bg-gradient-to-br from-red-500 to-red-600 px-4 py-3 text-white font-semibold shadow-lg shadow-red-500/30 transition-all hover:shadow-red-500/50 hover:scale-105 ${
            expanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
          title="Admin: Support Tickets"
        >
          <Headphones className="h-5 w-5" />
          <span className="text-sm">Tickets</span>
        </Link>
      )}
      <Link
        href="/dashboard/support"
        className="flex items-center gap-2 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 px-4 py-3 text-white font-semibold shadow-lg shadow-indigo-500/30 transition-all hover:shadow-indigo-500/50 hover:scale-105"
        title="Get Support"
      >
        <LifeBuoy className="h-5 w-5" />
        <span className="text-sm">Support</span>
      </Link>
    </div>
  );
}
