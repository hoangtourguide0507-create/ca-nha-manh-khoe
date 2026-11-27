/*
 * Bản chỉnh của chia-tien app/src/services/ocrService.ts cho Sổ Nhà:
 * - worker là file đã bundle `ocr-worker.js` nằm cạnh `ocr.js`
 * - thư mục model đặt qua `setModelBase()` (mặc định `<gốc app>/ocr/vietocr/`)
 * Còn lại giữ nguyên: một worker dùng lại giữa các lần quét, tự dừng sau 15 giây rảnh, huỷ được.
 */
import { prepareForOcr } from '@up/lib/imagePreprocess'
import { layoutOcrText, type OcrWord } from '@up/domain/ocrLayout'
import { PeopleError } from '@up/services/peopleErrors'
import type { WorkerRequest as VietOcrWorkerRequest, WorkerResponse as VietOcrWorkerResponse } from './contracts'

const IDLE_MS = 15_000
let baseUrl = new URL('./', document.baseURI).href

/** Gốc chứa thư mục `ocr/vietocr/` (worker nối thêm `ocr/vietocr/`). */
export function setModelBase(url: string): void {
  baseUrl = new URL(url, document.baseURI).href
  terminateOcrWorker()
}

export type OcrProgressHandler = (percent: number, stage: string) => void

interface Session {
  worker: Worker
  abort: AbortController
  ready: Promise<void>
  /** người nghe tiến độ khởi tạo hiện tại (đổi theo lần quét) */
  onStage?: (percent: number, stage: string) => void
}

let session: Session | null = null
let idleTimer: ReturnType<typeof setTimeout> | undefined
const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

const cancelled = () => new PeopleError('OCR_CANCELLED', 'Đã huỷ quét ảnh.')
/** Chi tiết kỹ thuật của lỗi gần nhất, để hiện cho người dùng chụp lại. */
let lastDetail = ''
export const lastOcrError = () => lastDetail
const failed = (detail = '') => {
  if (detail) lastDetail = detail
  const err = new PeopleError('OCR_FAILED', 'Không quét được ảnh. Bạn vẫn có thể nhập tay.') as PeopleError & { detail?: string }
  err.detail = lastDetail
  return err
}
const mb = (n: number) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0)

function ask<T>(
  worker: Worker,
  request: VietOcrWorkerRequest,
  settle: (msg: VietOcrWorkerResponse) => { value: T } | undefined,
  options: { signal: AbortSignal; onProgress?: (percent: number) => void; onStage?: (percent: number, stage: string) => void },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const finish = (fn: () => void) => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      options.signal.removeEventListener('abort', onAbort)
      fn()
    }
    const onMessage = (event: MessageEvent<VietOcrWorkerResponse>) => {
      const msg = event.data
      if (msg.requestId !== request.requestId) return
      if (msg.type === 'PROGRESS') return void options.onProgress?.(msg.percent)
      if (msg.type === 'DOWNLOAD') {
        return void options.onStage?.(Math.round((msg.loaded / msg.total) * 100), `Đang tải bộ đọc chữ ${mb(msg.loaded)}/${mb(msg.total)} MB (chỉ lần đầu)…`)
      }
      if (msg.type === 'STAGE') return void options.onStage?.(100, msg.stage)
      if (msg.type === 'ERROR') {
        console.warn('[ocr]', msg.message)
        return finish(() => reject(failed(msg.message)))
      }
      const done = settle(msg)
      if (done) finish(() => resolve(done.value))
    }
    const onError = (e: ErrorEvent) => {
      console.warn('[ocr] worker', e.message)
      finish(() => reject(failed(`worker: ${e.message || 'không chạy được (trình duyệt có thể quá cũ hoặc thiếu bộ nhớ)'}${e.filename ? ` @ ${e.filename.split('/').pop()}:${e.lineno}` : ''}`)))
    }
    const onAbort = () => finish(() => reject(cancelled()))
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    options.signal.addEventListener('abort', onAbort, { once: true })
    if (options.signal.aborted) onAbort()
    else worker.postMessage(request)
  })
}

function createSession(): Session {
  const worker = new Worker(new URL('./ocr-worker.js', import.meta.url), { type: 'module' })
  const abort = new AbortController()
  const s = { worker, abort } as Session
  s.ready = ask(worker, { type: 'INIT', requestId: newId(), baseUrl }, (m) => (m.type === 'READY' ? { value: undefined } : undefined), {
    signal: abort.signal,
    onStage: (p, stage) => s.onStage?.(p, stage),
  })
  s.ready.catch(() => undefined)
  return s
}

export function terminateOcrWorker(): void {
  clearTimeout(idleTimer)
  idleTimer = undefined
  const current = session
  session = null
  if (!current) return
  current.abort.abort()
  current.worker.terminate()
}

/** Quét từng ảnh theo thứ tự, trả về văn bản đã ghép dòng/cột của mỗi ảnh. */
export async function runOcr(images: Blob[], options: { onProgress?: OcrProgressHandler; signal?: AbortSignal } = {}): Promise<string[]> {
  const { onProgress, signal } = options
  lastDetail = ''
  if (signal?.aborted) throw cancelled()
  const onAbort = () => terminateOcrWorker()
  signal?.addEventListener('abort', onAbort, { once: true })
  clearTimeout(idleTimer)
  idleTimer = undefined
  try {
    onProgress?.(0, 'Đang khởi động bộ đọc chữ…')
    if (!session) session = createSession()
    const current = session
    current.onStage = onProgress
    await current.ready
    current.onStage = undefined
    const texts: string[] = []
    for (let i = 0; i < images.length; i++) {
      if (signal?.aborted) throw cancelled()
      const share = (p: number) => Math.round(((i + p / 100) / images.length) * 100)
      onProgress?.(share(0), `Đang chuẩn bị ảnh ${i + 1}/${images.length}…`)
      const prepared = await prepareForOcr(images[i])
      const lines = await ask<OcrWord[]>(
        current.worker,
        { type: 'RECOGNIZE', requestId: newId(), image: prepared },
        (m) => (m.type === 'RESULT' ? { value: m.lines } : undefined),
        { signal: current.abort.signal, onProgress: (p) => onProgress?.(share(p), 'Đang đọc chữ…') },
      )
      texts.push(layoutOcrText(lines))
    }
    onProgress?.(100, 'Xong')
    return texts
  } catch (err) {
    if (signal?.aborted) throw cancelled()
    if (err instanceof PeopleError) throw err
    console.warn('[ocr]', err)
    throw failed(err instanceof Error ? `${err.name}: ${err.message}` : String(err))
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (signal?.aborted) terminateOcrWorker()
    else idleTimer = setTimeout(terminateOcrWorker, IDLE_MS)
  }
}
