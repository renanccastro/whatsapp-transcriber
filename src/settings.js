export const MODELS = {
  tiny: { id: 'onnx-community/whisper-tiny', label: 'Rápido', size: '~40 MB' },
  base: { id: 'onnx-community/whisper-base', label: 'Equilibrado', size: '~80 MB' },
  small: { id: 'onnx-community/whisper-small', label: 'Preciso', size: '~250 MB' },
  turbo: { id: 'onnx-community/whisper-large-v3-turbo', label: 'Máximo (precisa de placa de vídeo)', size: '~800 MB' },
};

export const DEFAULT_SETTINGS = {
  auto: true,
  model: 'base',
  language: 'portuguese',
};

export async function loadSettings() {
  const s = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...s };
}
