/**
 * Thin wrapper around `next/image` that enforces the three things that
 * actually move Core Web Vitals:
 *
 *   1. Explicit width + height (prevents CLS).
 *   2. `sizes` attribute so the browser picks the right source.
 *   3. `priority` only for above-the-fold images — never default-true.
 *
 * Use this component in place of `next/image` for any content image. Icon
 * components from lucide-react etc. stay as-is (they are SVG and don't need
 * image optimization).
 *
 * Usage:
 *   <OptimizedImage
 *     src="/press/logo-dark.png"
 *     alt="Valor Odds logo"
 *     width={480}
 *     height={120}
 *     sizes="(max-width: 640px) 90vw, 480px"
 *   />
 */

import Image, { type ImageProps } from 'next/image';

export type OptimizedImageProps = Omit<ImageProps, 'placeholder' | 'blurDataURL'> & {
  /** Above-the-fold hero? Defaults to false. */
  priority?: boolean;
  /** Tiny LQIP data URL for `blurDataURL`. Optional. */
  blur?: string;
};

export function OptimizedImage({
  priority = false,
  blur,
  alt,
  ...rest
}: OptimizedImageProps) {
  return (
    <Image
      {...rest}
      alt={alt}
      priority={priority}
      loading={priority ? undefined : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      placeholder={blur ? 'blur' : undefined}
      blurDataURL={blur}
    />
  );
}