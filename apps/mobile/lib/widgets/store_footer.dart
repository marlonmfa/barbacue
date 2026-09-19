import 'privacy_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/store_settings.dart';
import '../providers/menu_provider.dart';
import '../theme/app_theme.dart';
import 'instagram_feed.dart';

// Third-party brand colours, deliberately not AppTheme tokens: they belong to
// WhatsApp/Instagram, not to the Barbacue palette, and must not drift with it.
const _whatsappGreen = Color(0xFF25D366);

// .ig-gradient
const _igGradient = LinearGradient(
  begin: Alignment.bottomLeft,
  end: Alignment.topRight,
  colors: [
    Color(0xFFF09433),
    Color(0xFFE6683C),
    Color(0xFFDC2743),
    Color(0xFFCC2366),
    Color(0xFFBC1888),
  ],
  stops: [0, .25, .5, .75, 1],
);

// Same path data as the web footer's inline SVGs.
const _whatsappGlyph =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>';

const _instagramGlyph =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>';

const _labelStyle = TextStyle(
  fontSize: 14,
  fontWeight: FontWeight.w600,
  color: AppTheme.brandTan,
);

const _valueStyle = TextStyle(fontSize: 14, color: AppTheme.textSecondary);

Future<void> _open(String url) async {
  await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
}

/// The tail of the menu: brand, the social CTAs the brief asks for a dedicated
/// place for, the Instagram grid, contact details and the copyright.
class StoreFooter extends ConsumerWidget {
  const StoreFooter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider).valueOrNull;
    // fetchSettings falls back to the store's defaults rather than failing, so a
    // null here only ever means "still loading" — a footer whose name and links
    // are not known yet has nothing to render.
    if (settings == null) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(top: 32),
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        border: Border(top: BorderSide(color: AppTheme.border)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Brand(settings: settings),
          const SizedBox(height: 24),
          _SocialCtas(settings: settings),
          const SizedBox(height: 32),
          const _InstagramBlock(),
          const SizedBox(height: 32),
          _Contact(settings: settings),
          const PrivacyButton(),
          const SizedBox(height: 32),
          Text(
            '© ${settings.storeName} · Burguers na brasa 🔥',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _Brand extends StatelessWidget {
  const _Brand({required this.settings});

  final StoreSettings settings;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 48,
          height: 48,
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            color: AppTheme.background,
            shape: BoxShape.circle,
            border: Border.all(color: AppTheme.border),
          ),
          child: ClipOval(
            child: Image.asset('assets/brand/logo.png', fit: BoxFit.contain),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                settings.storeName,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  height: 1.1,
                  color: AppTheme.textPrimary,
                ),
              ),
              if (settings.tagline.isNotEmpty)
                Text(
                  settings.tagline,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textSecondary,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The two outbound destinations. Full-width and stacked: on a phone the web's
/// `sm:flex-row` never applies, and a full-width bar is the easier tap target.
class _SocialCtas extends StatelessWidget {
  const _SocialCtas({required this.settings});

  final StoreSettings settings;

  @override
  Widget build(BuildContext context) {
    final waHref = settings.waHref;
    return Column(
      children: [
        _SocialCta(
          onTap: () => _open(settings.instagramUrl),
          fill: const BoxDecoration(gradient: _igGradient),
          label: 'Seguir no Instagram',
          glyph: _instagramGlyph,
        ),
        if (waHref != null) ...[
          const SizedBox(height: 10),
          _SocialCta(
            onTap: () => _open(waHref),
            fill: const BoxDecoration(color: _whatsappGreen),
            label: 'Pedir no WhatsApp',
            glyph: _whatsappGlyph,
          ),
        ],
      ],
    );
  }
}

class _SocialCta extends StatelessWidget {
  const _SocialCta({
    required this.onTap,
    required this.fill,
    required this.label,
    required this.glyph,
  });

  final VoidCallback onTap;
  final BoxDecoration fill;
  final String label;
  final String glyph;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(12);
    return Semantics(
      button: true,
      label: label,
      child: ExcludeSemantics(
        child: DecoratedBox(
          decoration: fill.copyWith(borderRadius: radius),
          child: Material(
            color: Colors.transparent,
            borderRadius: radius,
            child: InkWell(
              onTap: onTap,
              borderRadius: radius,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SvgPicture.string(glyph, width: 16, height: 16),
                    const SizedBox(width: 8),
                    Text(
                      label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _InstagramBlock extends ConsumerWidget {
  const _InstagramBlock();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final posts = ref.watch(instagramProvider).valueOrNull ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'NO INSTAGRAM',
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.0,
            color: AppTheme.textSecondary,
          ),
        ),
        const SizedBox(height: 12),
        InstagramFeed(posts: posts),
      ],
    );
  }
}

class _Contact extends StatelessWidget {
  const _Contact({required this.settings});

  final StoreSettings settings;

  @override
  Widget build(BuildContext context) {
    final address = settings.address;
    final openingHours = settings.openingHours;
    final phone = settings.phone;
    final deliveryFeeText = settings.deliveryFeeText;

    final blocks = <Widget>[
      if (address != null && address.isNotEmpty) _Address(address: address),
      if (openingHours != null && openingHours.isNotEmpty)
        _Block(
          label: 'Horário',
          children: [Text(openingHours, style: _valueStyle)],
        ),
      // Diverges from the web, which renders the "Contato" wrapper regardless and
      // gates only its lines: an empty labelled block costs a phone real estate
      // the desktop grid can afford.
      if ((phone != null && phone.isNotEmpty) ||
          (deliveryFeeText != null && deliveryFeeText.isNotEmpty))
        _Block(
          label: 'Contato',
          children: [
            if (phone != null && phone.isNotEmpty)
              Text(phone, style: _valueStyle),
            if (deliveryFeeText != null && deliveryFeeText.isNotEmpty)
              Text(deliveryFeeText, style: _valueStyle),
          ],
        ),
    ];

    if (blocks.isEmpty) return const SizedBox.shrink();

    return Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppTheme.border)),
      ),
      padding: const EdgeInsets.only(top: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < blocks.length; i++) ...[
            if (i > 0) const SizedBox(height: 16),
            blocks[i],
          ],
        ],
      ),
    );
  }
}

class _Block extends StatelessWidget {
  const _Block({required this.label, required this.children});

  final String label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: _labelStyle),
        const SizedBox(height: 4),
        ...children,
      ],
    );
  }
}

class _Address extends StatelessWidget {
  const _Address({required this.address});

  final String address;

  @override
  Widget build(BuildContext context) {
    return _Block(
      label: 'Endereço',
      children: [
        Semantics(
          link: true,
          label: address,
          child: ExcludeSemantics(
            child: GestureDetector(
              onTap: () => _open(
                'https://www.google.com/maps/search/?api=1&query='
                '${Uri.encodeComponent(address)}',
              ),
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: address),
                    const WidgetSpan(
                      alignment: PlaceholderAlignment.middle,
                      child: Padding(
                        padding: EdgeInsets.only(left: 4),
                        child: Icon(
                          Icons.open_in_new,
                          size: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ),
                  ],
                ),
                style: _valueStyle,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
