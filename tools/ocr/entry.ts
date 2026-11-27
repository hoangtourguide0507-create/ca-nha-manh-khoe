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
  vendor: string | null
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
  /** Ảnh đã cắt + nắn thẳng (xám) nếu dò được tờ giấy, không thì ảnh gốc. */
  image: Blob
  cropped: boolean
  check: ReceiptCheck
  summary: ReceiptSummary
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
export function readReceiptText(raw: string): { text: string; check: ReceiptCheck; summary: ReceiptSummary } {
  const text = reflowBlockText(raw)
  const check = validateReceipt(parseReceipt(text), text)
  return { text, check, summary: summarize(check) }
}

/** Ảnh bill → cắt/nắn → VietOCR → ghép dòng → phân tích → đối chiếu tổng. */
export async function scanReceipt(file: File, options: { onProgress?: OcrProgressHandler; signal?: AbortSignal } = {}): Promise<ScanResult> {
  options.onProgress?.(0, 'Đang cắt và nắn ảnh…')
  const scanned = await scanReceiptImage(file).catch(() => null)
  const image = scanned?.file ?? file
  const [text] = await runOcr([image], options)
  const check = validateReceipt(parseReceipt(text), text)
  return { text, image, cropped: scanned?.cropped ?? false, check, summary: summarize(check) }
}
