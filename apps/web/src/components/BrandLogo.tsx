import Image from "next/image";
import type { CSSProperties } from "react";
import checkoutLogos from "./CheckoutBrandLogo.module.css";
import { BRAND_THEME, type Brand } from "@/lib/brands";

/** Shared circular identity: fill the background and preserve the full wordmark. */
export function BrandLogo({ brand, width, height = width, alt = "", className, style, preload, checkout }: {
  brand: Brand; width: number; height?: number; alt?: string; className?: string; style?: CSSProperties; preload?: boolean; checkout?: boolean;
}) {
  if (checkout) {
    return <span className={`${checkoutLogos.logo} ${checkoutLogos[brand]} ${className ?? ""}`}
      role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}
      data-brand={brand} style={{ ...style, width, height }} />;
  }
  const scale = brand === "barbacue" ? 1.06 : brand === "barbadog" ? 1.02 : 1;
  return <span className={className} data-brand={brand} style={{ ...style, width, height, display: "inline-block", flex: "none", position: "relative", overflow: "hidden", borderRadius: "50%", verticalAlign: "middle", background: brand === "chelas" ? "#fff" : brand === "barbacue" ? "#000" : "#14284f" }}>
    <Image src={BRAND_THEME[brand].icon} alt={alt} width={width} height={height} preload={preload} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
  </span>;
}
