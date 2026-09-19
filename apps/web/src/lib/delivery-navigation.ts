/** Legacy orders have addresses but no coordinates; never invent an OSM route. */
export function addressNavigationLinks(destination: string | null, origin: string | null) {
  if (!destination?.trim()) return null;
  const google = new URL("https://www.google.com/maps/dir/");
  google.searchParams.set("api", "1");
  google.searchParams.set("destination", destination.trim());
  google.searchParams.set("travelmode", "driving");
  if (origin?.trim()) google.searchParams.set("origin", origin.trim());
  const apple = new URL("https://maps.apple.com/");
  apple.searchParams.set("daddr", destination.trim());
  apple.searchParams.set("dirflg", "d");
  if (origin?.trim()) apple.searchParams.set("saddr", origin.trim());
  return { google: google.toString(), apple: apple.toString(), osm: null };
}
