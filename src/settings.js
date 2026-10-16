export const MODELS = {
  // Hidden from the popup (tests only): it invents text in Portuguese.
  tiny: { id: 'onnx-community/whisper-tiny', label: 'Tiny', size: '~40 MB', hidden: true },
  base: { id: 'onnx-community/whisper-base', label: 'Rápido, erra mais', size: '~80 MB' },
  small: { id: 'onnx-community/whisper-small', label: 'Preciso — recomendado', size: '~250–400 MB' },
  turbo: { id: 'onnx-community/whisper-large-v3-turbo', label: 'Máximo (precisa de placa de vídeo)', size: '~1,5 GB' },
};

export const DEFAULT_SETTINGS = {
  auto: true,
  model: 'small',
  language: 'portuguese',
};

export async function loadSettings() {
  const s = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...s };
}
