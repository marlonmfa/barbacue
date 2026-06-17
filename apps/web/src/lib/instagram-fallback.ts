export type InstagramPost = {
  id: string;
  imageUrl: string;
  permalink: string;
  caption?: string;
};

// Static fallback — scraped via Chrome session, stored in /public/instagram/posts/
// Shortcodes from manifest.json — each links directly to its post.
export const FALLBACK_POSTS: InstagramPost[] = [
  { id: "1",  imageUrl: "/instagram/posts/post_01.jpg", permalink: "https://www.instagram.com/p/DFlux-xy3rX/" },
  { id: "2",  imageUrl: "/instagram/posts/post_02.jpg", permalink: "https://www.instagram.com/p/DLIgWgXRdTW/" },
  { id: "3",  imageUrl: "/instagram/posts/post_03.jpg", permalink: "https://www.instagram.com/p/DJHIno7xdiJ/" },
  { id: "4",  imageUrl: "/instagram/posts/post_04.jpg", permalink: "https://www.instagram.com/p/DY5Bcygynrj/" },
  { id: "5",  imageUrl: "/instagram/posts/post_05.jpg", permalink: "https://www.instagram.com/p/DYx5yypFv5Y/" },
  { id: "6",  imageUrl: "/instagram/posts/post_06.jpg", permalink: "https://www.instagram.com/p/DYX2qiABA8U/" },
  { id: "7",  imageUrl: "/instagram/posts/post_07.jpg", permalink: "https://www.instagram.com/barbacue.burguersnabrasa/" },
  { id: "8",  imageUrl: "/instagram/posts/post_08.jpg", permalink: "https://www.instagram.com/barbacue.burguersnabrasa/" },
  { id: "9",  imageUrl: "/instagram/posts/post_09.jpg", permalink: "https://www.instagram.com/barbacue.burguersnabrasa/" },
  { id: "10", imageUrl: "/instagram/posts/post_10.jpg", permalink: "https://www.instagram.com/barbacue.burguersnabrasa/" },
  { id: "11", imageUrl: "/instagram/posts/post_11.jpg", permalink: "https://www.instagram.com/barbacue.burguersnabrasa/" },
  { id: "12", imageUrl: "/instagram/posts/post_12.jpg", permalink: "https://www.instagram.com/barbacue.burguersnabrasa/" },
];
