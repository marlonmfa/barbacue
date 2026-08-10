"use client";

import { useState } from "react";
import Image from "next/image";

interface Props {
  src?: string | null;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Category-appropriate generated photo, used when `src` is missing/dead. */
  fallbackSrc?: string | null;
}

/**
 * Product image with a layered fallback:
 *   1. the product's own imageUrl (anota.ai CDN; kept `unoptimized` — the CDN is
 *      flaky from non-browser contexts and Next's optimizer adds a failure point),
 *   2. on error / when null → a category-appropriate generated photo (object-cover),
 *      so 107 image-less products look intentional instead of "missing",
 *   3. if even that fails → the branded ember SVG mark.
 */
export function ProductImage({ src, alt, sizes, priority, className, fallbackSrc }: Props) {
  const [primaryErr, setPrimaryErr] = useState(false);
  const [fallbackErr, setFallbackErr] = useState(false);

  const showPrimary = src && !primaryErr;
  const showFallbackPhoto = !showPrimary && fallbackSrc && !fallbackErr;

  if (showPrimary) {
    return (
      <Image
        src={src!}
        alt={alt}
        fill
        sizes={sizes ?? "(max-width: 640px) 100vw, 320px"}
        priority={priority}
        unoptimized
        className={`object-cover ${className ?? ""}`}
        onError={() => setPrimaryErr(true)}
      />
    );
  }

  if (showFallbackPhoto) {
    return (
      <Image
        src={fallbackSrc!}
        alt={alt}
        fill
        sizes={sizes ?? "(max-width: 640px) 100vw, 320px"}
        className={`object-cover ${className ?? ""}`}
        onError={() => setFallbackErr(true)}
      />
    );
  }

  return (
    <div
      className={`ember-bg w-full h-full flex flex-col items-center justify-center gap-1 ${className ?? ""}`}
      aria-label={alt}
      role="img"
    >
      <BurgerMark />
      <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--brand-tan)]/70">
        Barbacue
      </span>
    </div>
  );
}

function BurgerMark() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="w-10 h-10 text-[var(--brand-red)]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* top bun */}
      <path d="M8 18c0-6 7-10 16-10s16 4 16 10" fill="currentColor" fillOpacity="0.12" />
      <path d="M8 18c0-6 7-10 16-10s16 4 16 10" />
      {/* lettuce / fillings */}
      <path d="M8 22h32" />
      <path d="M9 26h30" stroke="var(--brand-red)" />
      {/* bottom bun */}
      <path d="M9 30h30c0 4-5 8-15 8S9 34 9 30Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M9 30h30c0 4-5 8-15 8S9 34 9 30Z" />
    </svg>
  );
}
