// Service worker: runs Whisper locally with transformers.js (WebGPU when the
// GPU is available, WASM otherwise). Content scripts talk to it over a port,
// which also keeps the worker alive during long transcriptions.
import { pipeline, env } from '@huggingface/transformers';
import { MODELS, DEFAULT_SETTINGS } from './settings.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1; // Workers (threads) are not available in a service worker.

let device = null;
const pipelines = new Map(); // `${model}|${device}` -> Promise<pipeline>
let queue = Promise.resolve();

async function getDevice() {
  if (device) return device;
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    device = adapter ? 'webgpu' : 'wasm';
  } catch {
    device = 'wasm';
  }
  return device;
}

function dtypeFor(dev) {
  return dev === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8';
}

async function getPipeline(modelKey, onProgress) {
  const dev = await getDevice();
  const model = MODELS[modelKey] || MODELS[DEFAULT_SETTINGS.model];
  const key = `${model.id}|${dev}`;
  if (!pipelines.has(key)) {
    const p = pipeline('automatic-speech-recognition', model.id, {
      device: dev,
      dtype: dtypeFor(dev),
      progress_callback: (e) => onProgress?.(e),
    }).catch((err) => {
      pipelines.delete(key);
      throw err;
    });
    pipelines.set(key, p);
  }
  return { asr: await pipelines.get(key), dev, model };
}

function decodePcm(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 32768;
  return out;
}

async function transcribe({ pcm, settings }, post) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const audio = decodePcm(pcm);
  const files = new Map();
  const { asr, dev, model } = await getPipeline(s.model, (e) => {
    // Small config files finish first and would make the bar jump to 100%.
    if (e.status === 'progress' && e.total > 1_000_000) {
      files.set(e.file, [e.loaded, e.total]);
      let loaded = 0;
      let total = 0;
      for (const [l, t] of files.values()) { loaded += l; total += t; }
      post({ type: 'progress', stage: 'download', pct: Math.round((loaded / total) * 100) });
    }
  });
  post({ type: 'progress', stage: 'transcribe' });
  const t0 = performance.now();
  const result = await asr(audio, {
    language: s.language === 'auto' ? null : s.language,
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const text = (Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text).trim();
  return { text, device: dev, model: model.id, ms: Math.round(performance.now() - t0), seconds: audio.length / 16000 };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'zt') return;
  port.onMessage.addListener((msg) => {
    if (msg.type === 'ping') return;
    if (msg.type !== 'transcribe') return;
    const post = (m) => { try { port.postMessage({ ...m, reqId: msg.reqId }); } catch { /* port closed */ } };
    post({ type: 'progress', stage: 'queued' });
    queue = queue
      .then(() => transcribe(msg, post))
      .then((r) => post({ type: 'done', ...r }))
      .catch((e) => post({ type: 'error', error: String(e?.message || e) }));
  });
});

// Anonymous usage events (no audio, no text). Counts stay local; they also go
// to PostHog when POSTHOG_KEY is set at build time.
const POSTHOG_KEY = process.env.POSTHOG_KEY || '';
const POSTHOG_HOST = 'https://us.i.posthog.com';

async function track(event, props = {}) {
  const { distinctId: stored, counters = {} } = await chrome.storage.local.get(['distinctId', 'counters']);
  const distinctId = stored || crypto.randomUUID();
  counters[event] = (counters[event] || 0) + 1;
  await chrome.storage.local.set({ distinctId, counters });
  if (!POSTHOG_KEY) return;
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      distinct_id: distinctId,
      properties: { ...props, version: chrome.runtime.getManifest().version, $process_person_profile: false },
    }),
  }).catch(() => {});
}

chrome.runtime.onInstalled.addListener((d) => { if (d.reason === 'install') track('installed'); });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'track') {
    track(msg.event, msg.props).then(() => sendResponse(true));
    return true;
  }
  if (msg?.type === 'status') {
    getDevice().then((dev) => sendResponse({ device: dev }));
    return true;
  }
  return false;
});
