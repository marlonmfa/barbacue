import 'dart:io';
import 'dart:ui' as ui;
import 'package:barbacue/management/management_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUpAll(() async {
    final cache = File(
      Platform.resolvedExecutable,
    ).parent.parent.parent.parent.path;
    for (final entry in {
      'Roboto': ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Bold.ttf'],
      'MaterialIcons': ['MaterialIcons-Regular.otf'],
    }.entries) {
      final loader = FontLoader(entry.key);
      for (final file in entry.value) {
        loader.addFont(
          Future.value(
            ByteData.sublistView(
              File('$cache/artifacts/material_fonts/$file').readAsBytesSync(),
            ),
          ),
        );
      }
      await loader.load();
    }
    await (FontLoader(
      'Anton',
    )..addFont(rootBundle.load('assets/fonts/Anton-Regular.ttf'))).load();
  });

  for (final device in ['iphone-69', 'ipad-13', 'android-phone']) {
    testWidgets('capture production demonstration on $device', (tester) async {
      final ratio = device == 'ipad-13' ? 2.0 : 3.0;
      final logicalSize = switch (device) {
        'iphone-69' => const Size(440, 956),
        'ipad-13' => const Size(1032, 1376),
        _ => const Size(360, 640),
      };
      tester.view.physicalSize = logicalSize * ratio;
      tester.view.devicePixelRatio = ratio;
      addTearDown(tester.view.reset);
      final key = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(key: key, child: const ManagementApp()),
      );
      await tester.runAsync(() async {
        for (final asset in [
          'assets/icon/icon.png',
          'assets/brands/chelas-icon.png',
          'assets/brands/barbadog-icon.png',
        ]) {
          await precacheImage(
            AssetImage(asset),
            tester.element(find.byType(ManagementApp)),
          );
        }
      });
      await tester.tap(find.text('Ver demonstração'));
      await tester.pumpAndSettle();
      Future<void> capture(String label) async {
        expect(tester.takeException(), isNull);
        await tester.runAsync(() async {
          final image =
              await (key.currentContext!.findRenderObject()
                      as RenderRepaintBoundary)
                  .toImage(pixelRatio: ratio);
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          final file = File(
            '../../output/mobile/store-management/$device/$label.png',
          );
          await file.parent.create(recursive: true);
          await file.writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }

      await capture('01-visao-geral');
      for (final entry in {
        'Pedidos': '02-pedidos',
        'Cardápios': '03-cardapios',
      }.entries) {
        await tester.tap(find.byTooltip('Open navigation menu'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(ListTile, entry.key));
        await tester.pumpAndSettle();
        await capture(entry.value);
      }
      await tester.pumpWidget(const SizedBox());
    });
  }
}
