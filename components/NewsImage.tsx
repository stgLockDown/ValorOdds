'use client';

import { useState } from 'react';
import Image from 'next/image';

/**
 * News article image with a graceful fallback.
 *
 * ESPN article thumbnails are hotlinked and occasionally move (404). The
 * image optimizer proxies that 404 through as a broken image. Rather than
 * showing a broken card, swap to the same "ValorOdds" placeholder used for
 * articles with no image at all.
 */
export default function NewsImage({
  src,
  sizes,
  className,
}: {
  src: string;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-muted">
          ValorOdds
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
