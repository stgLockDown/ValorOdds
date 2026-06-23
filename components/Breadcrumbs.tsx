import Link from 'next/link';
import { breadcrumbJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export type Crumb = { name: string; url: string };

/**
 * Visible breadcrumb trail + matching BreadcrumbList JSON-LD in one component.
 *
 * Pass the full ordered trail INCLUDING Home and the current page. The last
 * item is rendered as plain (non-link) current-page text. Emitting both the
 * visible nav and the structured data from the same source keeps them in sync
 * and is what Google wants for breadcrumb rich results.
 */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items || items.length === 0) return null;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(items)} />
      <nav aria-label="Breadcrumb" className="text-xs text-brand-muted mb-6">
        <ol className="flex flex-wrap items-center gap-1">
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            return (
              <li key={item.url} className="flex items-center gap-1">
                {isLast ? (
                  <span className="text-white" aria-current="page">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.url} className="hover:underline">
                    {item.name}
                  </Link>
                )}
                {!isLast && <span className="mx-1">/</span>}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
