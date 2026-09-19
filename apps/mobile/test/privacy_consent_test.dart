import 'dart:convert';
import 'package:barbacue/config/app_brand.dart';
import 'package:barbacue/providers/chat_provider.dart';
import 'package:barbacue/screens/chat_screen.dart';
import 'package:barbacue/screens/privacy_screen.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/services/privacy_consent.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    configureBrand(AppBrand.barbacue);
    SharedPreferences.setMockInitialValues({});
  });
  tearDown(() => ApiService.client = http.Client());

  test(
    'consent requires current disclosure version and supports revocation',
    () async {
      expect(await PrivacyConsent.hasAiConsent(), isFalse);
      SharedPreferences.setMockInitialValues({PrivacyConsent.key: 'old'});
      expect(await PrivacyConsent.hasAiConsent(), isFalse);
      await PrivacyConsent.acceptAi();
      expect(await PrivacyConsent.hasAiConsent(), isTrue);
      await PrivacyConsent.revokeAi();
      expect(await PrivacyConsent.hasAiConsent(), isFalse);
    },
  );

  test('policy URLs identify each app and use HTTPS', () {
    for (final brand in brandConfigs.values) {
      expect(brand.legalUri('privacy').scheme, 'https');
      expect(brand.legalUri('privacy').host, brand.domain);
      expect(
        brand.legalUri('privacy').path,
        '/legal/${brand.slug}/privacy.html',
      );
    }
  });

  testWidgets(
    'declining sends no data; accepting sends once; revocation gates again',
    (tester) async {
      var requests = 0;
      ApiService.client = MockClient((_) async {
        requests++;
        return http.Response(
          jsonEncode({
            'reply': 'Olá!',
            'cart': [],
            'customer': {},
            'paymentMethod': 'pix',
            'navigate': false,
          }),
          200,
        );
      });
      final container = ProviderContainer();
      addTearDown(container.dispose);
      Future<void> chat() async {
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(key: UniqueKey(), home: const ChatScreen()),
          ),
        );
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField), 'Quero pedir');
        await tester.pump();
        await tester.tap(find.byIcon(Icons.send));
        await tester.pumpAndSettle();
      }

      await chat();
      expect(find.text('Autorizar IA'), findsOneWidget);
      expect(requests, 0);
      await tester.tap(find.text('Agora não'));
      await tester.pumpAndSettle();
      expect(requests, 0);
      expect(container.read(chatProvider).messages, hasLength(1));
      await tester.tap(find.byIcon(Icons.send));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Autorizar IA'));
      await tester.pumpAndSettle();
      expect(requests, 1);
      expect(await PrivacyConsent.hasAiConsent(), isTrue);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: PrivacyScreen()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Revogar consentimento de IA'));
      await tester.tap(find.text('Revogar consentimento de IA'));
      await tester.pumpAndSettle();
      expect(await PrivacyConsent.hasAiConsent(), isFalse);
      expect(container.read(chatProvider).messages, hasLength(1));
      await chat();
      expect(find.text('Autorizar IA'), findsOneWidget);
      expect(requests, 1);
      await tester.tap(find.text('Agora não'));
      await tester.pumpAndSettle();
    },
  );
}
