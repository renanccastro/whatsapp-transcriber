import { MODELS, loadSettings } from './settings.js';

const $ = (id) => document.getElementById(id);

(async () => {
  const s = await loadSettings();
  const model = $('model');
  for (const [key, m] of Object.entries(MODELS)) {
    if (m.hidden) continue;
    model.append(new Option(`${m.label} (${m.size})`, key));
  }
  $('auto').checked = s.auto;
  model.value = s.model;
  $('language').value = s.language;

  $('auto').addEventListener('change', (e) => chrome.storage.sync.set({ auto: e.target.checked }));
  model.addEventListener('change', (e) => chrome.storage.sync.set({ model: e.target.value }));
  $('language').addEventListener('change', (e) => chrome.storage.sync.set({ language: e.target.value }));

  chrome.runtime.sendMessage({ type: 'status' }).then((r) => {
    $('device').textContent = r?.device === 'webgpu'
      ? 'Usando a placa de vídeo (rápido).'
      : 'Sem placa de vídeo disponível: usando o processador. Áudios longos podem demorar.';
  });

  const { cloudInterest, counters = {} } = await chrome.storage.local.get(['cloudInterest', 'counters']);
  const markDone = () => { $('cloud').hidden = true; $('cloud-done').hidden = false; };
  if (cloudInterest) markDone();
  $('cloud').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'track', event: 'cloud_interest', props: { from: 'popup' } });
    chrome.storage.local.set({ cloudInterest: true });
    markDone();
  });

  const n = counters.transcription_done || 0;
  $('stats').textContent = n ? `${n} ${n === 1 ? 'áudio transcrito' : 'áudios transcritos'} até agora.` : '';
})();
