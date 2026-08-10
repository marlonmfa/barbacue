import * as fs from "fs";
const UUID = "403af0c6-176b-4021-a6cd-3e09dca09cbf";
const LAT = -26.4851, LON = -49.0714;
const H: Record<string, string> = {
  accept: "application/json, text/plain, */*",
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  app_version: "9.95.5", platform: "Desktop",
  access_key: "69f181d5-0046-4221-b7b2-deef62bd60d5",
  secret_key: "9ef4fb4f-7a1d-4e0d-a9b1-9b82873297d8",
  "x-ifood-session-id": "11111111-2222-3333-4444-555555555555",
  origin: "https://www.ifood.com.br", referer: "https://www.ifood.com.br/",
};

// The web app's merchant-info aggregator returns the full menu when asked for
// the MENU item. It's a GET with an `items` list.
const attempts: Array<[string, RequestInit]> = [
  [`https://marketplace.ifood.com.br/v1/merchant-info/${UUID}/catalog?latitude=${LAT}&longitude=${LON}&channel=IFOOD`, { headers: H }],
  [`https://marketplace.ifood.com.br/v1/merchant-info/${UUID}?latitude=${LAT}&longitude=${LON}&channel=IFOOD`, { headers: H }],
  [`https://marketplace.ifood.com.br/v1/merchants/${UUID}/catalog-categories?latitude=${LAT}&longitude=${LON}&channel=IFOOD`, { headers: H }],
  [`https://wsloja.ifood.com.br/ifood-ws-v3/v1/merchants/${UUID}/catalog?latitude=${LAT}&longitude=${LON}&channel=IFOOD`, { headers: H }],
];

(async () => {
  const out: string[] = [];
  for (const [url, opts] of attempts) {
    try {
      const r = await fetch(url, opts);
      const t = await r.text();
      out.push(`### ${r.status} len=${t.length} :: ${url}\n${t.slice(0, 500).replace(/\n/g, " ")}\n`);
    } catch (e: any) {
      out.push(`### ERR ${url}\n${e.message}\n`);
    }
  }
  fs.writeFileSync("/tmp/probe_out.txt", out.join("\n"));
})();
