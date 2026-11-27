/*
 * API OCR hoá đơn cho Sổ Nhà, ghép từ pipeline của sakutara/chia-tien (MIT; model VietOCR Apache-2.0).
 * Bundle thành js/ocr/ocr.js (+ ocr-worker.js). Toàn bộ chạy trên máy, không gửi ảnh đi đâu.
 *
 *   import { scanReceipt } from './ocr/ocr.js'
 *   const r = await scanReceipt(file, { onProgress: (p, stage) => … , signal })
 *   r.summary → { vendor, date, total, items[], status, notes[] }
 */
import { scanReceiptImage } from '@up/lib/imageScan'
import { parseReceipt } from '@up/domain/receiptParser'
import { validateReceipt, type ReceiptCheck } from '@up/domain/receiptValidation'
import { reflowBlockText } from '@up/domain/blockTextReceipt'
import { computeBill } from '@up/domain/billMath'
import type { ParsedAdjustment } from '@up/domain/receiptParser'
import { runOcr, terminateOcrWorker, setModelBase, lastOcrError, type OcrProgressHandler } from './ocrService'
import { readAppReceipt, mergeScreens, type AppReceipt, type AppSource } from './appReceipt'
import { readPosReceipt, stripIdLines, type PosReceipt } from './posReceipt'

export { terminateOcrWorker, setModelBase, lastOcrError }

export interface ReceiptItem {
  name: string
  quantity: number
  unitPrice: number
  amount: number
  /** SL × đơn giá lệch thành tiền, hoặc dòng đã bị tự sửa: nên xem lại. */
  check: boolean
}

export interface ReceiptSummary {
  /** paper: bill giấy · order: đơn hàng trong app (Shopee…) · payment: biên lai MoMo / ngân hàng */
  kind: 'paper' | 'order' | 'payment'
  source: AppSource | null
  sourceName: string | null
  vendor: string | null
  time: string | null
  fee: number
  orderId: string | null
  paymentMethod: string | null
  content: string | null
  /** yyyy-mm-dd */
  date: string | null
  /** Tổng thanh toán: lấy trên bill, không có thì tự tính từ món + giảm giá/phí/VAT. */
  total: number | null
  totalSource: 'bill' | 'computed' | null
  items: ReceiptItem[]
  discount: number
  service: number
  vat: number
  /** OK: khớp tổng · CORRECTED: đã tự sửa số · MISMATCH: lệch, cần sửa tay · UNVERIFIED: bill không có dòng tổng */
  status: ReceiptCheck['status']
  /** Đơn app chỉ hiện Thành tiền, ẩn chi tiết voucher / phí ship */
  hiddenBreakdown?: boolean
  notes: string[]
}

export interface ScanResult {
  /** Văn bản OCR đã ghép dòng (dữ liệu thô). */
  text: string
  /** Ảnh đã cắt + nắn thẳng (xám) nếu dò được tờ giấy, không thì ảnh gốc (ảnh đầu tiên). */
  image: Blob
  cropped: boolean
  /** Kết quả bộ đọc bill giấy (null khi là ảnh app). */
  check: ReceiptCheck | null
  app: AppReceipt | null
  pos: PosReceipt | null
  summary: ReceiptSummary
}

export function summarizeApp(a: AppReceipt): ReceiptSummary {
  return {
    kind: a.kind,
    source: a.source,
    sourceName: a.sourceName,
    vendor: a.merchant,
    date: a.date,
    time: a.time,
    total: a.total,
    totalSource: a.total == null ? null : 'bill',
    items: a.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, amount: i.amount, check: i.check })),
    discount: a.discount,
    service: 0,
    vat: 0,
    fee: a.fee,
    orderId: a.orderId,
    paymentMethod: a.paymentMethod,
    content: a.content,
    status: a.status,
    hiddenBreakdown: !!a.hiddenBreakdown,
    notes: a.notes,
  }
}

function summarizePos(p: PosReceipt, check: ReceiptCheck): ReceiptSummary {
  return {
    ...summarize(check),
    total: p.total,
    totalSource: p.total == null ? null : p.status === 'UNVERIFIED' ? 'computed' : 'bill',
    items: p.items.map((i) => ({ ...i })),
    discount: p.discount,
    service: 0,
    vat: 0,
    fee: p.fee,
    status: p.status,
    notes: p.notes,
  }
}

const good = (s: string) => s === 'OK' || s === 'CORRECTED'

/** Giờ in trên bill: hh:mm nằm cùng dòng với ngày (VD "Ngay : 27-11-2026 13:51"). */
function billTime(text: string): string | null {
  for (const line of text.split('\n')) {
    if (!/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(line)) continue
    const m = /\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/.exec(line)
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  }
  return null
}

/**
 * Văn bản OCR (một hoặc nhiều ảnh) → ảnh app nếu nhận ra, không thì bill giấy.
 * Bill giấy chạy hai bộ đọc: của chia-tien (bill siêu thị "Tên · SL · Đơn giá · Thành tiền")
 * và posReceipt (bill quán "SL · Tên · Thành tiền", topping, dòng khuyến mãi); bên nào khớp tổng thì dùng.
 */
export function analyzeText(text: string): { check: ReceiptCheck | null; app: AppReceipt | null; pos: PosReceipt | null; summary: ReceiptSummary } {
  const app = readAppReceipt(text)
  if (app && (app.total != null || app.items.length)) return { check: null, app, pos: null, summary: summarizeApp(app) }
  const clean = stripIdLines(text)
  const check = validateReceipt(parseReceipt(clean), clean)
  const pos = readPosReceipt(clean)
  // bộ cũ đọc bill kiểu "SL Tên Tiền" thường để dính SL vào đầu tên món
  const qtyInNames = check.receipt.items.length > 0 && check.receipt.items.filter((i) => /^\d{1,2}\s/.test(i.name)).length * 2 >= check.receipt.items.length
  const usePos =
    !!pos &&
    ((pos.status === 'OK' && (!good(check.status) || qtyInNames)) || (check.status === 'MISMATCH' && pos.status === 'UNVERIFIED' && pos.items.length > 0))
  const summary = usePos ? summarizePos(pos!, check) : summarize(check)
  summary.time = billTime(clean)
  return { check, app: null, pos, summary }
}

const NONE = { mode: 'NONE' as const, value: 0 }
const adj = (a?: ParsedAdjustment) => (a ? { mode: a.mode, value: a.value } : NONE)

export function summarize(check: ReceiptCheck): ReceiptSummary {
  const r = check.receipt
  const items = r.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, amount: i.rawAmount, check: i.uncertain }))
  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  let bill = { discountAmount: 0, serviceAmount: 0, vatAmount: 0, totalAmount: subtotal }
  try {
    bill = computeBill({ subtotal, discount: adj(r.discount), service: adj(r.service), vat: r.vatIncluded ? NONE : adj(r.vat) })
  } catch {
    /* giảm giá > tiền hàng: giữ tổng thô */
  }
  const total = r.billTotal ?? (items.length > 0 ? bill.totalAmount : null)
  return {
    kind: 'paper',
    source: null,
    sourceName: null,
    time: null,
    fee: 0,
    orderId: null,
    paymentMethod: null,
    content: null,
    vendor: r.vendorName ?? null,
    date: r.invoiceDate ?? null,
    total,
    totalSource: r.billTotal !== undefined ? 'bill' : total !== null ? 'computed' : null,
    items,
    discount: bill.discountAmount,
    service: bill.serviceAmount,
    vat: bill.vatAmount,
    status: check.status,
    notes: check.notes,
  }
}

/** Phân tích văn bản OCR có sẵn (dán từ công cụ khác, hoặc lớp chữ PDF). */
export function readReceiptText(raw: string): { text: string; check: ReceiptCheck | null; app: AppReceipt | null; pos: PosReceipt | null; summary: ReceiptSummary } {
  const app = readAppReceipt(raw)
  const text = app ? raw : reflowBlockText(raw)
  return { text, ...analyzeText(text) }
}

/** Nhường một nhịp cho trình duyệt vẽ lại màn hình (tiến độ) trước bước tính toán nặng. */
const tick = () => new Promise<void>((r) => setTimeout(r, 30))

/**
 * Thu nhỏ ảnh chụp lớn (iPhone 12–48 MP) về cạnh dài `maxEdge` bằng <img> + canvas.
 * Ảnh <img> tự xoay theo EXIF trên mọi trình duyệt; tránh tuỳ chọn resize của createImageBitmap mà Safari bỏ qua.
 */
async function shrinkImage(file: Blob, maxEdge = 2800): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const w = img.naturalWidth
    const h = img.naturalHeight
    const long = Math.max(w, h)
    if (!w || !h) throw new Error('ảnh rỗng')
    if (long <= maxEdge && file.type !== 'image/heic' && file.type !== 'image/heif') return { blob: file, width: w, height: h }
    const scale = Math.min(1, maxEdge / long)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2D không khả dụng')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
    canvas.width = canvas.height = 0
    if (!blob) throw new Error('không mã hoá được ảnh')
    return { blob, width: w, height: h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function stepError(step: string, err: unknown): Error & { code: string; detail: string } {
  const e = new Error('Không mở được ảnh này. Thử chụp lại hoặc chọn ảnh khác.') as Error & { code: string; detail: string }
  e.code = 'OCR_FAILED'
  e.detail = `[${step}] ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`
  return e
}

/**
 * Ảnh chụp màn hình điện thoại: PNG, hoặc khung dài hơn 1,9 lần (màn hình ~19,5:9; ảnh camera 4:3 hoặc 16:9).
 * Ảnh bill đã tự cắt sát trong app Ảnh cũng dài như vậy, khi đó cũng không cần cắt thêm.
 */
export function looksLikeScreenshot(type: string, width: number, height: number): boolean {
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height))
  return type === 'image/png' || ratio >= 1.9
}

/**
 * Ảnh → thu nhỏ → (cắt/nắn nếu là bill giấy) → VietOCR → ghép dòng → phân tích → đối chiếu tổng.
 * `screenshot`: true = ảnh chụp màn hình app (không cắt) · false = ảnh chụp bill giấy (cắt, nắn)
 * · 'auto' (mặc định) = tự nhận theo từng ảnh. Nhiều ảnh được ghép thành một đơn.
 */
export async function scanReceipt(
  input: File | File[],
  options: { onProgress?: OcrProgressHandler; signal?: AbortSignal; screenshot?: boolean | 'auto' } = {},
): Promise<ScanResult> {
  const files = Array.isArray(input) ? input : [input]
  const { onProgress } = options
  let cropped = false
  const images: Blob[] = []
  for (let i = 0; i < files.length; i++) {
    const label = files.length > 1 ? ` ${i + 1}/${files.length}` : ''
    onProgress?.(0, `Đang mở ảnh${label}…`)
    await tick()
    let img: Blob
    let isScreen: boolean
    try {
      const shrunk = await shrinkImage(files[i])
      img = shrunk.blob
      const mode = options.screenshot ?? 'auto'
      isScreen = mode === 'auto' ? looksLikeScreenshot(files[i].type, shrunk.width, shrunk.height) : mode
    } catch (err) {
      throw stepError('mở ảnh', err)
    }
    if (options.signal?.aborted) throw Object.assign(new Error('Đã huỷ'), { code: 'OCR_CANCELLED' })
    if (!isScreen) {
      onProgress?.(0, `Đang cắt và nắn ảnh${label}…`)
      await tick()
      const asFile = new File([img], files[i].name.replace(/\.[^.]+$/, '') + '.jpg', { type: img.type || 'image/jpeg' })
      const scanned = await scanReceiptImage(asFile).catch((err) => {
        console.warn('[ocr] cắt ảnh', err)
        return null // không cắt được thì đọc nguyên ảnh
      })
      cropped ||= !!scanned?.cropped
      img = scanned?.file ?? img
    }
    images.push(img)
  }
  const texts = await runOcr(images, options)
  const text = files.length > 1 ? mergeScreens(texts) : texts[0]
  return { text, image: images[0], cropped, ...analyzeText(text) }
}

/** Chỉ đọc chữ (không cắt ảnh), trả văn bản thô của từng ảnh. */
export async function ocrTexts(files: Blob[], options: { onProgress?: OcrProgressHandler; signal?: AbortSignal } = {}): Promise<string[]> {
  return runOcr(files, options)
}
