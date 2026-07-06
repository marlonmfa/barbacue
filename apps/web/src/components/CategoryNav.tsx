"use client";

import { useEffect, useState } from "react";
import { artKeyFor, type ArtKey } from "@/lib/category-art";

interface Props {
  categories: { id: number; name: string; slug: string }[];
}

const EMOJI: Record<ArtKey, string> = {
  burger: "🍔",
  combo: "🍟",
  sides: "🍟",
  sauce: "🥫",
  drink: "🥤",
  beer: "🍺",
  cocktail: "🍹",
  dessert: "🍰",
};

export function CategoryNav({ categories }: Props) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );

    categories.forEach(({ slug }) => {
      const el = document.getElementById(`cat-${slug}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [categories]);

  function scrollTo(slug: string) {
    document.getElementById(`cat-${slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav className="sticky top-0 z-40 bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--border)]">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex gap-2 overflow-x-auto py-3 no-scrollbar">
          {categories.map((cat) => {
            const isActive = active === `cat-${cat.slug}`;
            return (
              <button
                key={cat.id}
                onClick={() => scrollTo(cat.slug)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-all flex-shrink-0 inline-flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[var(--brand-red)] text-white shadow-lg shadow-[var(--brand-red)]/30"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--brand-red)] hover:text-[var(--text)]"
                }`}
              >
                <span aria-hidden>{EMOJI[artKeyFor(cat.slug, cat.name)]}</span>
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
