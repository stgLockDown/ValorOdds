import Link from 'next/link';
import { ShieldLogo } from '@/components/ShieldLogo';

/**
 * Brand wordmark — shield logo + "Valor Odds" text with "Odds" in light blue,
 * and a small "AI Sports Analytics Tool" tagline below.
 *
 * Used in the navbar (horizontal layout) and footer (stacked layout).
 * Set `withTagline={false}` to omit the tagline (e.g. in tight spaces).
 *
 * The shield is sized to match the height of the text block:
 *  - with tagline: h-9 w-9 (matches the two-line stack)
 *  - without tagline: h-7 w-7 (matches the single line)
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
  const shieldSize = withTagline ? 'h-9 w-9' : 'h-7 w-7';

  const content = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <ShieldLogo className={`${shieldSize} flex-shrink-0`} />
      <div className="flex flex-col leading-none">
        <span className="font-bold text-lg">
          Valor <span className="text-sky-400">Odds</span>
        </span>
        {withTagline && (
          <span className="text-[10px] text-brand-muted font-normal tracking-wide mt-0.5">
            AI Sports Analytics Tool
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
