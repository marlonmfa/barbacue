import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class AppTheme {
  // ── BARBACUE & Co brand — red on warm white (matches the web identity) ──
  static const brand = Color(0xFFED1B24); // primary red
  static const brandDark = Color(0xFFC8141C); // pressed / emphasis
  static const brandSoft = Color(0xFFFDECEB); // pale red wash (chips, placeholders, selected)
  static const background = Color(0xFFFBF7F2); // warm cream page
  static const surface = Colors.white;
  static const surfaceAlt = Color(0xFFF4EDE3); // subtle cream (inactive chips/inset)
  static const border = Color(0xFFE9DED0); // warm hairline
  static const textPrimary = Color(0xFF1B1613); // warm near-black
  static const textSecondary = Color(0xFF6F6155); // warm gray
  static const brandTan = Color(0xFF8A6A45); // --brand-tan — money accents/labels; ≥4.5:1 on white
  static const brandTanInk = Color(0xFF2A1A0A); // text laid on brandTan fills
  static const success = Color(0xFF16A34A); // green-600 — success header only

  // Applied-coupon palette. The web cart paints these with Tailwind's dark-mode
  // greens (green-950/40 fill, green-300/400 text) — leftovers from the app's
  // dark era that are illegible on the cream surface. Light equivalents:
  static const successDeep = Color(0xFF15803D); // green-700 — discount amounts
  static const successDark = Color(0xFF14532D); // green-900 — coupon code
  static const successSoft = Color(0xFFF0FDF4); // green-50 — applied-coupon fill
  static const successBorder = Color(0xFFBBF7D0); // green-200
  static const danger = Color(0xFFDC2626); // red-600 — inline field errors

  /// --ember: the branded wash behind image fallbacks.
  static const emberGradient = RadialGradient(
    center: Alignment.topCenter,
    radius: 1.2,
    colors: [brandSoft, background, surfaceAlt],
    stops: [0, 0.55, 1],
  );

  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: brand,
          primary: brand,
          secondary: brandDark,
          surface: surface,
        ),
        scaffoldBackgroundColor: background,
        appBarTheme: const AppBarTheme(
          backgroundColor: brand,
          foregroundColor: Colors.white,
          elevation: 0,
          centerTitle: false,
          titleTextStyle: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: brand,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: surfaceAlt,
          // Resolved per-state rather than split across border/focusedBorder so
          // that a field supplying its own `border` (the chat composer's pill)
          // keeps its shape in every state instead of snapping to this radius
          // when focused.
          border: WidgetStateInputBorder.resolveWith((states) {
            final focused = states.contains(WidgetState.focused);
            // Resolving `error` here is not optional: returning a state-driven
            // border opts out of the M3 defaults that would otherwise paint it.
            final color = states.contains(WidgetState.error)
                ? danger
                : focused
                    ? brand
                    : border;
            return OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: color, width: focused ? 2 : 1),
            );
          }),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
        cardTheme: CardThemeData(
          elevation: 2,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          color: surface,
        ),
      );
}

// pt-BR currency: comma decimals *and* dot thousands grouping (R$ 1.015,00).
// NumberFormat.currency needs no initializeDateFormatting — that is date-only.
final _brl =
    NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$', decimalDigits: 2);

String formatPrice(int cents) => _brl.format(cents / 100);
