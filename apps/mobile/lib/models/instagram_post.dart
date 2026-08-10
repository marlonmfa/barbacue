/// One thumbnail in the footer's Instagram grid. Mirrors GET /api/instagram's
/// `posts` entries; the sibling `source` field is a diagnostic and is dropped.
class InstagramPost {
  final String id;
  final String imageUrl;
  final String permalink;
  final String? caption;

  const InstagramPost({
    required this.id,
    required this.imageUrl,
    required this.permalink,
    this.caption,
  });

  factory InstagramPost.fromJson(Map<String, dynamic> json) {
    return InstagramPost(
      id: json['id']?.toString() ?? '',
      imageUrl: json['imageUrl']?.toString() ?? '',
      permalink: json['permalink']?.toString() ?? '',
      caption: json['caption']?.toString(),
    );
  }
}
