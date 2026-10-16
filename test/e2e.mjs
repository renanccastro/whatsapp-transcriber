// Loads the built extension in Chromium, serves a fake WhatsApp Web page with
// one voice message (test/jfk.ogg) and waits for the inline transcript.
import { chromium } from 'playwright';
import { readFileSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ext = resolve(root, 'dist');
const ogg = readFileSync(resolve(root, 'test/jfk.ogg'));
const model = process.env.MODEL || 'tiny';

const FAKE_PAGE = `<!doctype html><html><body><div id="main">
<div data-id="TESTMSG1"><div data-testid="msg-container"><div><div><div><div>
  <div class="row"><div><div><div><div><div><button aria-label="Reproduzir mensagem de voz">▶</button></div></div></div></div><span>18:55</span></div></div>
</div></div></div></div></div></div>
</div>
<script>
  let blob = null;
  const msg = { id: { id: 'TESTMSG1' }, type: 'ptt', duration: '11', filehash: 'H1',
    async downloadMedia() { blob = await (await fetch('/jfk.ogg')).blob(); } };
  window.require = (name) => ({
    WAWebCollections: { Msg: { getModelsArray: () => [msg] } },
    WAWebMediaInMemoryBlobCache: { InMemoryMediaBlobCache: { get: () => blob } },
  })[name];
</script></body></html>`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'zt-')), {
  channel: 'chromium',
  headless: process.env.HEADED ? false : true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
sw.on('console', (m) => console.log('[sw]', m.text()));
await sw.evaluate((m) => chrome.storage.sync.set({ model: m, language: 'english' }), model);

await ctx.route('https://web.whatsapp.com/**', (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/jfk.ogg') return route.fulfill({ body: ogg, contentType: 'audio/ogg' });
  return route.fulfill({ body: FAKE_PAGE, contentType: 'text/html' });
});

const page = await ctx.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto('https://web.whatsapp.com/');
const t0 = Date.now();
let last = '';
for (;;) {
  const s = await page.locator('.zt-box').first().innerText().catch(() => '');
  if (s !== last) { console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s.replace(/\n/g, ' | ')}`); last = s; }
  if (await page.locator('.zt-text').count()) break;
  if (/Não deu/.test(s) || Date.now() - t0 > 600000) { await ctx.close(); process.exit(1); }
  await page.waitForTimeout(500);
}
const text = await page.locator('.zt-text').innerText();
await page.screenshot({ path: resolve(root, 'test/e2e.png') });
await ctx.close();
const ok = /ask not what your country can do for you/i.test(text);
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(text));
process.exit(ok ? 0 : 1);
