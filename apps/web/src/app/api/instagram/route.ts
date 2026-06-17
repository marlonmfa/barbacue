import { NextResponse } from "next/server";
import { FALLBACK_POSTS, type InstagramPost } from "@/lib/instagram-fallback";

export const revalidate = 3600;

type RawPost = {
  id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
  caption?: string;
};

export async function GET() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!token) {
    return NextResponse.json({ posts: FALLBACK_POSTS, source: "fallback" });
  }

  try {
    const res = await fetch(
      `https://graph.instagram.com/me/media?fields=id,media_type,media_url,thumbnail_url,permalink,caption&limit=12&access_token=${token}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      console.error("[Instagram] API error", res.status, await res.text());
      return NextResponse.json({ posts: FALLBACK_POSTS, source: "fallback" });
    }

    const data = await res.json();
    const posts: InstagramPost[] = (data.data ?? [])
      .map((p: RawPost) => ({
        id: p.id,
        imageUrl: p.media_type === "VIDEO" ? p.thumbnail_url : p.media_url,
        permalink: p.permalink,
        caption: p.caption,
      }))
      .filter((p: InstagramPost) => Boolean(p.imageUrl));

    return NextResponse.json({ posts, source: "instagram" });
  } catch (err) {
    console.error("[Instagram] fetch failed:", err);
    return NextResponse.json({ posts: FALLBACK_POSTS, source: "fallback" });
  }
}
