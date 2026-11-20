import { readFile } from "node:fs/promises";
import { type DeliveryCoordinates } from "./delivery.ts";

type AddressEntry = [municipality: string, postalCode: string, modifier: string, latitude: number, longitude: number];
type AddressIndex = Record<string, AddressEntry[]>;

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const streetTypes: Record<string, string> = { r: "rua", av: "avenida", est: "estrada", rod: "rodovia", tv: "travessa", pc: "praca" };
const streetTitles: Record<string, string> = { pres: "presidente", dr: "doutor", prof: "professor", dep: "deputado", gov: "governador" };
const municipalities = ["corupa", "guaramirim", "jaragua do sul", "massaranduba", "schroeder"];

function parseAddress(address: string) {
  const [first, ...parts] = address.trim().split(/[,;\n]+|\s+-\s+/u).map(value => value.trim());
  const inline = first.match(/^(.+?)\s+(?:n[º°.]\s*)?(\d{1,7})([a-z])?$/iu);
  const separate = parts[0]?.match(/^(?:n[º°.]\s*)?(\d{1,7})([a-z])?(?=$|\s)/iu);
  const number = separate?.[1] ?? inline?.[2];
  const streetText = separate ? first : inline?.[1];
  if (!streetText || !number || Number(number) === 0) return null;
  const street = normalize(streetText).split(" ");
  if (Object.hasOwn(streetTypes, street[0])) street[0] = streetTypes[street[0]];
  if (Object.hasOwn(streetTitles, street[1])) street[1] = streetTitles[street[1]];
  const context = ` ${normalize(parts.slice(separate ? 1 : 0).join(" "))} `;
  const postal = address.match(/\b(\d{5})[- ]?(\d{3})\b/)?.slice(1).join("");
  const cities = municipalities.filter(city => context.includes(` ${city} `));
  const hasLocationLabel = /\b(?:cidade|municipio|santa catarina|sc|brasil|cep)\b/.test(context);
  return { key: `${street.join(" ")}|${Number(number)}`, cities, postal, hasLocationLabel, modifier: (separate?.[2] ?? inline?.[3] ?? "").toLowerCase() };
}

export class DeliveryAddressIndex {
  private index?: Promise<AddressIndex>;

  constructor(private filename: string) {}

  async locate(address: string, allowRegionalMatch = false): Promise<DeliveryCoordinates | null> {
    const parsed = parseAddress(address);
    if (!parsed || parsed.cities.length > 1) return null;
    if (!parsed.postal && !parsed.cities.length && (!allowRegionalMatch || parsed.hasLocationLabel)) return null;
    this.index ??= readFile(this.filename, "utf8").then(text => JSON.parse(text) as AddressIndex).catch(error => {
      this.index = undefined;
      throw error;
    });
    const index = await this.index;
    if (!Object.hasOwn(index, parsed.key)) return null;
    const matches = index[parsed.key].filter(([municipality, postal, modifier]) =>
      modifier === parsed.modifier && (!parsed.postal || postal === parsed.postal) && (!parsed.cities.length || municipality === parsed.cities[0]));
    const first = matches[0];
    if (!first) return null;
    // Apartments can share an entrance. Reject geographically conflicting records.
    const [, , , latitude, longitude] = first;
    if (matches.some(([municipality, , , lat, lon]) =>
      municipality !== first[0] || Math.hypot((lat - latitude) * 111_000, (lon - longitude) * 99_000) > 40)) return null;
    return { latitude, longitude };
  }
}
