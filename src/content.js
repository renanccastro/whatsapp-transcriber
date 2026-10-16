// Content script (isolated world): finds voice messages in WhatsApp Web,
// asks page.js for the audio, decodes it to 16 kHz PCM and sends it to the
// service worker. Shows the transcript inside the message bubble.
import { loadSettings, DEFAULT_SETTINGS } from './settings.js';

const PLAY_LABEL = /(reproduzir|pausar|play|pause|reproducir).*(voz|voice|áudio|audio)/i;
const BOX_CLASS = 'zt-box';

let settings = { ...DEFAULT_SETTINGS };
const state = new Map(); // msgId -> { status, text, error, pct }
const boxes = new Map(); // msgId -> HTMLElement
let reqSeq = 0;

// ---------- page bridge ----------
const pageWaiters = new Map();
window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (ev.source !== window || !d || d.source !== 'zt-page') return;
  const w = pageWaiters.get(d.reqId);
  if (!w) return;
  pageWaiters.delete(d.reqId);
  d.ok ? w.resolve(d) : w.reject(new Error(d.error));
});

function fetchAudio(id) {
  const reqId = ++reqSeq;
  return new Promise((resolve, reject) => {
    pageWaiters.set(reqId, { resolve, reject });
    window.postMessage({ source: 'zt-content', type: 'fetch-audio', id, reqId }, '*');
    setTimeout(() => {
      if (pageWaiters.delete(reqId)) reject(new Error('O WhatsApp demorou para entregar o áudio'));
    }, 60000);
  });
}

async function toPcmBase64(buffer) {
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const audio = await ctx.decodeAudioData(buffer);
  const ch = audio.getChannelData(0);
  const int16 = new Int16Array(ch.length);
  for (let i = 0; i < ch.length; i++) {
    const v = Math.max(-1, Math.min(1, ch[i]));
    int16[i] = v < 0 ? v * 32768 : v * 32767;
  }
  const bytes = new Uint8Array(int16.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// ---------- service worker bridge ----------
let port = null;
const swWaiters = new Map();

function getPort() {
  if (port) return port;
  port = chrome.runtime.connect({ name: 'zt' });
  port.onMessage.addListener((m) => {
    const w = swWaiters.get(m.reqId);
    if (!w) return;
    if (m.type === 'progress') w.onProgress(m);
    else {
      swWaiters.delete(m.reqId);
      m.type === 'done' ? w.resolve(m) : w.reject(new Error(m.error));
    }
  });
  port.onDisconnect.addListener(() => {
    port = null;
    for (const [id, w] of swWaiters) {
      swWaiters.delete(id);
      w.reject(new Error('reconnect'));
    }
  });
  return port;
}
setInterval(() => { if (swWaiters.size) getPort().postMessage({ type: 'ping' }); }, 20000);

function askWorker(pcm, onProgress) {
  const reqId = ++reqSeq;
  return new Promise((resolve, reject) => {
    swWaiters.set(reqId, { resolve, reject, onProgress });
    getPort().postMessage({ type: 'transcribe', reqId, pcm, settings });
  });
}

// ---------- transcription flow ----------
// One audio at a time, newest request first: opening a chat queues the
// visible audios top to bottom, so the latest message is transcribed first.
const pending = [];
let running = false;

function transcribe(id) {
  const cur = state.get(id);
  if (cur && ['working', 'done'].includes(cur.status)) return;
  const i = pending.indexOf(id);
  if (i >= 0) pending.splice(i, 1);
  pending.push(id);
  setState(id, { status: 'working', stage: 'queued' });
  // Wait a moment so every audio that just became visible is queued first.
  setTimeout(pump, 150);
}

async function pump() {
  if (running) return;
  running = true;
  while (pending.length) await run(pending.pop());
  running = false;
}

async function run(id) {
  setState(id, { status: 'working', stage: 'fetch' });
  try {
    const { buffer } = await fetchAudio(id);
    const pcm = await toPcmBase64(buffer);
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await askWorker(pcm, (p) => setState(id, { status: 'working', stage: p.stage, pct: p.pct }));
        break;
      } catch (e) {
        if (e.message !== 'reconnect' || attempt > 1) throw e;
      }
    }
    const text = res.text || '(áudio sem fala)';
    setState(id, { status: 'done', text });
    chrome.storage.local.set({ [`t:${id}`]: { text, model: res.model, at: Date.now() } });
    chrome.runtime.sendMessage({ type: 'track', event: 'transcription_done', props: { seconds: Math.round(res.seconds), ms: res.ms, device: res.device, model: res.model } }).catch(() => {});
  } catch (e) {
    setState(id, { status: 'error', error: e.message });
  }
}

function setState(id, s) {
  state.set(id, s);
  const box = boxes.get(id);
  if (box?.isConnected) render(box, id);
}

// ---------- UI ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function action(label, onClick, cls = '') {
  const b = el('button', `zt-btn ${cls}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); onClick(b); });
  return b;
}

function render(box, id) {
  const s = state.get(id) || { status: 'idle' };
  box.replaceChildren();
  if (s.status === 'idle') {
    box.append(action('📝 Transcrever', () => transcribe(id)));
    return;
  }
  if (s.status === 'working') {
    const msg = {
      fetch: 'Pegando o áudio…',
      queued: 'Na fila…',
      download: `Baixando o modelo de voz${s.pct != null ? ` (${s.pct}%)` : ''} — só na primeira vez`,
      transcribe: 'Transcrevendo…',
    }[s.stage] || 'Transcrevendo…';
    box.append(el('div', 'zt-status', msg));
    return;
  }
  if (s.status === 'error') {
    box.append(el('div', 'zt-status zt-error', `Não deu para transcrever: ${s.error}`));
    box.append(action('Tentar de novo', () => { state.delete(id); transcribe(id); }));
    return;
  }
  box.append(el('div', 'zt-text', s.text));
  const foot = el('div', 'zt-foot');
  foot.append(action('Copiar', (b) => { navigator.clipboard.writeText(s.text); b.textContent = 'Copiado'; }));
  foot.append(action('☁️ Mais preciso na nuvem — em breve', (b) => {
    chrome.runtime.sendMessage({ type: 'track', event: 'cloud_interest', props: { from: 'bubble' } }).catch(() => {});
    chrome.storage.local.set({ cloudInterest: true });
    b.textContent = 'Anotado! Avisamos quando lançar.';
    b.disabled = true;
  }, 'zt-cloud'));
  box.append(foot);
}

function anchorFor(button) {
  // Six levels up from the play button is the row with the player and the
  // time. The transcript goes right after it, inside the bubble.
  const container = button.closest('[data-testid="msg-container"]') || button.closest('[data-id]');
  let e = button;
  for (let i = 0; i < 6 && e; i++) e = e.parentElement;
  if (e && container?.contains(e) && e !== container) return { after: e };
  return { append: container };
}

const visible = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const id = en.target.dataset.ztId;
    visible.unobserve(en.target);
    if (settings.auto && !state.has(id)) transcribe(id);
  }
}, { rootMargin: '200px' });

async function attach(button) {
  const row = button.closest('[data-id]');
  const id = row?.dataset.id;
  if (!id) return;
  const existing = boxes.get(id);
  if (existing?.isConnected && row.contains(existing)) return;

  const box = el('div', BOX_CLASS);
  box.dataset.ztId = id;
  boxes.set(id, box);
  const a = anchorFor(button);
  a.after ? a.after.after(box) : a.append.append(box);

  if (!state.has(id)) {
    const cached = (await chrome.storage.local.get(`t:${id}`))[`t:${id}`];
    if (cached) state.set(id, { status: 'done', text: cached.text });
  }
  render(box, id);
  if (!state.has(id)) visible.observe(box);
}

function scan() {
  for (const b of document.querySelectorAll('[data-id] button[aria-label]')) {
    if (PLAY_LABEL.test(b.getAttribute('aria-label'))) attach(b);
  }
}

let scheduled = false;
new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; scan(); });
}).observe(document.documentElement, { childList: true, subtree: true });

(async () => {
  settings = await loadSettings();
  chrome.storage.onChanged.addListener(async (_c, area) => {
    if (area === 'sync') settings = await loadSettings();
  });
  scan();
})();
