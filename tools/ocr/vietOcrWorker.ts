/*
 * Bản chỉnh cho Sổ Nhà của chia-tien app/src/workers/vietOcrWorker.ts:
 * - tự tải model + WASM (≈110 MB) có báo tiến độ theo MB, lưu vào Cache `sonha-ocr-v1` để lần sau không tải lại
 * - nạp từng model một (không song song) để giảm bộ nhớ đỉnh trên iPhone
 * - báo lỗi kèm bước đang làm
 * Phần nhận dạng giữ nguyên.
 *
 * Web Worker chạy VietOCR ONNX (repo duchoa1297/vietocr-onnx): detector DB + encoder/decoder vgg_seq2seq.
 * Worker giữ session trong RAM giữa các lần quét và được terminate khi rảnh hoặc khi rời màn (memoryLifecycle).
 * Giao thức: `VietOcrWorkerRequest` / `VietOcrWorkerResponse`.
 */
import * as ort from 'onnxruntime-web/wasm'
import {
  chooseOrientation,
  detectProbability,
  detectorInputSize,
  estimateSkewAngle,
  findTextBoxes,
  GATE_MEAN_CONF,
  orientationMean,
  recognizeLineScored,
  recognizerWidth,
  SKEW_MIN_DEGREES,
  toRecognizerTensor,
  type EncodeResult,
  type OrientationScore,
  type Rotation,
  type VietOcrEngine,
  type VietOcrMeta,
} from '@up/domain/vietOcr'
import type { OcrWord } from '@up/domain/ocrLayout'
import type { WorkerRequest as VietOcrWorkerRequest, WorkerResponse as VietOcrWorkerResponse } from './contracts'

/** Chiều cao cố định đầu vào của encoder (xem vietocr.json). */
const REC_HEIGHT = 32
/** Số chiều đặc trưng của encoder/decoder (xem mô tả model). */
const FEATURE_DIM = 512

/** Phần của scope worker mà file này dùng. */
const scope = self as unknown as { postMessage(message: VietOcrWorkerResponse): void; onmessage: ((e: MessageEvent<VietOcrWorkerRequest>) => void) | null }

let engine: VietOcrEngine | null = null
let meta: VietOcrMeta | null = null

const CACHE = 'sonha-ocr-v1'
let step = 'khởi động'

const KNOWN_SIZE: Record<string, number> = {
  'ort-wasm-simd-threaded.wasm': 11133407,
  'det.onnx': 9929594,
  'vietocr_encoder.onnx': 84317562,
  'vietocr_decoder.onnx': 5140562,
}

/** Tải lần lượt từng file (ưu tiên Cache), báo tiến độ theo byte trên tổng các file chưa có. */
class Loader {
  private cache: Cache | null = null
  private missing = new Set<string>()
  private total = 0
  private loaded = 0
  private lastPost = 0
  constructor(private requestId: string) {}

  async plan(urls: string[]): Promise<void> {
    this.cache = typeof caches !== 'undefined' ? await caches.open(CACHE).catch(() => null) : null
    for (const u of urls) {
      const hit = this.cache ? await this.cache.match(u).catch(() => undefined) : undefined
      if (!hit) {
        this.missing.add(u)
        this.total += KNOWN_SIZE[u.split('/').pop() || ''] || 1_000_000
      }
    }
    if (this.total) this.post()
  }

  private post(): void {
    scope.postMessage({ type: 'DOWNLOAD', requestId: this.requestId, loaded: this.loaded, total: Math.max(this.total, this.loaded) })
  }

  async get(url: string): Promise<Uint8Array> {
    const name = url.split('/').pop()
    if (!this.missing.has(url) && this.cache) {
      step = `đọc ${name} từ bộ nhớ máy`
      const hit = await this.cache.match(url).catch(() => undefined)
      if (hit) return new Uint8Array(await hit.arrayBuffer())
    }
    step = `tải ${name}`
    this.post()
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok || !res.body) throw new Error(`Tải ${name} lỗi HTTP ${res.status}`)
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let got = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      got += value.length
      this.loaded += value.length
      const now = Date.now()
      if (now - this.lastPost > 250) {
        this.lastPost = now
        this.post()
      }
    }
    const buf = new Uint8Array(got)
    let off = 0
    for (const c of chunks) {
      buf.set(c, off)
      off += c.length
    }
    chunks.length = 0
    step = `lưu ${name} vào máy`
    if (this.cache) await this.cache.put(url, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => undefined)
    this.post()
    return buf
  }
}

/** Tạo session từ file trong ocr/vietocr và đọc vietocr.json. Chạy CPU/WASM để không cần WebGPU hay cross-origin isolation. */
async function init(baseUrl: string, requestId: string): Promise<void> {
  const dir = `${baseUrl}ocr/vietocr/`
  step = 'đọc vietocr.json'
  const metaResponse = await fetch(`${dir}vietocr.json`)
  if (!metaResponse.ok) throw new Error(`vietocr.json HTTP ${metaResponse.status}`)
  meta = (await metaResponse.json()) as VietOcrMeta

  const files = ['ort/ort-wasm-simd-threaded.wasm', 'det.onnx', 'vietocr_encoder.onnx', 'vietocr_decoder.onnx'].map((f) => dir + f)
  const loader = new Loader(requestId)
  await loader.plan(files)

  const wasm = await loader.get(files[0])
  ort.env.wasm.wasmPaths = `${dir}ort/`
  ort.env.wasm.wasmBinary = wasm.buffer as ArrayBuffer
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  const options = { executionProviders: ['wasm'] }
  // tải xong file nào nạp file đó, không giữ cùng lúc nhiều bản model trong bộ nhớ
  const load = async (i: number, label: string) => {
    const buf = await loader.get(files[i])
    step = `nạp ${label}`
    scope.postMessage({ type: 'STAGE', requestId, stage: `Đang nạp bộ đọc chữ (${i}/3)…` })
    return ort.InferenceSession.create(buf, options)
  }
  const det = await load(1, 'model dò chữ')
  const encoder = await load(2, 'model đọc chữ (encoder)')
  const decoder = await load(3, 'model đọc chữ (decoder)')
  step = 'sẵn sàng'

  engine = {
    async detect(input, w, h) {
      const out = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, h, w]) })
      return out[det.outputNames[0]].data as Float32Array
    },
    async encode(input, w): Promise<EncodeResult> {
      const out = await encoder.run({ image: new ort.Tensor('float32', input, [1, 3, REC_HEIGHT, w]) })
      const encoderOutputs = out.encoder_outputs.data as Float32Array
      return {
        hidden: out.hidden.data as Float32Array,
        encoderOutputs,
        encoderSteps: encoderOutputs.length / FEATURE_DIM,
      }
    },
    async decodeStep(token, hidden, encoderOutputs, encoderSteps) {
      const out = await decoder.run({
        tgt: new ort.Tensor('int64', BigInt64Array.from([BigInt(token)]), [1]),
        hidden: new ort.Tensor('float32', hidden, [1, hidden.length]),
        encoder_outputs: new ort.Tensor('float32', encoderOutputs, [encoderSteps, 1, FEATURE_DIM]),
      })
      return { logProbs: out.log_probs.data as Float32Array, hidden: out.new_hidden.data as Float32Array }
    },
  }
}

/** Cắt (nếu có) và resize một vùng của ảnh nguồn về dw × dh, trả về RGBA. Thu nhỏ bằng lọc chất lượng cao để chữ mượt. */
function regionRgba(source: ImageBitmap | OffscreenCanvas, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(dw, dh)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2D không khả dụng')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh)
  return ctx.getImageData(0, 0, dw, dh).data
}

/** Xoay ảnh quanh tâm để làm thẳng dòng chữ (góc dương là nghiêng theo chiều kim đồng hồ, nên xoay ngược lại); nền trắng. */
function straighten(source: ImageBitmap | OffscreenCanvas, angle: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(source.width, source.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2D không khả dụng')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, source.width, source.height)
  ctx.translate(source.width / 2, source.height / 2)
  ctx.rotate((-angle * Math.PI) / 180)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

/** Xoay ảnh quanh tâm theo bội 90° (90° và 270° hoán đổi chiều rộng và chiều cao); nền trắng. */
function rotateBitmap(bitmap: ImageBitmap, rotation: Rotation): OffscreenCanvas {
  const quarter = rotation === 90 || rotation === 270
  const width = quarter ? bitmap.height : bitmap.width
  const height = quarter ? bitmap.width : bitmap.height
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2D không khả dụng')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.translate(width / 2, height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  return canvas
}

/** Ảnh (gốc hoặc đã xoay) cùng bản đồ xác suất của detector trên ảnh đó. */
interface OrientedProbe {
  source: ImageBitmap | OffscreenCanvas
  det: { w: number; h: number }
  prob: Float32Array
}

async function probeSource(detEngine: VietOcrEngine, source: ImageBitmap | OffscreenCanvas): Promise<OrientedProbe> {
  const det = detectorInputSize(source.width, source.height)
  const prob = await detectProbability(detEngine, regionRgba(source, 0, 0, source.width, source.height, det.w, det.h), det.w, det.h)
  return { source, det, prob }
}

/** Kết quả nhận dạng toàn bộ hộp chữ của một ảnh (một hướng): dòng chữ, tổng điểm tin cậy và số hộp dò được. */
interface Pass extends OrientedProbe {
  lines: OcrWord[]
  conf: number
  boxes: number
}

/** Nhận dạng mọi hộp chữ trên ảnh đã dò; cộng dồn điểm tin cậy và báo tiến độ theo từng hộp. */
async function readPass(requestId: string, probe: OrientedProbe): Promise<Pass> {
  if (!engine || !meta) throw new Error('VietOCR chưa khởi tạo')
  const { source, det, prob } = probe
  const boxes = findTextBoxes(prob, det.w, det.h)
  const scaleX = source.width / det.w
  const scaleY = source.height / det.h
  const lines: OcrWord[] = []
  let conf = 0
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]
    const x0 = box.x0 * scaleX
    const y0 = box.y0 * scaleY
    const bw = (box.x1 - box.x0) * scaleX
    const bh = (box.y1 - box.y0) * scaleY
    if (bw >= 1 && bh >= 1) {
      const width = recognizerWidth(meta, bw, bh)
      const tensor = toRecognizerTensor(regionRgba(source, x0, y0, bw, bh, width, REC_HEIGHT), width, REC_HEIGHT)
      const result = await recognizeLineScored(engine, meta, tensor, width)
      conf += result.confidence
      const text = result.text.trim()
      if (text !== '') lines.push({ text, x0, y0, x1: x0 + bw, y1: y0 + bh })
    }
    scope.postMessage({ type: 'PROGRESS', requestId, percent: Math.round(((i + 1) / boxes.length) * 100) })
  }
  return { ...probe, lines, conf, boxes: boxes.length }
}

function scoreOf(pass: Pass): OrientationScore {
  return { conf: pass.conf, boxes: pass.boxes }
}

async function recognize(requestId: string, image: Blob): Promise<OcrWord[]> {
  if (!engine) throw new Error('VietOCR chưa khởi tạo')
  const bitmap = await createImageBitmap(image)
  try {
    // Nhận dạng toàn bộ hộp ở 0°. Nếu điểm trung bình đạt GATE_MEAN_CONF thì giữ 0° và dùng luôn kết quả này.
    const upright = await readPass(requestId, await probeSource(engine, bitmap))
    let chosen = upright
    const scores: Record<Rotation, OrientationScore> = { 0: scoreOf(upright), 90: { conf: 0, boxes: 0 }, 180: { conf: 0, boxes: 0 }, 270: { conf: 0, boxes: 0 } }
    if (orientationMean(scores[0]) < GATE_MEAN_CONF) {
      // Bill nghiêng: nhận dạng toàn bộ hộp ở 90°, 180°, 270° rồi chọn theo tổng điểm tin cậy.
      const rotatedPasses = new Map<Rotation, Pass>()
      for (const rotation of [90, 180, 270] as const) {
        const pass = await readPass(requestId, await probeSource(engine, rotateBitmap(bitmap, rotation)))
        rotatedPasses.set(rotation, pass)
        scores[rotation] = scoreOf(pass)
      }
      const rotation = chooseOrientation(scores)
      if (rotation !== 0) {
        const picked = rotatedPasses.get(rotation)
        if (picked) chosen = picked
      }
    }
    // Nghiêng đáng kể thì nắn góc rồi nhận dạng lại trên ảnh đã nắn; không thì dùng kết quả đã có của hướng được chọn.
    const angle = estimateSkewAngle(chosen.prob, chosen.det.w, chosen.det.h)
    if (Math.abs(angle) >= SKEW_MIN_DEGREES) {
      const straightened = straighten(chosen.source, angle)
      const probe = await probeSource(engine, straightened)
      return (await readPass(requestId, probe)).lines
    }
    return chosen.lines
  } finally {
    bitmap.close()
  }
}

scope.onmessage = async (event: MessageEvent<VietOcrWorkerRequest>) => {
  const request = event.data
  try {
    if (request.type === 'INIT') {
      await init(request.baseUrl, request.requestId)
      scope.postMessage({ type: 'READY', requestId: request.requestId })
      return
    }
    step = 'đọc chữ trên ảnh'
    const lines = await recognize(request.requestId, request.image)
    scope.postMessage({ type: 'RESULT', requestId: request.requestId, lines })
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    scope.postMessage({ type: 'ERROR', requestId: request.requestId, message: `[${step}] ${msg}` })
  }
}
