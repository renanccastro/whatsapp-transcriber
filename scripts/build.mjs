import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
// Public project token of the "Zap Transcreve" PostHog project (669115).
// POSTHOG_KEY= (empty) builds without analytics, as `npm test` does.
const POSTHOG_KEY = 'phc_n6ptDxAAGg8WVMCF4Xn8zn38fFKPArBPkHk2V2E9AKpX';

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(resolve(root, 'public'), dist, { recursive: true });
// onnxruntime-web's bundled build loads its WASM binary next to the script.
copyFileSync(
  resolve(root, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm'),
  resolve(dist, 'ort-wasm-simd-threaded.asyncify.wasm'),
);

const common = {
  bundle: true,
  target: 'chrome124',
  logLevel: 'info',
  define: { 'process.env.POSTHOG_KEY': JSON.stringify(process.env.POSTHOG_KEY ?? POSTHOG_KEY) },
};

await build({ ...common, entryPoints: [resolve(root, 'src/background.js')], outfile: resolve(dist, 'background.js'), format: 'esm' });
for (const name of ['content', 'page', 'popup']) {
  await build({ ...common, entryPoints: [resolve(root, `src/${name}.js`)], outfile: resolve(dist, `${name}.js`), format: 'iife' });
}
