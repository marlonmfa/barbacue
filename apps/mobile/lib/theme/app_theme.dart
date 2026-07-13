import 'package:flutter/material.dart';

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
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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

String formatPrice(int cents) {
  final value = cents / 100;
  return 'R\$ ${value.toStringAsFixed(2).replaceAll('.', ',')}';
}
