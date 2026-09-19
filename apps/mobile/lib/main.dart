import 'app.dart';
import 'config/app_brand.dart';

// Backwards-compatible default entrypoint. Store builds use the explicit
// main_<brand>.dart targets so every artifact is impossible to misbrand.
void main() => runBrandApp(AppBrand.barbacue);

/// Kept for existing widget tests and integrations that import main.dart.
class BarbacueApp extends RestaurantApp {
  const BarbacueApp({super.key});
}
