"use client";

import { useEffect, useState } from "react";

interface Props {
  categories: { id: number; name: string; slug: string }[];
}

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
    <nav className="sticky top-0 z-40 bg-[var(--surface)]/95 backdrop-blur border-b border-[var(--border)]">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex gap-1.5 overflow-x-auto py-3" style={{ scrollbarWidth: "none" }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => scrollTo(cat.slug)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-all flex-shrink-0 ${
                active === `cat-${cat.slug}`
                  ? "bg-[var(--brand-red)] text-white"
                  : "bg-transparent text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--brand-red)] hover:text-[var(--text)]"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
