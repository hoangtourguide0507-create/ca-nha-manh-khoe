// Dựng js/ocr/ từ mã nguồn chia-tien.
// Cách chạy:  node tools/ocr/build.mjs <đường dẫn tới chia-tien>   (cần esbuild; chia-tien/app đã `npm ci`)
// Model + WASM chép từ chia-tien/docs/ocr/vietocr (bản đầy đủ, không phải con trỏ LFS) sang ocr/vietocr/.
import { build } from 'esbuild'
import { cpSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const upstream = resolve(process.argv[2] || '../chia-tien')
const src = join(upstream, 'app/src')
const nodeModules = join(upstream, 'app/node_modules')

// '@up/…' → chia-tien/app/src/…; mọi import i18n của upstream → shim tiếng Việt.
const upstreamPaths = {
  name: 'upstream-paths',
  setup(b) {
    b.onResolve({ filter: /^@up\// }, (a) => ({ path: join(src, a.path.slice(4)) + '.ts' }))
    b.onResolve({ filter: /(^|\/)i18n$/ }, (a) => (a.importer.startsWith(src) ? { path: join(here, 'i18n-shim.ts') } : undefined))
  },
}

const common = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  nodePaths: [nodeModules],
  plugins: [upstreamPaths],
  logLevel: 'info',
}

const out = join(root, 'js/ocr')
mkdirSync(out, { recursive: true })
await build({ ...common, entryPoints: [join(here, 'entry.ts')], outfile: join(out, 'ocr.js') })
await build({ ...common, entryPoints: [join(here, 'vietOcrWorker.ts')], outfile: join(out, 'ocr-worker.js') })

const models = join(upstream, 'docs/ocr/vietocr')
if (statSync(join(models, 'vietocr_encoder.onnx')).size < 1_000_000) throw new Error('encoder là con trỏ LFS, chưa phải model thật')
cpSync(models, join(root, 'ocr/vietocr'), { recursive: true })
console.log('Xong: js/ocr/, ocr/vietocr/')
