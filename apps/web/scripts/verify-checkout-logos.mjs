import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const dist = resolve(process.argv[2] || process.env.NEXT_DIST_DIR || ".next");
const manifest = readFileSync(join(dist, "server/app/pedir/page_client-reference-manifest.js"), "utf8");
const assignment = /__RSC_MANIFEST\s*\[\s*["']\/pedir\/page["']\s*\]\s*=\s*/.exec(manifest);
assert(assignment, "Manifesto do checkout ausente.");
const route = JSON.parse(manifest.slice(assignment.index + assignment[0].length).trim().replace(/;$/, ""));
const styles = [...new Set(Object.values(route.entryCSSFiles).flat().map(item => item.path))];
for (const brand of ["barbacue", "barbadog", "chelas"]) {
  const approved = new URL(`../src/components/admin/logos/${brand}.webp`, import.meta.url);
  const digest = data => createHash("sha256").update(data).digest("hex");
  const expected = digest(readFileSync(approved));
  const selector = new RegExp(`[.][\\w-]+${brand}\\s*[{][^}]*background-image:\\s*url\\(["']?([^)"']+)`);
  const found = styles.some(sheet => {
    const match = selector.exec(readFileSync(join(dist, sheet), "utf8"));
    if (!match) return false;
    const url = match[1];
    const asset = url.startsWith("/_next/") ? join(dist, url.slice(7)) : resolve(dist, dirname(sheet), url);
    return digest(readFileSync(asset)) === expected;
  });
  assert(found, `Logo aprovada de ${brand} ausente no checkout.`);
}
console.log("Checkout validado: logos aprovadas de Barbacue, Barbadog e Chelas.");
