// Read-only connectivity check with the same HTTP stack used by the apps.
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

Future<void> main() async {
  final client = http.Client();
  final results = <Map<String, dynamic>>[];
  try {
    for (final entry in {
      'barbacue': 'barbacue.cog.ia.br',
      'chelas': 'chelas.hirableaiagents.com',
      'barbadog': 'barbadog.hirableaiagents.com',
    }.entries) {
      final response = await client
          .get(
            Uri.https(entry.value, '/api/products', {'brand': entry.key}),
            headers: {'Accept': 'application/json'},
          )
          .timeout(const Duration(seconds: 20));
      final result = <String, dynamic>{
        'app': entry.key,
        'httpStatus': response.statusCode,
      };
      if (response.statusCode == 200) {
        final rows = jsonDecode(response.body) as List;
        result['categories'] = rows.length;
        result['products'] = rows.fold<int>(
          0,
          (count, row) => count + (row['products'] as List).length,
        );
      }
      results.add(result);
    }
  } finally {
    client.close();
  }
  stdout.writeln(
    const JsonEncoder.withIndent(
      '  ',
    ).convert({'transport': 'dart-http', 'apps': results}),
  );
  if (results.any((result) => result['httpStatus'] != 200)) exitCode = 1;
}
