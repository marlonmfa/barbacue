import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
chromium.use(StealthPlugin());
const UUID = "403af0c6-176b-4021-a6cd-3e09dca09cbf";
(async () => {
  const b = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled","--no-sandbox"] });
  const ctx = await b.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "pt-BR", viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  const url = `https://www.ifood.com.br/delivery/jaragua-do-sul-sc/barbacue-centro/${UUID}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
  await page.waitForTimeout(12000);
  console.log("FINAL URL:", page.url());
  console.log("TITLE:", await page.title());
  // count product-ish images
  const imgs = await page.evaluate(() => Array.from(document.querySelectorAll("img")).map(i=>i.src).filter(s=>/static-images|pratos/.test(s)).slice(0,10));
  console.log("PRODUCT IMGS:", imgs.length, imgs.slice(0,3));
  await page.screenshot({ path: "/tmp/ifood_diag.png", fullPage: false });
  await b.close();
})();
