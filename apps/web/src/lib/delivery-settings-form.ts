export interface DeliverySettings {
  enabled: boolean;
  provider: "osm";
  originAddress: string | null;
  originLatitude: number | null;
  originLongitude: number | null;
  baseFeeCents: number;
  feePerKmCents: number;
  minFeeCents: number;
  maxDistanceMeters: number;
}
export interface DeliverySettingsForm {
  enabled: boolean;
  provider: "osm";
  originAddress: string;
  latitude: string;
  longitude: string;
  baseFee: string;
  feePerKm: string;
  minFee: string;
  maxDistance: string;
}

export function settingsToForm(settings: DeliverySettings): DeliverySettingsForm {
  const currency = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  return {
    enabled: settings.enabled, provider: settings.provider, originAddress: settings.originAddress ?? "",
    latitude: settings.originLatitude?.toString() ?? "", longitude: settings.originLongitude?.toString() ?? "",
    baseFee: currency(settings.baseFeeCents), feePerKm: currency(settings.feePerKmCents), minFee: currency(settings.minFeeCents),
    maxDistance: (settings.maxDistanceMeters / 1000).toString().replace(".", ","),
  };
}

function decimal(value: string, label: string, places: number): number {
  if (!new RegExp(`^\\d+(?:[.,]\\d{1,${places}})?$`).test(value.trim())) {
    throw new Error(`${label}: informe um número positivo, sem separador de milhar.`);
  }
  const number = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(number)) throw new Error(`${label}: valor inválido.`);
  return number;
}

export function formToSettings(form: DeliverySettingsForm): DeliverySettings {
  const coordinate = (value: string, limit: number, label: string) => {
    if (!value.trim()) return null;
    if (!/^-?\d+(?:[.,]\d+)?$/.test(value.trim())) throw new Error(`${label}: informe uma coordenada válida.`);
    const number = Number(value.replace(",", "."));
    if (!Number.isFinite(number) || Math.abs(number) > limit) throw new Error(`${label}: coordenada fora do limite.`);
    return number;
  };
  const settings: DeliverySettings = {
    enabled: form.enabled, provider: form.provider, originAddress: form.originAddress.trim() || null,
    originLatitude: coordinate(form.latitude, 90, "Latitude"), originLongitude: coordinate(form.longitude, 180, "Longitude"),
    baseFeeCents: Math.round(decimal(form.baseFee, "Taxa de saída", 2) * 100),
    feePerKmCents: Math.round(decimal(form.feePerKm, "Valor por quilômetro", 2) * 100),
    minFeeCents: Math.round(decimal(form.minFee, "Frete mínimo", 2) * 100),
    maxDistanceMeters: Math.round(decimal(form.maxDistance, "Distância máxima", 3) * 1000),
  };
  if (settings.enabled && (!settings.originAddress || settings.originLatitude === null || settings.originLongitude === null)) {
    throw new Error("Localize o endereço de saída da loja antes de ativar o frete.");
  }
  if (settings.enabled && settings.maxDistanceMeters <= 0) throw new Error("Informe a distância máxima atendida antes de ativar o frete.");
  return settings;
}
