// Loads the built extension in Chromium, serves a fake WhatsApp Web page with
// voice messages and waits for every inline transcript.
//   SUITE=en|pt (default en)  MODEL=tiny|base|small|turbo (default tiny)
import { chromium } from 'playwright';
import { readFileSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ext = resolve(root, 'dist');
const suite = process.env.SUITE || 'en';
const model = process.env.MODEL || (suite === 'pt' ? 'small' : 'tiny');

const SUITES = {
  en: {
    language: 'english',
    audios: [{ file: 'jfk.ogg', expect: /ask not what your country can do for you/i }],
  },
  pt: {
    language: 'portuguese',
    audios: [
      { file: 'pt-15s.ogg', expect: /bolinho/i },
      { file: 'pt-75s.ogg', expect: /(farinha|açúcar|ovo)/i },
    ],
  },
};
const { language, audios } = SUITES[suite];

const bubble = (i) => `
<div data-id="MSG${i}" style="width:336px;margin:12px;background:#202c33;color:#e9edef"><div data-testid="msg-container"><div><div><div><div>
  <div class="row"><div><div><div><div><div><button aria-label="Reproduzir mensagem de voz">▶</button></div></div></div></div><span>18:5${i}</span></div></div>
</div></div></div></div></div></div>`;

const FAKE_PAGE = `<!doctype html><html><body style="background:#0b141a;font-family:sans-serif"><div id="main">
${audios.map((_, i) => bubble(i)).join('')}
</div>
<script>
  const files = ${JSON.stringify(audios.map((a) => a.file))};
  const blobs = {};
  const msgs = files.map((f, i) => ({ id: { id: 'MSG' + i }, type: 'ptt', filehash: 'H' + i,
    async downloadMedia() { blobs['H' + i] = await (await fetch('/audio/' + f)).blob(); } }));
  window.require = (name) => ({
    WAWebCollections: { Msg: { getModelsArray: () => msgs } },
    WAWebMediaInMemoryBlobCache: { InMemoryMediaBlobCache: { get: (h) => blobs[h] } },
  })[name];
</script></body></html>`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'zt-')), {
  channel: 'chromium',
  headless: !process.env.HEADED,
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    ...(process.env.GPU ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist'] : []),
  ],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
sw.on('console', (m) => console.log('[sw]', m.text()));
await sw.evaluate((s) => chrome.storage.sync.set(s), { model, language });
if (process.env.FORCE_DEVICE) await sw.evaluate((d) => chrome.storage.local.set({ forceDevice: d }), process.env.FORCE_DEVICE);
console.log('device:', await sw.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); return a ? JSON.stringify({ fallback: a.info?.isFallbackAdapter, vendor: a.info?.vendor, arch: a.info?.architecture }) : 'wasm'; }));

await ctx.route('https://web.whatsapp.com/**', (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/audio/')) {
    return route.fulfill({ body: readFileSync(resolve(root, 'test', url.pathname.slice(7))), contentType: 'audio/ogg' });
  }
  return route.fulfill({ body: FAKE_PAGE, contentType: 'text/html' });
});

const page = await ctx.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('https://web.whatsapp.com/');
const t0 = Date.now();
const seen = new Map();
for (;;) {
  const states = await page.$$eval('.zt-box', (bs) => bs.map((b) => [b.dataset.ztId, b.innerText.replace(/\n/g, ' | ')]));
  for (const [id, s] of states) {
    if (seen.get(id) !== s) { console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${id}: ${s}`); seen.set(id, s); }
  }
  if (states.some(([, s]) => /Não deu/.test(s))) break;
  if ((await page.locator('.zt-text').count()) === audios.length) break;
  if (Date.now() - t0 > 900000) break;
  await page.waitForTimeout(500);
}
const boxCount = await page.locator('.zt-box').count();
const texts = await page.$$eval('.zt-box', (bs) => bs.map((b) => b.querySelector('.zt-text')?.innerText ?? null));
await page.screenshot({ path: resolve(root, 'test/e2e.png'), fullPage: true });

// One click on the cloud teaser hides it in every bubble, also after reload.
const cloudBefore = await page.locator('.zt-cloud').count();
await page.locator('.zt-cloud').first().click();
const thanked = await page.locator('.zt-cloud').first().innerText();
await page.waitForTimeout(3500);
const cloudAfter = await page.locator('.zt-cloud').count();
await page.reload();
await page.waitForSelector('.zt-text', { timeout: 30000 });
const cloudReload = await page.locator('.zt-cloud').count();
await ctx.close();
const cloudOk = cloudBefore === audios.length && /Anotado/.test(thanked) && cloudAfter === 0 && cloudReload === 0;
console.log(cloudOk ? 'PASS' : 'FAIL', `cloud teaser hides after click (${cloudBefore} -> ${cloudAfter}, reload ${cloudReload})`);

let ok = boxCount === audios.length && cloudOk;
if (!ok) console.log(`FAIL expected ${audios.length} boxes, got ${boxCount}`);
audios.forEach((a, i) => {
  const pass = texts[i] != null && a.expect.test(texts[i]);
  ok &&= pass;
  console.log(pass ? 'PASS' : 'FAIL', a.file, JSON.stringify(texts[i]));
});
console.log(`${suite}/${model}: ${((Date.now() - t0) / 1000).toFixed(1)}s total`);
process.exit(ok ? 0 : 1);
