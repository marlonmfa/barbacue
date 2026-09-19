"use client";

import { useState } from "react";
import Image from "next/image";

interface Props {
  src?: string | null;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Optional reviewed image of this exact product, never a random category photo. */
  fallbackSrc?: string | null;
}

/** Preserve the full product and packaging; failed images show a neutral mark. */
export function ProductImage({ src, alt, sizes, priority, className, fallbackSrc }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [failedFallbackSrc, setFailedFallbackSrc] = useState<string | null>(null);

  const showPrimary = src && src !== failedSrc;
  const showFallbackPhoto = !showPrimary && fallbackSrc && fallbackSrc !== failedFallbackSrc;

  if (showPrimary) {
    return (
      <Image
        src={src!}
        alt={alt}
        fill
        sizes={sizes ?? "(max-width: 640px) 100vw, 320px"}
        priority={priority}
        unoptimized
        className={`object-contain ${className ?? ""}`}
        onError={() => setFailedSrc(src!)}
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
        unoptimized
        className={`object-contain ${className ?? ""}`}
        onError={() => setFailedFallbackSrc(fallbackSrc!)}
      />
    );
  }

  return (
    <div
      className={`ember-bg w-full h-full flex flex-col items-center justify-center gap-1 ${className ?? ""}`}
      aria-label={`${alt}: foto indisponível`}
      role="img"
    >
      <BurgerMark />
      <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--brand-tan)]/70">
        Foto indisponível
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
