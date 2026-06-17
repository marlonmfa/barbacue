// Smoke test: the app boots and renders without throwing.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:barbacue/main.dart';

void main() {
  testWidgets('BarbacueApp boots and shows a router-backed MaterialApp',
      (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: BarbacueApp()));
    await tester.pump();

    // The app shell renders (menu screen begins loading the cardápio).
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
