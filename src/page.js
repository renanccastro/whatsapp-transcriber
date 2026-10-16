// Runs in the WhatsApp Web page (MAIN world). Uses WhatsApp's own modules to
// download a voice message without playing it, then hands the Ogg/Opus bytes
// to the content script.
(() => {
  const SRC_IN = 'zt-content';
  const SRC_OUT = 'zt-page';

  function findMsg(id) {
    const { Msg } = window.require('WAWebCollections');
    return Msg.getModelsArray().find((m) => m.id?.id === id);
  }

  async function fetchAudio(id) {
    const msg = findMsg(id);
    if (!msg) throw new Error('Mensagem não encontrada');
    if (msg.type !== 'ptt' && msg.type !== 'audio') throw new Error('Não é um áudio');
    const cache = window.require('WAWebMediaInMemoryBlobCache').InMemoryMediaBlobCache;
    let blob = cache.get(msg.filehash);
    if (!blob) {
      await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1, isUserInitiated: true });
      blob = cache.get(msg.filehash);
    }
    if (!blob) throw new Error('Não consegui baixar o áudio');
    return { buffer: await blob.arrayBuffer(), duration: Number(msg.duration) || 0 };
  }

  window.addEventListener('message', async (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.source !== SRC_IN || d.type !== 'fetch-audio') return;
    try {
      const { buffer, duration } = await fetchAudio(d.id);
      window.postMessage({ source: SRC_OUT, reqId: d.reqId, ok: true, buffer, duration }, '*', [buffer]);
    } catch (e) {
      window.postMessage({ source: SRC_OUT, reqId: d.reqId, ok: false, error: String(e?.message || e) }, '*');
    }
  });
})();
