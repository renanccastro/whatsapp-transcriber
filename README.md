# Zap Transcreve

Extensão do Chrome que transcreve os áudios do WhatsApp Web dentro do balão da
mensagem. O Whisper roda no service worker da extensão (transformers.js:
WebGPU quando há placa de vídeo, WASM nos outros casos). O áudio não sai do
navegador.

## Como funciona

- `src/page.js` (mundo MAIN do WhatsApp Web): pega a mensagem em
  `WAWebCollections.Msg`, chama `msg.downloadMedia()` e lê o Ogg/Opus de
  `WAWebMediaInMemoryBlobCache`. O áudio não toca.
- `src/content.js`: acha os botões "Reproduzir mensagem de voz", põe a caixa da
  transcrição no balão, decodifica para PCM 16 kHz e manda ao service worker por
  uma `port` (a port também mantém o worker vivo). As transcrições ficam em
  `chrome.storage.local`.
- `src/background.js`: pipeline `automatic-speech-recognition`, uma
  transcrição por vez. O modelo fica no Cache Storage depois do primeiro uso.
- Nuvem paga: só o "em breve". Os cliques viram o evento `cloud_interest`.
  Para enviar os eventos ao PostHog, faça o build com `POSTHOG_KEY=phc_... npm run build`.

## Desenvolvimento

```sh
npm install
npm run build        # gera dist/
npm test             # Chromium + extensão + WhatsApp falso + jfk.ogg
SUITE=pt npm test    # mesmo teste com áudios em português (whisper-small)
npm run zip          # zap-transcreve.zip
```

Teste no WhatsApp de verdade sem instalar a extensão:
`node test/live/make-inject.mjs` gera `test/live/inject.js`. Cole na aba
logada. Ele roda o `page.js` e o `content.js` compilados, troca só a API
`chrome.*` e responde com a duração decodificada no lugar do texto.

Instalar: `chrome://extensions` → Modo do desenvolvedor → "Carregar sem
compactação" → pasta `dist/`.
