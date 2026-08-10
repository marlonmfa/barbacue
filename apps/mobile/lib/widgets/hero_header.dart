import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';

import '../providers/menu_provider.dart';
import '../theme/app_theme.dart';

// Third-party brand colours, deliberately not AppTheme tokens: they belong to
// WhatsApp/Instagram/the status semantics, not to the Barbacue palette, and must
// not drift with it.
const _whatsappGreen = Color(0xFF25D366);
const _openFill = Color(0xFFE7F8F1);
const _openInk = Color(0xFF047857);
const _openBorder = Color(0x4D059669);
const _openDot = Color(0xFF10B981);

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

// Same path data as the web hero's inline SVGs.
const _whatsappGlyph =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>';

const _instagramGlyph =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>';

/// The store's identity header: brand sign, open/closed status, tagline, info
/// chips and the social CTAs. Scrolls away above the pinned category rail.
class HeroHeader extends ConsumerWidget {
  const HeroHeader({super.key, required this.onSeeMenu});

  /// Jumps the menu to its first category — the native stand-in for the web
  /// hero's `#menu` anchor.
  final VoidCallback onSeeMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider).valueOrNull;

    return DecoratedBox(
      decoration: const BoxDecoration(
        color: AppTheme.coal,
        border: Border(bottom: BorderSide(color: AppTheme.brand, width: 3)),
      ),
      child: Stack(
        children: [
          const Positioned.fill(child: _HeroScrim()),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 30, 18, 30),
            child: Column(
              children: [
                _LogoSign(storeName: settings?.storeName ?? ''),
                const SizedBox(height: 16),
                const _StatusPill(),
                const SizedBox(height: 16),
                if (settings != null) ...[
                  Text(
                    settings.tagline,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Color(0xFFD9CEC4),
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      letterSpacing: .2,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _InfoChips(
                    openingHours: settings.openingHours,
                    deliveryFeeText: settings.deliveryFeeText,
                    address: settings.address,
                  ),
                  const SizedBox(height: 16),
                ],
                _Ctas(
                  onSeeMenu: onSeeMenu,
                  waHref: settings?.waHref,
                  instagramUrl: settings?.instagramUrl,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A coal-and-ember wash that gives the storefront a recognisable masthead.
class _HeroScrim extends StatelessWidget {
  const _HeroScrim();

  @override
  Widget build(BuildContext context) {
    return const Stack(
      children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(1.1, -1.0),
                radius: 1.35,
                colors: [Color(0x55ED1B24), Colors.transparent],
                stops: [0, 0.7],
              ),
            ),
          ),
        ),
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0x00181514), Color(0xCC080808)],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _LogoSign extends StatelessWidget {
  const _LogoSign({required this.storeName});

  final String storeName;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      label: storeName,
      // The mark carries the wordmark visually; the label is the native
      // equivalent of the web hero's sr-only <h1>.
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            color: AppTheme.coal,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: const Color(0x33ED1B24)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x66ED1B24),
                blurRadius: 42,
                spreadRadius: -22,
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(26),
            child: Image.asset(
              'assets/icon/icon.png',
              width: 210,
              height: 210,
              fit: BoxFit.cover,
            ),
          ),
        ),
      ),
    );
  }
}

/// Open/closed state. Renders nothing while the status is loading or failed —
/// guessing either way is worse than staying silent.
class _StatusPill extends ConsumerWidget {
  const _StatusPill();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref
        .watch(storeStatusProvider)
        .maybeWhen(
          data: (status) {
            final open = status.open;
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: open ? _openFill : AppTheme.surfaceAlt,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: open ? _openBorder : AppTheme.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _StatusDot(open: open),
                  const SizedBox(width: 6),
                  Text(
                    open ? 'Aberto agora' : 'Fechado agora',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: open ? _openInk : AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            );
          },
          orElse: () => const SizedBox.shrink(),
        );
  }
}

class _StatusDot extends StatefulWidget {
  const _StatusDot({required this.open});

  final bool open;

  @override
  State<_StatusDot> createState() => _StatusDotState();
}

class _StatusDotState extends State<_StatusDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(_StatusDot old) {
    super.didUpdateWidget(old);
    if (old.open != widget.open) _sync();
  }

  void _sync() {
    final animate = widget.open && !MediaQuery.disableAnimationsOf(context);
    if (animate) {
      if (!_controller.isAnimating) _controller.repeat(reverse: true);
    } else {
      _controller.stop();
      _controller.value = 0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dot = DecoratedBox(
      decoration: BoxDecoration(
        color: widget.open ? _openDot : AppTheme.textSecondary,
        shape: BoxShape.circle,
      ),
      child: const SizedBox(width: 8, height: 8),
    );
    return FadeTransition(
      opacity: Tween(begin: 1.0, end: 0.35).animate(_controller),
      child: dot,
    );
  }
}

class _InfoChips extends StatelessWidget {
  const _InfoChips({
    required this.openingHours,
    required this.deliveryFeeText,
    required this.address,
  });

  final String? openingHours;
  final String? deliveryFeeText;
  final String? address;

  @override
  Widget build(BuildContext context) {
    Widget? chip(String emoji, String? value) {
      if (value == null || value.isEmpty) return null;
      return Text(
        '$emoji $value',
        style: const TextStyle(fontSize: 12, color: Colors.white70),
      );
    }

    final chips = [
      chip('🕐', openingHours),
      chip('🛵', deliveryFeeText),
      chip('📍', address),
    ].nonNulls.toList();

    if (chips.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 16,
      runSpacing: 4,
      alignment: WrapAlignment.center,
      children: chips,
    );
  }
}

class _Ctas extends StatelessWidget {
  const _Ctas({
    required this.onSeeMenu,
    required this.waHref,
    required this.instagramUrl,
  });

  final VoidCallback onSeeMenu;
  final String? waHref;
  final String? instagramUrl;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        alignment: WrapAlignment.center,
        children: [
          _CtaButton(
            onTap: onSeeMenu,
            fill: const BoxDecoration(color: AppTheme.brand),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            label: 'Ver cardápio',
            fontWeight: FontWeight.w700,
            trailing: const Icon(
              Icons.arrow_downward,
              size: 16,
              color: Colors.white,
            ),
          ),
          if (waHref != null)
            _CtaButton(
              onTap: () => _open(waHref!),
              fill: const BoxDecoration(color: _whatsappGreen),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              label: 'WhatsApp',
              semanticsLabel: 'Falar no WhatsApp',
              leading: SvgPicture.string(_whatsappGlyph, width: 16, height: 16),
            ),
          if (instagramUrl != null && instagramUrl!.isNotEmpty)
            _CtaButton(
              onTap: () => _open(instagramUrl!),
              fill: const BoxDecoration(gradient: _igGradient),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              label: 'Seguir',
              semanticsLabel: 'Seguir no Instagram',
              leading: SvgPicture.string(
                _instagramGlyph,
                width: 16,
                height: 16,
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _open(String url) async {
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }
}

class _CtaButton extends StatefulWidget {
  const _CtaButton({
    required this.onTap,
    required this.fill,
    required this.padding,
    required this.label,
    this.fontWeight = FontWeight.w600,
    this.leading,
    this.trailing,
    this.semanticsLabel,
  });

  final VoidCallback onTap;
  final BoxDecoration fill;
  final EdgeInsets padding;
  final String label;
  final FontWeight fontWeight;
  final Widget? leading;
  final Widget? trailing;
  final String? semanticsLabel;

  @override
  State<_CtaButton> createState() => _CtaButtonState();
}

class _CtaButtonState extends State<_CtaButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(14);
    return Semantics(
      button: true,
      label: widget.semanticsLabel,
      child: AnimatedScale(
        scale: _pressed ? 0.96 : 1,
        duration: const Duration(milliseconds: 120),
        child: DecoratedBox(
          decoration: widget.fill.copyWith(borderRadius: radius),
          child: Material(
            color: Colors.transparent,
            borderRadius: radius,
            child: InkWell(
              onTap: widget.onTap,
              onTapDown: (_) => setState(() => _pressed = true),
              onTapUp: (_) => setState(() => _pressed = false),
              onTapCancel: () => setState(() => _pressed = false),
              borderRadius: radius,
              child: Padding(
                padding: widget.padding,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (widget.leading != null) ...[
                      widget.leading!,
                      const SizedBox(width: 8),
                    ],
                    Text(
                      widget.label,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: widget.fontWeight,
                      ),
                    ),
                    if (widget.trailing != null) ...[
                      const SizedBox(width: 8),
                      widget.trailing!,
                    ],
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
