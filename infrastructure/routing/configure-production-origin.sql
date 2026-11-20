-- Record the operational storefront, verified in the regional geocoder.
-- Preserve the checkout switch and pricing when the origin already exists.
INSERT INTO delivery_settings(id, enabled, provider, origin_address, origin_latitude, origin_longitude)
VALUES (1, false, 'osm', 'Rua Expedicionário Cabo Harry Hadlich, 865, Centro, Jaraguá do Sul - SC, 89251-380', -26.4915129, -49.0747559)
ON CONFLICT (id) DO UPDATE SET
  provider = excluded.provider,
  origin_address = excluded.origin_address,
  origin_latitude = excluded.origin_latitude,
  origin_longitude = excluded.origin_longitude,
  updated_at = now();

INSERT INTO dispatch_settings(id, config)
VALUES (1, '{"automatic":false,"sameBrand":true,"serviceSeconds":120,"rules":[{"metric":"waitMinutes","limit":60},{"metric":"stops","limit":4},{"metric":"distanceKm","limit":25},{"metric":"durationMinutes","limit":45}]}')
ON CONFLICT (id) DO UPDATE SET
  config = jsonb_set(dispatch_settings.config, '{automatic}', 'false'),
  revision = dispatch_settings.revision + 1;
