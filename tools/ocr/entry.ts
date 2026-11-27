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
import { runOcr, terminateOcrWorker, setModelBase, type OcrProgressHandler } from './ocrService'
import { readAppReceipt, mergeScreens, type AppReceipt, type AppSource } from './appReceipt'

export { terminateOcrWorker, setModelBase }

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
    notes: a.notes,
  }
}

/** Văn bản OCR (một hoặc nhiều ảnh) → ảnh app nếu nhận ra, không thì bộ đọc bill giấy. */
export function analyzeText(text: string): { check: ReceiptCheck | null; app: AppReceipt | null; summary: ReceiptSummary } {
  const app = readAppReceipt(text)
  if (app && (app.total != null || app.items.length)) return { check: null, app, summary: summarizeApp(app) }
  const check = validateReceipt(parseReceipt(text), text)
  return { check, app: null, summary: summarize(check) }
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
export function readReceiptText(raw: string): { text: string; check: ReceiptCheck | null; app: AppReceipt | null; summary: ReceiptSummary } {
  const app = readAppReceipt(raw)
  const text = app ? raw : reflowBlockText(raw)
  return { text, ...analyzeText(text) }
}

/**
 * Ảnh → (cắt/nắn nếu là bill giấy) → VietOCR → ghép dòng → phân tích → đối chiếu tổng.
 * `screenshot: true`: ảnh chụp màn hình app, không cắt; nhiều ảnh được ghép thành một đơn.
 */
export async function scanReceipt(
  input: File | File[],
  options: { onProgress?: OcrProgressHandler; signal?: AbortSignal; screenshot?: boolean } = {},
): Promise<ScanResult> {
  const files = Array.isArray(input) ? input : [input]
  let cropped = false
  let images: Blob[] = files
  if (!options.screenshot) {
    options.onProgress?.(0, 'Đang cắt và nắn ảnh…')
    images = []
    for (const f of files) {
      const scanned = await scanReceiptImage(f).catch(() => null)
      cropped ||= !!scanned?.cropped
      images.push(scanned?.file ?? f)
    }
  }
  const texts = await runOcr(images, options)
  const text = files.length > 1 ? mergeScreens(texts) : texts[0]
  return { text, image: images[0], cropped, ...analyzeText(text) }
}

/** Chỉ đọc chữ (không cắt ảnh), trả văn bản thô của từng ảnh. */
export async function ocrTexts(files: Blob[], options: { onProgress?: OcrProgressHandler; signal?: AbortSignal } = {}): Promise<string[]> {
  return runOcr(files, options)
}
