import Link from 'next/link';
import { ShieldLogo } from '@/components/ShieldLogo';

/**
 * Brand wordmark — shield logo + "Valor Odds" text with "Odds" in light blue,
 * and a small "AI Sports Betting Intelligence" tagline below.
 *
 * Used in the navbar (horizontal layout) and footer (stacked layout).
 * Set `withTagline={false}` to omit the tagline (e.g. in tight spaces).
 */
export function BrandLogo({
  withTagline = true,
  showLink = true,
  className = '',
}: {
  withTagline?: boolean;
  showLink?: boolean;
  className?: string;
}) {
  const content = (
    <div className={`flex items-center gap-2 ${className}`}>
      <ShieldLogo className="h-6 w-6 flex-shrink-0" />
      <div className="flex flex-col leading-none">
        <span className="font-bold text-lg">
          Valor <span className="text-sky-400">Odds</span>
        </span>
        {withTagline && (
          <span className="text-[10px] text-brand-muted font-normal tracking-wide mt-0.5">
            AI Sports Betting Intelligence
          </span>
        )}
      </div>
    </div>
  );

  if (showLink) {
    return (
      <Link href="/" className="flex items-center">
        {content}
      </Link>
    );
  }
  return content;
}
