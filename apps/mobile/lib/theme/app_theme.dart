import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../config/app_brand.dart';

class AppTheme {
  // ── BARBACUE & Co — butcher-paper, coal and ember ──────────────────────
  static const brand = Color(0xFFED1B24); // primary red
  static const brandDark = Color(0xFFC8141C); // pressed / emphasis
  static const coal = Color(0xFF080808);
  static const coalSoft = Color(0xFF181514);
  static const brandSoft = Color(0xFFFFE9E7);
  static const background = Color(0xFFF6F0E8); // butcher paper
  static const surface = Color(0xFFFFFCF8);
  static const surfaceAlt = Color(0xFFEDE4D8);
  static const border = Color(0xFFD8C9B8);
  static const textPrimary = Color(0xFF171311);
  static const textSecondary = Color(0xFF665A50);
  static const brandTan = Color(0xFF7B5833);
  static const brandTanInk = Color(0xFF2A1A0A); // text laid on brandTan fills
  static const success = Color(0xFF16A34A); // green-600 — success header only

  // Applied-coupon palette. The web cart paints these with Tailwind's dark-mode
  // greens (green-950/40 fill, green-300/400 text) — leftovers from the app's
  // dark era that are illegible on the cream surface. Light equivalents:
  static const successDeep = Color(0xFF15803D); // green-700 — discount amounts
  static const successDark = Color(0xFF14532D); // green-900 — coupon code
  static const successSoft = Color(
    0xFFF0FDF4,
  ); // green-50 — applied-coupon fill
  static const successBorder = Color(0xFFBBF7D0); // green-200
  static const danger = Color(0xFFDC2626); // red-600 — inline field errors

  /// --ember: the branded wash behind image fallbacks.
  static const emberGradient = RadialGradient(
    center: Alignment.topCenter,
    radius: 1.25,
    colors: [brand, coalSoft, coal],
    stops: [0, 0.48, 1],
  );

  static ThemeData get theme {
    const display = TextStyle(
      fontFamily: 'Anton',
      color: textPrimary,
      letterSpacing: .5,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: brand,
        primary: brand,
        secondary: coal,
        surface: surface,
        error: danger,
      ),
      scaffoldBackgroundColor: background,
      textTheme: const TextTheme(
        headlineLarge: display,
        headlineMedium: display,
        headlineSmall: display,
        titleLarge: display,
        titleMedium: TextStyle(color: textPrimary, fontWeight: FontWeight.w800),
        bodyLarge: TextStyle(color: textPrimary, height: 1.4),
        bodyMedium: TextStyle(color: textPrimary, height: 1.35),
        bodySmall: TextStyle(color: textSecondary, height: 1.3),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: coal,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
        shadowColor: Colors.transparent,
        shape: Border(bottom: BorderSide(color: brand, width: 3)),
        titleTextStyle: TextStyle(
          fontFamily: 'Anton',
          color: Colors.white,
          fontSize: 22,
          letterSpacing: .6,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: brand,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontWeight: FontWeight.w800,
            letterSpacing: .2,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: coal,
          side: const BorderSide(color: coal, width: 1.5),
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(color: border, thickness: 1),
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
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: color, width: focused ? 2 : 1),
          );
        }),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        shadowColor: const Color(0x33000000),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: border),
        ),
        color: surface,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: surfaceAlt,
        selectedColor: coal,
        side: const BorderSide(color: border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        labelStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
      snackBarTheme: const SnackBarThemeData(
        backgroundColor: coal,
        contentTextStyle: TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  static ThemeData forBrand(BrandConfig brandConfig) {
    if (brandConfig.brand == AppBrand.barbacue) return theme;
    final scheme = ColorScheme.fromSeed(
      seedColor: brandConfig.primary,
      primary: brandConfig.primary,
      secondary: brandConfig.accent,
      surface: brandConfig.surface,
      brightness: Brightness.light,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: brandConfig.background,
      fontFamily: 'Roboto',
      textTheme: TextTheme(
        headlineLarge: TextStyle(
          fontFamily: 'Anton',
          color: brandConfig.ink,
          height: .95,
        ),
        headlineMedium: TextStyle(
          fontFamily: 'Anton',
          color: brandConfig.ink,
          height: 1,
        ),
        titleLarge: TextStyle(
          color: brandConfig.ink,
          fontWeight: FontWeight.w900,
        ),
        titleMedium: TextStyle(
          color: brandConfig.ink,
          fontWeight: FontWeight.w800,
        ),
        bodyLarge: TextStyle(color: brandConfig.ink, height: 1.4),
        bodyMedium: TextStyle(color: brandConfig.ink, height: 1.35),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: brandConfig.accent,
          foregroundColor: brandConfig.ink,
          minimumSize: const Size.fromHeight(54),
          textStyle: const TextStyle(fontWeight: FontWeight.w900),
          shape: const StadiumBorder(),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: brandConfig.primary,
      ),
    );
  }
}

// pt-BR currency: comma decimals *and* dot thousands grouping (R$ 1.015,00).
// NumberFormat.currency needs no initializeDateFormatting — that is date-only.
final _brl = NumberFormat.currency(
  locale: 'pt_BR',
  symbol: 'R\$',
  decimalDigits: 2,
);

String formatPrice(int cents) => _brl.format(cents / 100);
