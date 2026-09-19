import 'package:flutter/material.dart';

enum AppBrand { barbacue, chelas, barbadog }

class BrandConfig {
  const BrandConfig({
    required this.brand,
    required this.slug,
    required this.name,
    required this.shortName,
    required this.tagline,
    required this.description,
    required this.domain,
    required this.bundleId,
    required this.primary,
    required this.accent,
    required this.ink,
    required this.background,
    required this.surface,
    required this.menuIcon,
    this.ifoodUrl,
    this.minimumOrder,
  });

  final AppBrand brand;
  final String slug;
  final String name;
  final String shortName;
  final String tagline;
  final String description;
  final String domain;
  final String bundleId;
  final Color primary;
  final Color accent;
  final Color ink;
  final Color background;
  final Color surface;
  final IconData menuIcon;
  final String? ifoodUrl;
  final String? minimumOrder;

  bool get hasNativeCheckout => brand == AppBrand.barbacue;
  Uri get siteUri => Uri.https(domain);
  Uri legalUri(String page) => Uri.https(domain, '/legal/$slug/$page.html');
  Uri? get ifoodUri => ifoodUrl == null ? null : Uri.parse(ifoodUrl!);
}

const brandConfigs = <AppBrand, BrandConfig>{
  AppBrand.barbacue: BrandConfig(
    brand: AppBrand.barbacue,
    slug: 'barbacue',
    name: 'BARBACUE',
    shortName: 'Barbacue',
    tagline: 'Burguers na brasa',
    description: 'Cardápio, pedidos, mesa, cupons, Pix e atendimento no app.',
    domain: 'barbacue.cog.ia.br',
    bundleId: 'com.lanchesdobarba.barbacue',
    primary: Color(0xFFED1B24),
    accent: Color(0xFFD3A45F),
    ink: Color(0xFF171311),
    background: Color(0xFFF6F0E8),
    surface: Color(0xFFFFFCF8),
    menuIcon: Icons.lunch_dining,
  ),
  AppBrand.chelas: BrandConfig(
    brand: AppBrand.chelas,
    slug: 'chelas',
    name: 'Chelas Cocina Mexicana',
    shortName: 'Chelas',
    tagline: 'Mucho sabor. Cero cerimônia.',
    description:
        'Quesadillas, burritos e nachos com crocância e personalidade.',
    domain: 'chelas.hirableaiagents.com',
    bundleId: 'com.lanchesdobarba.chelas',
    primary: Color(0xFFBB1826),
    accent: Color(0xFFF4C93D),
    ink: Color(0xFF1D3227),
    background: Color(0xFFFFF7DE),
    surface: Color(0xFFFFFDF5),
    menuIcon: Icons.local_dining,
    ifoodUrl:
        'https://www.ifood.com.br/delivery/jaragua-do-sul-sc/chelas-cocina-mexicana-centro/991532f5-0400-4efe-b38a-b2b37f8bd9b0',
    minimumOrder: 'Pedido mínimo R\$ 30',
  ),
  AppBrand.barbadog: BrandConfig(
    brand: AppBrand.barbadog,
    slug: 'barbadog',
    name: 'Barbadog',
    shortName: 'Barbadog',
    tagline: 'Um dog de respeito, sem economia.',
    description:
        'Hot dogs de 25 cm, sanduíches e porções com assinatura Barbacue.',
    domain: 'barbadog.hirableaiagents.com',
    bundleId: 'com.lanchesdobarba.barbadog',
    primary: Color(0xFFE52F2B),
    accent: Color(0xFFFFD34E),
    ink: Color(0xFF182448),
    background: Color(0xFFEEF1F7),
    surface: Color(0xFFFFFFFF),
    menuIcon: Icons.fastfood,
    ifoodUrl:
        'https://www.ifood.com.br/delivery/jaragua-do-sul-sc/barbacue-hotdog-%26-sandwich-centro/6cb73c63-55cd-459b-a02b-aa936967bf20',
  ),
};

BrandConfig currentBrand = brandConfigs[AppBrand.barbacue]!;

void configureBrand(AppBrand brand) {
  currentBrand = brandConfigs[brand]!;
}
