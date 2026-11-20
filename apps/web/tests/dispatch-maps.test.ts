import test from "node:test";
import assert from "node:assert/strict";
import { dispatchGoogleMapsLinks } from "../src/lib/dispatch-maps.ts";

test("links retain stop order and return to the store within the mobile waypoint limit", () => {
  const key = JSON.stringify(["osm", -26.49, -49.08]);
  const stops = Array.from({ length: 6 }, (_, index) => ({latitude: -26 - index, longitude: -49}));
  const links = dispatchGoogleMapsLinks(key, stops).map(link => new URL(link));
  assert.equal(links.length, 2);
  assert(links.every(link => link.origin === "https://www.google.com" && link.searchParams.get("api") === "1"));
  const segments = links.map(link => link.searchParams);
  assert.deepEqual(segments.flatMap(params => params.get("waypoints")?.split("|") ?? []),
    ["-26,-49","-27,-49","-28,-49","-30,-49","-31,-49"]);
  assert.equal(segments[0].get("destination"), "-29,-49");
  assert.equal(segments[0].get("destination"), segments[1].get("origin"));
  assert.equal(segments[1].get("destination"), segments[0].get("origin"));
  assert.deepEqual(dispatchGoogleMapsLinks("invalid", stops), []);
  assert.deepEqual(dispatchGoogleMapsLinks(key, []), []);
});
