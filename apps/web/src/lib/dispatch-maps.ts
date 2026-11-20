import { deliveryCoordinatesSchema, type DeliveryCoordinates } from "./delivery.ts";

export function dispatchGoogleMapsLinks(originKey: string, stops: DeliveryCoordinates[]) {
  if (!stops.length) return [];
  let originValue: unknown;
  try { originValue = JSON.parse(originKey); } catch { return []; }
  if (!Array.isArray(originValue)) return [];
  const origin = deliveryCoordinatesSchema.safeParse({ latitude: originValue[1], longitude: originValue[2] });
  if (!origin.success) return [];
  const coordinate = ({ latitude, longitude }: DeliveryCoordinates) => `${latitude},${longitude}`;
  const points = [origin.data, ...stops, origin.data].map(coordinate);
  const links: string[] = [];
  // Mobile browsers accept at most three waypoints. Each next part starts at the previous destination.
  for (let start = 0; start < points.length - 1; start += 4) {
    const part = points.slice(start, start + 5);
    const url = new URL("https://www.google.com/maps/dir/");
    url.search = new URLSearchParams({ api: "1", origin: part[0], destination: part.at(-1)!, travelmode: "driving" }).toString();
    if (part.length > 2) url.searchParams.set("waypoints", part.slice(1, -1).join("|"));
    links.push(url.href);
  }
  return links;
}
