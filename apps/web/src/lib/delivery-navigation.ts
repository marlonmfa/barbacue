import { deliveryCoordinatesSchema } from "./delivery.ts";

export function dispatchNavigationDestination(point: unknown, address: string | null) {
  const coordinates = deliveryCoordinatesSchema.safeParse(point);
  return coordinates.success ? `${coordinates.data.latitude},${coordinates.data.longitude}` : address;
}

/** Legacy orders have addresses but no coordinates; never invent an OSM route. */
export function addressNavigationLinks(destination: string | null, origin: string | null) {
  if (!destination?.trim()) return null;
  const google = new URL("https://www.google.com/maps/dir/");
  google.searchParams.set("api", "1");
  google.searchParams.set("destination", destination.trim());
  google.searchParams.set("travelmode", "driving");
  if (origin?.trim()) google.searchParams.set("origin", origin.trim());
  else google.searchParams.set("dir_action", "navigate");
  const apple = new URL("https://maps.apple.com/");
  apple.searchParams.set("daddr", destination.trim());
  apple.searchParams.set("dirflg", "d");
  if (origin?.trim()) apple.searchParams.set("saddr", origin.trim());
  return { google: google.toString(), apple: apple.toString(), osm: null };
}

/** Waze opens the address search and starts navigation from the driver's current position. */
export function wazeNavigationLink(destination: string | null) {
  if (!destination?.trim()) return null;
  const waze = new URL("https://waze.com/ul");
  waze.searchParams.set("q", destination.trim());
  waze.searchParams.set("navigate", "yes");
  return waze.toString();
}
