// Chrome Web Store images: two 1280x800 screenshots and the 440x280 promo
// tile, in store/out/. Runs the real extension (whisper-small) on a mock chat
// with the Commons test audios, so no real conversation appears.
//   POSTHOG_KEY= node scripts/build.mjs && node store/shots.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ext = resolve(root, 'dist');
const out = resolve(root, 'store/out');
mkdirSync(out, { recursive: true });
const icon = `data:image/png;base64,${readFileSync(resolve(root, 'public/icons/128.png')).toString('base64')}`;

const wave = Array.from({ length: 38 }, (_, i) => `<i style="height:${6 + Math.round(Math.abs(Math.sin(i * 1.7) * 16))}px"></i>`).join('');
const voice = (i, dur, time) => `
<div class="msg in" data-id="MSG${i}"><div data-testid="msg-container" class="bubble">
  <div class="row"><div><div><div><div><div><button aria-label="Reproduzir mensagem de voz">▶</button></div></div></div></div></div>
    <div class="wave">${wave}</div><span class="dur">${dur}</span></div>
  <span class="time">${time}</span>
</div></div>`;
const text = (cls, t, time) => `<div class="msg ${cls}"><div class="bubble">${t}<span class="time">${time}</span></div></div>`;

const CHAT = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#0b141a;font:15px/20px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e9edef}
  header{height:60px;background:#202c33;display:flex;align-items:center;gap:12px;padding:0 20px}
  .av{width:40px;height:40px;border-radius:50%;background:#6b7c85;display:grid;place-items:center;font-weight:600}
  #main{padding:20px 60px;display:flex;flex-direction:column;gap:6px}
  .msg{display:flex}.msg.out{justify-content:flex-end}
  .bubble{position:relative;max-width:420px;padding:6px 10px 18px;border-radius:8px;background:#202c33}
  .out .bubble{background:#005c4b}
  .row{display:flex;align-items:center;gap:10px;width:360px;padding:4px 0}
  .row button{width:34px;height:34px;border:0;background:transparent;color:#aebac1;font-size:20px}
  .wave{display:flex;align-items:center;gap:2px;flex:1}.wave i{width:3px;background:#8696a0;border-radius:2px}
  .dur{font-size:12px;color:#8696a0}
  .time{position:absolute;right:8px;bottom:3px;font-size:11px;color:#8696a0}
  .day{align-self:center;background:#182229;color:#8696a0;font-size:12px;padding:4px 12px;border-radius:8px;margin:8px 0}
</style></head><body>
<header><div class="av">A</div><div><strong>Ana</strong><br><small style="color:#8696a0">online</small></div></header>
<div id="main">
  <div class="day">HOJE</div>
  ${text('out', 'Você sabe de onde vem o bolinho de chuva?', '18:40')}
  ${text('in', 'Li sobre isso, vou te mandar por áudio 😅', '18:41')}
  ${voice(0, '0:15', '18:41')}
  ${voice(1, '1:15', '18:43')}
  ${text('out', 'Perfeito, obrigado!', '18:45')}
</div>
<script>
  const files = ['pt-15s.ogg', 'pt-75s.ogg'];
  const blobs = {};
  const msgs = files.map((f, i) => ({ id: { id: 'MSG' + i }, type: 'ptt', filehash: 'H' + i,
    async downloadMedia() { blobs['H' + i] = await (await fetch('/audio/' + f)).blob(); } }));
  window.require = (name) => ({
    WAWebCollections: { Msg: { getModelsArray: () => msgs } },
    WAWebMediaInMemoryBlobCache: { InMemoryMediaBlobCache: { get: (h) => blobs[h] } },
  })[name];
</script></body></html>`;

// Marketing frame: headline on the left, raw capture on the right.
const frame = (title, sub, img, imgWidth) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;width:1280px;height:800px;display:flex;align-items:center;gap:56px;padding:0 64px;box-sizing:border-box;
    background:linear-gradient(135deg,#0b3d2e,#0b141a);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff}
  .copy{flex:0 0 380px}.copy img{width:64px;height:64px}
  h1{font-size:40px;line-height:46px;margin:20px 0 16px}p{font-size:20px;line-height:28px;color:#c9d6d1;margin:0}
  .shot{width:${imgWidth}px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
</style></head><body><div class="copy"><img src="${icon}"><h1>${title}</h1><p>${sub}</p></div><img class="shot" src="${img}"></body></html>`;

const ctx = await chromium.launchPersistentContext(resolve(root, 'store/.profile'), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
await sw.evaluate(() => chrome.storage.sync.set({ model: 'small', language: 'portuguese', auto: true }));
const extId = new URL(sw.url()).host;

await ctx.route('https://web.whatsapp.com/**', (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/audio/')) {
    return route.fulfill({ body: readFileSync(resolve(root, 'test', url.pathname.slice(7))), contentType: 'audio/ogg' });
  }
  return route.fulfill({ body: CHAT, contentType: 'text/html' });
});

const page = await ctx.newPage();
await page.setViewportSize({ width: 760, height: 800 });
await page.goto('https://web.whatsapp.com/');
await page.waitForFunction(() => document.querySelectorAll('.zt-text').length === 2, null, { timeout: 900000 });
await page.waitForTimeout(500);
const chatPng = `data:image/png;base64,${(await page.screenshot()).toString('base64')}`;

const popup = await ctx.newPage();
await popup.setViewportSize({ width: 360, height: 640 });
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.waitForTimeout(1500);
const popupPng = `data:image/png;base64,${(await popup.screenshot({ fullPage: true })).toString('base64')}`;

const render = async (html, file, size) => {
  const p = await ctx.newPage();
  await p.setViewportSize(size);
  await p.setContent(html);
  await p.screenshot({ path: resolve(out, file) });
  await p.close();
};
await render(frame('Áudio do WhatsApp virou texto', 'Cada áudio ganha a transcrição dentro do balão, sozinho. Leia em vez de ouvir.', chatPng, 700),
  'screenshot-1.png', { width: 1280, height: 800 });
await render(frame('Roda no seu computador', 'O áudio não sai do navegador. Escolha a qualidade e o idioma.', popupPng, 360),
  'screenshot-2.png', { width: 1280, height: 800 });
await render(`<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;width:440px;height:280px;display:flex;align-items:center;gap:20px;padding:0 32px;box-sizing:border-box;
    background:linear-gradient(135deg,#0b3d2e,#0b141a);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff}
  img{width:96px;height:96px}h1{font-size:30px;line-height:34px;margin:0 0 8px}p{margin:0;font-size:16px;line-height:21px;color:#c9d6d1}
</style></head><body><img src="${icon}"><div><h1>Zap Transcreve</h1><p>Áudios do WhatsApp Web em texto, direto na conversa.</p></div></body></html>`,
  'promo-440x280.png', { width: 440, height: 280 });

await ctx.close();
console.log('store/out: screenshot-1.png, screenshot-2.png, promo-440x280.png');
