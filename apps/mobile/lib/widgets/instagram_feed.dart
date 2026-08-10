import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/instagram_post.dart';
import '../theme/app_theme.dart';

/// The store's Instagram thumbnails, three across, each opening its post.
///
/// Renders nothing when there is nothing to show — no skeleton and no empty
/// state: the feed is decoration, and a labelled empty box is dead space.
class InstagramFeed extends StatelessWidget {
  const InstagramFeed({super.key, required this.posts});

  final List<InstagramPost> posts;

  @override
  Widget build(BuildContext context) {
    if (posts.isEmpty) return const SizedBox.shrink();

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      crossAxisCount: 3,
      mainAxisSpacing: 6,
      crossAxisSpacing: 6,
      childAspectRatio: 1,
      // The route answers with up to a dozen; the grid shows the newest six.
      children: [for (final post in posts.take(6)) _Thumb(post: post)],
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.post});

  final InstagramPost post;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(8);
    return Semantics(
      button: true,
      label: 'Ver no Instagram',
      child: ExcludeSemantics(
        child: Container(
          // Foreground so the ring survives the image painted under it, the way
          // the web's ring-1 sits over the thumbnail rather than beside it.
          foregroundDecoration: BoxDecoration(
            borderRadius: radius,
            border: Border.all(color: AppTheme.border),
          ),
          child: ClipRRect(
            borderRadius: radius,
            child: Stack(
              fit: StackFit.expand,
              children: [
                CachedNetworkImage(
                  imageUrl: post.imageUrl,
                  fit: BoxFit.cover,
                  placeholder: (_, _) =>
                      const ColoredBox(color: AppTheme.surfaceAlt),
                  errorWidget: (_, _, _) => const _EmberTile(),
                ),
                Material(
                  color: Colors.transparent,
                  child: InkWell(onTap: _open),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _open() async {
    await launchUrl(
      Uri.parse(post.permalink),
      mode: LaunchMode.externalApplication,
    );
  }
}

/// A broken thumbnail collapses to the branded wash, never a broken-image glyph.
class _EmberTile extends StatelessWidget {
  const _EmberTile();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(gradient: AppTheme.emberGradient),
      child: Center(child: Text('📷', style: TextStyle(fontSize: 18))),
    );
  }
}
