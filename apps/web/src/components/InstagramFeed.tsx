"use client";

import { useState } from "react";
import type { InstagramPost } from "@/lib/instagram-fallback";

// Renders the Instagram grid that was built (FALLBACK_POSTS) but previously wired
// to nothing. Each thumbnail links to its permalink; broken thumbnails collapse to
// a branded ember tile instead of a broken-image glyph.
export function InstagramFeed({ posts }: { posts: InstagramPost[] }) {
  if (posts.length === 0) return null;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
      {posts.slice(0, 6).map((p) => (
        <Thumb key={p.id} post={p} />
      ))}
    </div>
  );
}

function Thumb({ post }: { post: InstagramPost }) {
  const [errored, setErrored] = useState(false);
  return (
    <a
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="relative aspect-square rounded-lg overflow-hidden group ring-1 ring-[var(--border)] hover:ring-[var(--brand-red)] transition-all"
      aria-label="Ver no Instagram"
    >
      {errored ? (
        <span className="ember-bg w-full h-full flex items-center justify-center text-lg">📷</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt={post.caption ?? "Post do Instagram"}
          loading="lazy"
          onError={() => setErrored(true)}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
      )}
      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
    </a>
  );
}
