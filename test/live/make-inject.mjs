// Builds a script to paste into a logged-in WhatsApp Web tab (DevTools or
// CDP). It runs the built page.js and content.js for real; only chrome.* is
// faked. The fake worker answers with the decoded duration instead of text.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const page = readFileSync(resolve(root, 'dist/page.js'), 'utf8');
const content = readFileSync(resolve(root, 'dist/content.js'), 'utf8');
const shim = `
(() => {
  if (window.__zt) return 'already injected';
  const log = []; const sync = { auto: true, model: 'base', language: 'portuguese' }; const local = {};
  const listeners = [];
  const pick = (store, keys) => {
    if (keys == null) return { ...store };
    if (typeof keys === 'string') keys = [keys];
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]]));
    return Object.fromEntries(Object.keys(keys).map(k => [k, k in store ? store[k] : keys[k]]));
  };
  const area = (store, name) => ({
    get: async (k) => pick(store, k),
    set: async (o) => { Object.assign(store, o); listeners.forEach(f => f(o, name)); },
  });
  const chrome = {
    storage: { sync: area(sync, 'sync'), local: area(local, 'local'), onChanged: { addListener: f => listeners.push(f) } },
    runtime: {
      sendMessage: async (m) => { log.push({ track: m }); return true; },
      connect: () => {
        const ls = [];
        return {
          onMessage: { addListener: f => ls.push(f) },
          onDisconnect: { addListener() {} },
          postMessage(m) {
            if (m.type !== 'transcribe') return;
            const samples = atob(m.pcm).length / 2;
            log.push({ reqId: m.reqId, seconds: samples / 16000, at: Date.now() });
            setTimeout(() => ls.forEach(f => f({ reqId: m.reqId, type: 'progress', stage: 'transcribe' })), 50);
            setTimeout(() => ls.forEach(f => f({ reqId: m.reqId, type: 'done', text: '[teste] ' + (samples / 16000).toFixed(1) + ' s decodificados', model: 'fake', device: 'fake', ms: 1, seconds: samples / 16000 })), 300);
          },
        };
      },
    },
  };
  window.__zt = { log, sync, local };
  ${page}
  ;(function (chrome) { ${content} })(chrome);
  return 'injected';
})()`;
writeFileSync(resolve(root, 'test/live/inject.js'), shim);
console.log(shim.length);
