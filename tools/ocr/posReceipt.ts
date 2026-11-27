/*
 * Bill máy POS kiểu quán cà phê / trà sữa / fastfood (Highlands, Phúc Long, Katinat, The Coffee House, KFC…):
 *
 *   1   Tra Sen Vang Tran Chau        55.000
 *       Com va Kem La Dua M                       ← topping / ghi chú: nối vào tên món trên
 *   2   Tra Sen Vang M               110.000      ← SL đứng đầu, số cuối là thành tiền
 *       -NWSM.SO.FREE_CAKE           -29.000      ← dòng khuyến mãi (OCR hay làm mất dấu trừ)
 *   Thanh tien:  110.000 · Tong tien: 110.000 · Payoo Bank Card 110.000
 *
 * Viết riêng cho Sổ Nhà, chạy song song với bộ đọc của chia-tien; bên nào khớp tổng thì dùng bên đó.
 * Dòng mã cửa hàng / số hoá đơn / số bàn (ShopID: 30201, Check: 284982…) không bao giờ là món.
 */

export interface PosItem {
  name: string
  quantity: number
  unitPrice: number
  amount: number
  check: boolean
}

export interface PosReceipt {
  items: PosItem[]
  /** Tổng giảm giá / khuyến mãi (số dương). */
  discount: number
  /** Phụ phí, VAT cộng thêm (số dương). */
  fee: number
  total: number | null
  status: 'OK' | 'MISMATCH' | 'UNVERIFIED'
  notes: string[]
}

const fold = (s: string) =>
  s.replace(/[đĐ]/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const AMOUNT = String.raw`[-–]?\s?\d{1,3}(?:[.,]\d{3})+`
/** SL  Tên  [Đơn giá]  Thành tiền */
const ITEM_RE = new RegExp(String.raw`^\s*(\d{1,2})(?:\s*[xX×])?\s+(.*?[A-Za-zÀ-ỹ].*?)\s+(?:(${AMOUNT})\s+)?(${AMOUNT})\s*(?:đ|d|vnd)?\s*$`)
/** Dòng không có SL đầu, có số tiền cuối: khuyến mãi, topping tính tiền… */
const EXTRA_RE = new RegExp(String.raw`^\s*([-–]?)\s*(.*?[A-Za-zÀ-ỹ].*?)\s+(${AMOUNT})\s*(?:đ|d|vnd)?\s*$`)
const TEXT_ONLY = /^[^\d]*[A-Za-zÀ-ỹ]{2,}[^\d]*$|^[^\d]*[A-Za-zÀ-ỹ]{2,}.*\b[SMLX]{1,2}\b\s*$/

const L_SUBTOTAL = /^(thanh tien|tam tinh|tong tien hang|cong tien hang|tien hang|sub ?total|tong phu)\b/
const L_TOTAL = /^(tong tien|tong cong|tong thanh toan|tong so tien|thanh toan|phai thanh toan|phai tra|can tra|total|tong)\b/
const L_FEE = /^(vat|thue|phi dich vu|phu phi|service|svc|phi phuc vu)\b/
const L_DISCOUNT_TOTAL = /^(giam gia|chiet khau|khuyen mai|discount|voucher|uu dai|tong giam)\b/
const L_PAY = /payoo|bank card|\bcard\b|\bthe\b|visa|master|\bjcb\b|tien mat|\bcash\b|momo|zalo ?pay|vnpay|shopee ?pay|chuyen khoan|grabpay|\bqr\b|khach dua|khach tra/
const L_CHANGE = /tien thua|tra lai|tien du|change/
const PROMO = /free|\bkm\b|khuyen mai|giam|discount|voucher|promo|coupon|uu dai|\btang\b|\bqua tang\b|%|off\b|combo off|member|thanh vien|diem/
const ID_LINE = /^(shop ?(id|1d|10|i0)|store ?id|check|pager|pos ?\d*|ma (hd|hoa don|don|gd|giao dich)|so (hd|hoa don|ct|chung tu|phieu|ban|don)|hd so|ban so|ban\s*:|table|bill( no)?|order( no)?|receipt|thu ngan|cashier|nhan vien|nv\b|sdt|dt\b|tel|hotline|mst|ma so thue)/

const toNum = (s: string) => Number(s.replace(/[^\d]/g, ''))
const isNeg = (s: string) => /^[-–]/.test(s.trim())

/** Bỏ các dòng mã số đầu bill (ShopID, Check, số bàn, SĐT…) để bộ đọc nào cũng không lấy nhầm làm món. */
export function stripIdLines(text: string): string {
  return text
    .split('\n')
    .filter((l) => {
      const f = fold(l).trim()
      if (!ID_LINE.test(f)) return true
      // giữ lại nếu dòng có số tiền định dạng nghìn kèm chữ tổng (VD "Ngày… Tổng 50.000" hiếm) — còn lại là dòng mã số
      return /tong|thanh tien/.test(f)
    })
    .join('\n')
}

interface Line {
  kind: 'item' | 'extra' | 'text'
  qty?: number
  name: string
  unit?: number
  amount?: number
  negative?: boolean
  promo?: boolean
}

export function readPosReceipt(text: string): PosReceipt | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const folded = lines.map(fold)

  // vùng món: từ dòng "SL Tên Tiền" đầu tiên tới dòng tổng đầu tiên
  const first = lines.findIndex((l, i) => ITEM_RE.test(l) && !ID_LINE.test(folded[i]))
  if (first < 0) return null
  let end = lines.length
  for (let i = first + 1; i < lines.length; i++) {
    const f = folded[i]
    if (L_SUBTOTAL.test(f) || L_TOTAL.test(f) || L_DISCOUNT_TOTAL.test(f) || L_FEE.test(f) || L_PAY.test(f)) {
      end = i
      break
    }
  }

  const area: Line[] = []
  for (let i = first; i < end; i++) {
    const l = lines[i]
    const f = folded[i]
    let m: RegExpExecArray | null
    if ((m = ITEM_RE.exec(l))) {
      const qty = Number(m[1])
      const amount = toNum(m[4])
      area.push({ kind: 'item', qty: qty || 1, name: m[2].trim(), unit: m[3] ? toNum(m[3]) : undefined, amount, negative: isNeg(m[4]) })
    } else if ((m = EXTRA_RE.exec(l))) {
      const name = m[2].replace(/^[-–]\s*/, '').trim()
      area.push({ kind: 'extra', name, amount: toNum(m[3]), negative: !!m[1] || isNeg(m[3]) || /^[-–]/.test(m[2]), promo: PROMO.test(fold(name)) || /[._]/.test(name.replace(/\s/g, '')) })
    } else if (TEXT_ONLY.test(l) && !ID_LINE.test(f)) {
      area.push({ kind: 'text', name: l })
    }
  }
  const itemCount = area.filter((x) => x.kind === 'item').length
  if (!itemCount) return null

  // tổng kết sau vùng món
  const subtotals: number[] = []
  const totals: number[] = []
  const paid: number[] = []
  let fee = 0
  let billDiscount = 0
  for (let i = end; i < lines.length; i++) {
    const f = folded[i]
    const am = lines[i].match(new RegExp(AMOUNT, 'g'))
    const v = am ? toNum(am[am.length - 1]) : null
    if (v == null || v < 1000) continue
    if (L_CHANGE.test(f)) continue
    if (L_SUBTOTAL.test(f)) subtotals.push(v)
    else if (L_DISCOUNT_TOTAL.test(f)) billDiscount += v
    else if (L_FEE.test(f)) fee += v
    else if (L_TOTAL.test(f)) totals.push(v)
    else if (L_PAY.test(f)) paid.push(v)
  }

  // gộp dòng: chữ không số nối vào tên món trước (topping, size, ghi chú)
  const items: Array<PosItem & { extras: Line[] }> = []
  const extras: Line[] = []
  for (const x of area) {
    if (x.kind === 'item') {
      const qty = x.qty || 1
      const unit = x.unit ?? Math.round((x.amount || 0) / qty)
      items.push({ name: x.name, quantity: qty, unitPrice: unit, amount: x.negative ? -(x.amount || 0) : x.amount || 0, check: false, extras: [] })
    } else if (x.kind === 'text') {
      const last = items[items.length - 1]
      if (last && !last.extras.length) last.name = `${last.name} ${x.name}`.replace(/\s{2,}/g, ' ')
    } else {
      extras.push(x)
      items[items.length - 1]?.extras.push(x)
    }
  }

  // dòng thêm không rõ dấu: thử là khuyến mãi (trừ) hay món/topping cộng thêm, chọn cách khớp tổng
  const unknown = extras.filter((x) => !x.negative)
  const itemSum = items.reduce((s, x) => s + x.amount, 0)
  const knownMinus = extras.filter((x) => x.negative).reduce((s, x) => s + (x.amount || 0), 0)
  const targets = [...new Set([...totals, ...paid, ...subtotals])]
  let best: { mask: number; cost: number; total: number | null } | null = null
  const n = Math.min(unknown.length, 10)
  for (let mask = 0; mask < 1 << n; mask++) {
    // bit 1 = coi là khuyến mãi
    let plus = 0
    let minus = 0
    let cost = 0
    for (let j = 0; j < n; j++) {
      const isPromo = (mask >> j) & 1
      if (isPromo) minus += unknown[j].amount || 0
      else plus += unknown[j].amount || 0
      // trái với dấu hiệu tên thì tốn điểm
      if (!!isPromo !== !!unknown[j].promo) cost++
    }
    const computed = itemSum + plus - minus - knownMinus - billDiscount + fee
    const hit = targets.find((t) => t === computed) ?? null
    const score = (hit != null ? 0 : 100) + cost
    const bestScore = best ? (best.total != null ? 0 : 100) + best.cost : Infinity
    if (score < bestScore) best = { mask, cost, total: hit }
  }

  const promoSet = new Set<Line>()
  unknown.forEach((x, j) => {
    if (j < n ? ((best!.mask >> j) & 1) === 1 : x.promo) promoSet.add(x)
  })
  extras.filter((x) => x.negative).forEach((x) => promoSet.add(x))

  // món cộng thêm (topping tính tiền không có SL) thành món riêng
  const out: PosItem[] = []
  for (const it of items) {
    out.push({ name: it.name, quantity: it.quantity, unitPrice: it.unitPrice, amount: it.amount, check: false })
    for (const x of it.extras) if (!promoSet.has(x)) out.push({ name: x.name, quantity: 1, unitPrice: x.amount || 0, amount: x.amount || 0, check: true })
  }
  const lineDiscount = [...promoSet].reduce((s, x) => s + (x.amount || 0), 0)
  const discount = lineDiscount + billDiscount
  const sum = out.reduce((s, x) => s + x.amount, 0)
  const computed = sum - discount + fee
  const notes: string[] = []
  const fmt = (v: number) => new Intl.NumberFormat('vi-VN').format(v)
  let status: PosReceipt['status']
  let total: number | null
  if (best?.total != null) {
    status = 'OK'
    total = best.total
    notes.push(`Đã đối chiếu: ${out.length} món ${fmt(sum)}${discount ? ` − giảm ${fmt(discount)}` : ''}${fee ? ` + phí ${fmt(fee)}` : ''} = ${fmt(total)}.`)
    const promos = [...promoSet].map((x) => `${x.name} (−${fmt(x.amount || 0)})`)
    if (promos.length) notes.push(`Khuyến mãi: ${promos.join(', ')}.`)
  } else if (targets.length) {
    // không khớp: lấy số tổng xuất hiện nhiều nhất trên bill
    const count = new Map<number, number>()
    for (const t of [...totals, ...paid, ...subtotals]) count.set(t, (count.get(t) || 0) + 1)
    total = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
    status = 'MISMATCH'
    notes.push(`Các món cộng lại ${fmt(computed)} nhưng bill ghi ${fmt(total)}. So với ảnh và sửa tay.`)
    out.forEach((x) => (x.check = true))
  } else {
    total = computed
    status = 'UNVERIFIED'
    notes.push('Bill không có dòng tổng để đối chiếu, kiểm tra lại số tiền.')
  }
  return { items: out, discount, fee, total, status, notes }
}
