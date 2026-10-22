import type { Metadata } from "next";
import type { Brand } from "./brands";

export function brandIcons(brand: Brand): Metadata["icons"] {
  return {
    icon: [{ url: `/brand/icons/${brand}-icon.png?v=20260920`, type: "image/png", sizes: "64x64" }],
    shortcut: `/brand/icons/${brand}-icon.png?v=20260920`,
    apple: [{ url: `/brand/icons/${brand}-apple.png?v=20260920`, sizes: "180x180", type: "image/png" }],
  };
}
