
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
  (() => {
  // src/page.js
  (() => {
    const SRC_IN = "zt-content";
    const SRC_OUT = "zt-page";
    function findMsg(id) {
      const { Msg } = window.require("WAWebCollections");
      return Msg.getModelsArray().find((m) => m.id?.id === id);
    }
    async function fetchAudio(id) {
      const msg = findMsg(id);
      if (!msg) throw new Error("Mensagem n\xE3o encontrada");
      if (msg.type !== "ptt" && msg.type !== "audio") throw new Error("N\xE3o \xE9 um \xE1udio");
      const cache = window.require("WAWebMediaInMemoryBlobCache").InMemoryMediaBlobCache;
      let blob = cache.get(msg.filehash);
      if (!blob) {
        await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1, isUserInitiated: true });
        blob = cache.get(msg.filehash);
      }
      if (!blob) throw new Error("N\xE3o consegui baixar o \xE1udio");
      return { buffer: await blob.arrayBuffer(), duration: Number(msg.duration) || 0 };
    }
    window.addEventListener("message", async (ev) => {
      const d = ev.data;
      if (ev.source !== window || !d || d.source !== SRC_IN || d.type !== "fetch-audio") return;
      try {
        const { buffer, duration } = await fetchAudio(d.id);
        window.postMessage({ source: SRC_OUT, reqId: d.reqId, ok: true, buffer, duration }, "*", [buffer]);
      } catch (e) {
        window.postMessage({ source: SRC_OUT, reqId: d.reqId, ok: false, error: String(e?.message || e) }, "*");
      }
    });
  })();
})();

  ;(function (chrome) { (() => {
  // src/settings.js
  var DEFAULT_SETTINGS = {
    auto: true,
    model: "base",
    language: "portuguese"
  };
  async function loadSettings() {
    const s = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...s };
  }

  // src/content.js
  var PLAY_LABEL = /(reproduzir|pausar|play|pause|reproducir).*(voz|voice|áudio|audio)/i;
  var BOX_CLASS = "zt-box";
  var settings = { ...DEFAULT_SETTINGS };
  var state = /* @__PURE__ */ new Map();
  var boxes = /* @__PURE__ */ new Map();
  var reqSeq = 0;
  var pageWaiters = /* @__PURE__ */ new Map();
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.source !== "zt-page") return;
    const w = pageWaiters.get(d.reqId);
    if (!w) return;
    pageWaiters.delete(d.reqId);
    d.ok ? w.resolve(d) : w.reject(new Error(d.error));
  });
  function fetchAudio(id) {
    const reqId = ++reqSeq;
    return new Promise((resolve, reject) => {
      pageWaiters.set(reqId, { resolve, reject });
      window.postMessage({ source: "zt-content", type: "fetch-audio", id, reqId }, "*");
      setTimeout(() => {
        if (pageWaiters.delete(reqId)) reject(new Error("O WhatsApp demorou para entregar o \xE1udio"));
      }, 6e4);
    });
  }
  async function toPcmBase64(buffer) {
    const ctx = new OfflineAudioContext(1, 1, 16e3);
    const audio = await ctx.decodeAudioData(buffer);
    const ch = audio.getChannelData(0);
    const int16 = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const v = Math.max(-1, Math.min(1, ch[i]));
      int16[i] = v < 0 ? v * 32768 : v * 32767;
    }
    const bytes = new Uint8Array(int16.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    }
    return btoa(bin);
  }
  var port = null;
  var swWaiters = /* @__PURE__ */ new Map();
  function getPort() {
    if (port) return port;
    port = chrome.runtime.connect({ name: "zt" });
    port.onMessage.addListener((m) => {
      const w = swWaiters.get(m.reqId);
      if (!w) return;
      if (m.type === "progress") w.onProgress(m);
      else {
        swWaiters.delete(m.reqId);
        m.type === "done" ? w.resolve(m) : w.reject(new Error(m.error));
      }
    });
    port.onDisconnect.addListener(() => {
      port = null;
      for (const [id, w] of swWaiters) {
        swWaiters.delete(id);
        w.reject(new Error("reconnect"));
      }
    });
    return port;
  }
  setInterval(() => {
    if (swWaiters.size) getPort().postMessage({ type: "ping" });
  }, 2e4);
  function askWorker(pcm, onProgress) {
    const reqId = ++reqSeq;
    return new Promise((resolve, reject) => {
      swWaiters.set(reqId, { resolve, reject, onProgress });
      getPort().postMessage({ type: "transcribe", reqId, pcm, settings });
    });
  }
  async function transcribe(id) {
    const cur = state.get(id);
    if (cur && ["working", "done"].includes(cur.status)) return;
    setState(id, { status: "working", stage: "fetch" });
    try {
      const { buffer } = await fetchAudio(id);
      const pcm = await toPcmBase64(buffer);
      let res;
      for (let attempt = 0; ; attempt++) {
        try {
          res = await askWorker(pcm, (p) => setState(id, { status: "working", stage: p.stage, pct: p.pct }));
          break;
        } catch (e) {
          if (e.message !== "reconnect" || attempt > 1) throw e;
        }
      }
      const text = res.text || "(\xE1udio sem fala)";
      setState(id, { status: "done", text });
      chrome.storage.local.set({ [`t:${id}`]: { text, model: res.model, at: Date.now() } });
      chrome.runtime.sendMessage({ type: "track", event: "transcription_done", props: { seconds: Math.round(res.seconds), ms: res.ms, device: res.device, model: res.model } }).catch(() => {
      });
    } catch (e) {
      setState(id, { status: "error", error: e.message });
    }
  }
  function setState(id, s) {
    state.set(id, s);
    const box = boxes.get(id);
    if (box?.isConnected) render(box, id);
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function action(label, onClick, cls = "") {
    const b = el("button", `zt-btn ${cls}`.trim(), label);
    b.type = "button";
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      onClick(b);
    });
    return b;
  }
  function render(box, id) {
    const s = state.get(id) || { status: "idle" };
    box.replaceChildren();
    if (s.status === "idle") {
      box.append(action("\u{1F4DD} Transcrever", () => transcribe(id)));
      return;
    }
    if (s.status === "working") {
      const msg = {
        fetch: "Pegando o \xE1udio\u2026",
        queued: "Na fila\u2026",
        download: `Baixando o modelo de voz${s.pct != null ? ` (${s.pct}%)` : ""} \u2014 s\xF3 na primeira vez`,
        transcribe: "Transcrevendo\u2026"
      }[s.stage] || "Transcrevendo\u2026";
      box.append(el("div", "zt-status", msg));
      return;
    }
    if (s.status === "error") {
      box.append(el("div", "zt-status zt-error", `N\xE3o deu para transcrever: ${s.error}`));
      box.append(action("Tentar de novo", () => {
        state.delete(id);
        transcribe(id);
      }));
      return;
    }
    box.append(el("div", "zt-text", s.text));
    const foot = el("div", "zt-foot");
    foot.append(action("Copiar", (b) => {
      navigator.clipboard.writeText(s.text);
      b.textContent = "Copiado";
    }));
    foot.append(action("\u2601\uFE0F Mais preciso na nuvem \u2014 em breve", (b) => {
      chrome.runtime.sendMessage({ type: "track", event: "cloud_interest", props: { from: "bubble" } }).catch(() => {
      });
      chrome.storage.local.set({ cloudInterest: true });
      b.textContent = "Anotado! Avisamos quando lan\xE7ar.";
      b.disabled = true;
    }, "zt-cloud"));
    box.append(foot);
  }
  function anchorFor(button) {
    const container = button.closest('[data-testid="msg-container"]') || button.closest("[data-id]");
    let e = button;
    for (let i = 0; i < 6 && e; i++) e = e.parentElement;
    if (e && container?.contains(e) && e !== container) return { after: e };
    return { append: container };
  }
  var visible = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const id = en.target.dataset.ztId;
      visible.unobserve(en.target);
      if (settings.auto && !state.has(id)) transcribe(id);
    }
  }, { rootMargin: "200px" });
  async function attach(button) {
    const row = button.closest("[data-id]");
    const id = row?.dataset.id;
    if (!id) return;
    const existing = boxes.get(id);
    if (existing?.isConnected && row.contains(existing)) return;
    const box = el("div", BOX_CLASS);
    box.dataset.ztId = id;
    boxes.set(id, box);
    const a = anchorFor(button);
    a.after ? a.after.after(box) : a.append.append(box);
    if (!state.has(id)) {
      const cached = (await chrome.storage.local.get(`t:${id}`))[`t:${id}`];
      if (cached) state.set(id, { status: "done", text: cached.text });
    }
    render(box, id);
    if (!state.has(id)) visible.observe(box);
  }
  function scan() {
    for (const b of document.querySelectorAll("[data-id] button[aria-label]")) {
      if (PLAY_LABEL.test(b.getAttribute("aria-label"))) attach(b);
    }
  }
  var scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  (async () => {
    settings = await loadSettings();
    chrome.storage.onChanged.addListener(async (_c, area) => {
      if (area === "sync") settings = await loadSettings();
    });
    scan();
  })();
})();
 })(chrome);
  return 'injected';
})()