/*
 * Đọc ảnh chụp màn hình từ app: đơn hàng thương mại điện tử (Shopee, Lazada, TikTok Shop, Tiki, ShopeeFood, GrabFood…)
 * và biên lai thanh toán / chuyển tiền (MoMo, ZaloPay, ShopeePay, app ngân hàng). Viết riêng cho Sổ Nhà.
 *
 * Lỗi OCR đặc trưng của ảnh app: ký hiệu ₫ đứng TRƯỚC số (VietOCR không có ký tự ₫) bị đọc thành "đ", "d" hoặc số "4",
 * dấu trừ hay mất. Mỗi số tiền vì vậy có thể có hai cách hiểu; bộ đối chiếu chọn tổ hợp làm cho
 * tiền hàng + phí − giảm giá = tổng và tổng các món = tiền hàng.
 */

export type AppSource = 'shopee' | 'lazada' | 'tiktok' | 'tiki' | 'shopeefood' | 'grab' | 'be' | 'momo' | 'zalopay' | 'shopeepay' | 'vnpay' | 'bank'
export type AppKind = 'order' | 'payment'

export interface AppItem {
  name: string
  quantity: number
  unitPrice: number
  amount: number
  check: boolean
}

export interface AppReceipt {
  kind: AppKind
  source: AppSource
  sourceName: string
  /** Tên shop (đơn hàng) hoặc người nhận / nhà cung cấp (biên lai). */
  merchant: string | null
  date: string | null
  time: string | null
  total: number | null
  subtotal: number | null
  /** Phí vận chuyển + phí khác. */
  fee: number
  /** Voucher, giảm giá, giảm phí ship, xu… */
  discount: number
  items: AppItem[]
  orderId: string | null
  paymentMethod: string | null
  /** Nội dung chuyển khoản / dịch vụ. */
  content: string | null
  status: 'OK' | 'CORRECTED' | 'MISMATCH' | 'UNVERIFIED'
  /** App chỉ hiện Thành tiền (Shopee thu gọn chi tiết) */
  hiddenBreakdown?: boolean
  notes: string[]
}

// ---------------------------------------------------------------------------
// Văn bản
// ---------------------------------------------------------------------------

const fold = (s: string) =>
  s.replace(/[đĐ]/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const SOURCES: Array<{ id: AppSource; name: string; kind: AppKind; re: RegExp }> = [
  { id: 'shopeefood', name: 'ShopeeFood', kind: 'order', re: /shopee ?food/ },
  { id: 'grab', name: 'Grab', kind: 'order', re: /\bgrab ?(food|mart|express)?\b/ },
  { id: 'be', name: 'be', kind: 'order', re: /\bbe ?(food|mart)\b/ },
  { id: 'shopee', name: 'Shopee', kind: 'order', re: /shopee(?!pay| ?food)|phan loai hang|xem shop|shopee xu|yeu thich\+?\s+\S|sao chep|tra hang\/hoan tien|gui yeu cau tra hang/ },
  { id: 'lazada', name: 'Lazada', kind: 'order', re: /lazada|lazmall|laz ?pay/ },
  { id: 'tiktok', name: 'TikTok Shop', kind: 'order', re: /tik ?tok/ },
  { id: 'tiki', name: 'Tiki', kind: 'order', re: /\btiki\b|tikinow/ },
  { id: 'momo', name: 'MoMo', kind: 'payment', re: /\bmomo\b|vi momo/ },
  { id: 'zalopay', name: 'ZaloPay', kind: 'payment', re: /zalo ?pay/ },
  { id: 'shopeepay', name: 'ShopeePay', kind: 'payment', re: /shopee ?pay/ },
  { id: 'vnpay', name: 'VNPAY', kind: 'payment', re: /vnpay/ },
]

const BANKS: Array<[RegExp, string]> = [
  [/vietcombank|\bvcb\b/, 'Vietcombank'],
  [/techcombank|\btcb\b/, 'Techcombank'],
  [/\bmb ?bank\b|\bmbbank\b/, 'MB Bank'],
  [/\bbidv\b/, 'BIDV'],
  [/vietinbank/, 'VietinBank'],
  [/agribank/, 'Agribank'],
  [/\bacb\b/, 'ACB'],
  [/vpbank/, 'VPBank'],
  [/tpbank/, 'TPBank'],
  [/sacombank/, 'Sacombank'],
  [/\btimo\b/, 'Timo'],
  [/\bcake\b/, 'Cake'],
  [/hdbank/, 'HDBank'],
  [/\bvib\b/, 'VIB'],
  [/ocb\b/, 'OCB'],
]

const MONEY_RE = /([-–])?\s*([đd₫])?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,9})(?![\d.,]*\d)\s*(vnd|vnđ|đ|d\b|₫)?/gi

interface MoneyToken {
  /** Các cách hiểu, cách đầu là cách tự nhiên nhất. */
  values: number[]
  negative: boolean
  /** Có dấu hiệu là tiền (đ/₫/VND hoặc nhóm nghìn). */
  sure: boolean
  index: number
}

function toNumber(digits: string): number {
  return Number(digits.replace(/[.,]/g, ''))
}

/** Số tiền trên một dòng. `prefixCurrency`: app ghi ₫ trước số nên số không có tiền tố mà bắt đầu bằng 4 hoặc 2 có thể là ₫ bị đọc sai. */
function moneyTokens(line: string, prefixCurrency: boolean): MoneyToken[] {
  const out: MoneyToken[] = []
  for (const m of line.matchAll(MONEY_RE)) {
    const [, minus, pre, digits, post] = m
    const grouped = /[.,]\d{3}$/.test(digits)
    if (!grouped && !pre && !post) continue // số trần (mã, SĐT) không phải tiền
    if (grouped && /^\d{1,3}([.,]\d{3}){4,}$/.test(digits)) continue
    // dấu chấm/phẩy nghìn lẫn lộn kiểu "350,000" vẫn đúng; số thập phân như "1,5" không khớp vì cần 3 chữ số
    const value = toNumber(digits)
    if (value < 1000) continue
    const values = [value]
    // ₫ (VietOCR không có ký tự này) hay bị đọc thành số 4 hoặc 2 dính trước số tiền
    if (prefixCurrency && !pre && /^[24]\d/.test(digits)) {
      const stripped = digits.slice(1).replace(/^[.,]/, '')
      if (/^\d{1,3}([.,]\d{3})+$/.test(stripped) || /^\d{4,}$/.test(stripped)) values.push(toNumber(stripped))
    }
    out.push({ values, negative: !!minus, sure: !!(pre || post || grouped), index: m.index ?? 0 })
  }
  return out
}

/**
 * Tách dòng giá bị dính: "1.257.644đ754.587đ" có thể đọc thành "1.257.6442774.5874" (đ → 2, 4, d).
 * Tìm cách chia chuỗi thành các số tiền đúng dạng nghìn, xen giữa là ký tự tiền tệ bị đọc sai.
 */
export function splitGlued(line: string): number[] | null {
  const str = fold(line).replace(/\s+/g, '').replace(/vnd/g, '')
  if (!/^[\d.,đd₫\-–]+$/.test(str)) return null
  const memo = new Map<number, { amounts: number[]; junk: number } | null>()
  const go = (i: number): { amounts: number[]; junk: number } | null => {
    if (i === str.length) return { amounts: [], junk: 0 }
    if (memo.has(i)) return memo.get(i)!
    let best: { amounts: number[]; junk: number } | null = null
    const consider = (r: { amounts: number[]; junk: number } | null) => {
      if (r && (!best || r.amounts.length > best.amounts.length || (r.amounts.length === best.amounts.length && r.junk < best.junk))) best = r
    }
    // số tiền đúng dạng: 1–3 chữ số rồi các nhóm .ddd
    const m = /^\d{1,3}(?:[.,]\d{3})+/.exec(str.slice(i))
    if (m) {
      for (let k = m[0].length; k >= 5; k -= 4) {
        const piece = str.slice(i, i + k)
        if (!/^\d{1,3}(?:[.,]\d{3})+$/.test(piece)) continue
        const rest = go(i + k)
        if (rest) consider({ amounts: [toNumber(piece), ...rest.amounts], junk: rest.junk })
      }
    }
    // ký tự tiền tệ đọc sai / dấu trừ
    if (/[đd₫24\-–]/.test(str[i])) {
      const rest = go(i + 1)
      if (rest) consider({ amounts: rest.amounts, junk: rest.junk + 1 })
    }
    memo.set(i, best)
    return best
  }
  const r = go(0)
  return r && r.amounts.length ? r.amounts : null
}

const pad = (n: number) => String(n).padStart(2, '0')

function findDate(line: string): { date: string; time: string | null } | null {
  const f = fold(line)
  const time = /(\d{1,2})[:h](\d{2})(?::\d{2})?/.exec(f)
  const hhmm = time && Number(time[1]) < 24 && Number(time[2]) < 60 ? `${pad(Number(time[1]))}:${time[2]}` : null
  let d: RegExpExecArray | null
  let y = 0,
    mo = 0,
    da = 0
  if ((d = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(f))) [da, mo, y] = [Number(d[1]), Number(d[2]), Number(d[3])]
  else if ((d = /\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/.exec(f))) [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])]
  else if ((d = /\b(\d{1,2})\s*(?:thg|th|thang)\s*(\d{1,2})[,\s]+(\d{4})\b/.exec(f))) [da, mo, y] = [Number(d[1]), Number(d[2]), Number(d[3])]
  else return null
  if (y < 100) y += 2000
  if (y < 2000 || y > 2099 || mo < 1 || mo > 12 || da < 1 || da > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, da))
  if (dt.getUTCMonth() !== mo - 1) return null
  return { date: `${y}-${pad(mo)}-${pad(da)}`, time: hhmm }
}

/** Phần chữ sau nhãn ("Nhà cung cấp  Điện lực…" → "Điện lực…"). */
function valueAfter(line: string, label: RegExp): string {
  const f = fold(line)
  const m = label.exec(f)
  if (!m) return ''
  // vị trí trong chuỗi gốc tương ứng: dùng độ dài sau khi bỏ dấu (fold giữ nguyên số ký tự với NFC tiếng Việt thông thường)
  const cut = m.index + m[0].length
  return line
    .normalize('NFC')
    .slice(cut)
    .replace(/^[\s:.\-–]+/, '')
    .trim()
}

// ---------------------------------------------------------------------------
// Nhận diện nguồn
// ---------------------------------------------------------------------------

const PAYMENT_HINT = /(chuyen (tien|khoan)|thanh toan|giao dich|nap tien|rut tien) thanh cong|chi tiet giao dich|ma giao dich|so tham chieu|ma tham chieu|tai khoan nhan|nguoi nhan|ngan hang nhan/
const ORDER_HINT = /ma don hang|thong tin don hang|chi tiet don hang|tong tien hang|phi van chuyen|phan loai|tong phu|tam tinh/

export function detectSource(text: string): { source: AppSource; name: string; kind: AppKind } | null {
  const f = fold(text)
  const orderish = ORDER_HINT.test(f)
  const paymentish = PAYMENT_HINT.test(f)
  for (const s of SOURCES) {
    if (!s.re.test(f)) continue
    // "Ví MoMo" trong phương thức thanh toán của đơn Shopee: vẫn là đơn hàng
    if (s.kind === 'payment' && orderish && !paymentish) continue
    if (s.kind === 'order' && paymentish && !orderish) return { source: 'shopeepay', name: 'ShopeePay', kind: 'payment' }
    return { source: s.id, name: s.name, kind: s.kind }
  }
  if (paymentish && !orderish) {
    const bank = BANKS.find(([re]) => re.test(f))
    return { source: 'bank', name: bank ? `Chuyển khoản (${bank[1]})` : 'Chuyển khoản', kind: 'payment' }
  }
  if (orderish && /ma don hang/.test(f) && /x\s?\d|so luong|sl:/.test(f)) return { source: 'shopee', name: 'Đơn online', kind: 'order' }
  return null
}

// ---------------------------------------------------------------------------
// Đơn hàng thương mại điện tử
// ---------------------------------------------------------------------------

const L_SUBTOTAL = /tong tien hang|tong phu|tam tinh|tong (gia tri|tien) san pham|tien hang/
const L_TOTAL = /thanh tien|tong cong|tong thanh toan|tong so tien|so tien (can )?thanh toan|tong tien(?! hang)|tong don/
const L_SHIP = /phi (van chuyen|giao hang|ship|vc)|van chuyen|phi giao/
const L_FEE = /phi (dich vu|nen tang|bao hiem|xu ly|thanh toan|dong goi|ap dung)|phu phi|phi khac/
const L_DISCOUNT = /giam gia|voucher|ma giam|khuyen mai|shopee xu|\bxu\b|\bcoin|uu dai|tro gia|chiet khau|giam phi|hoan tien|freeship/
const L_ORDER_ID = /ma don hang|ma don|order id|so don/
const L_DATE = /thoi gian dat hang|ngay dat hang|dat hang (luc|ngay)|thoi gian thanh toan|ngay dat|thoi gian tao don|ngay mua/
const L_METHOD = /phuong thuc thanh toan|hinh thuc thanh toan|thanh toan bang/
const QTY_SUFFIX = /(?:^|\s)[xX×]\s?(\d{1,3})\b|(?:so luong|sl)\s*:?\s*(\d{1,3})\b/
const QTY_PREFIX = /^(\d{1,2})\s?[xX×]\s+(.+)$/
/** Dòng tên shop: huy hiệu Shopee/Lazada đứng đầu, hoặc tên có Store/Shop/Official/Mall. */
const SHOP_LINE = /^(yeu thich\+?|mall|lazmall|choice|preferred|shopee mall)\s+\S|\b(official|store|flagship)\b|\bshop\s*$/
const NOT_NAME =
  /^(\d{1,2}:\d{2}|9:41)|don hang|da hoan thanh|^(da|dang|cho) (giao|nhan|huy|xac nhan|xu ly|lay hang)|giao hang thanh cong|cam on|dia chi|nhan hang|thong tin|van chuyen|xem shop|chat|lien he|tro giup|mua lai|danh gia|doi tra|tra hang|hoan tien|yeu cau|xem chi tiet|\(\+?84\)|^\+?84|\b0\d{9}\b|\d{3} \d{3} \d{3}|phuong |quan |huyen |tp\.|thanh pho|tinh |ward|district/

interface RawItem {
  name: string
  qty: number
  /** cách hiểu đơn giá (unitMode) hoặc thành tiền dòng */
  money: MoneyToken
  lineTotal: boolean
  line: number
}

/** Dòng chỉ có số: "giá gốc + giá bán" dính nhau, hoặc giá có ký hiệu đ dính đuôi ("754.5874") → lấy giá bán (số cuối). */
function gluedToken(line: string, prefix: boolean): MoneyToken | null {
  const parts = splitGlued(line)
  if (!parts) return null
  if (parts.length < 2 && moneyTokens(line, prefix).length) return null
  return { values: [parts[parts.length - 1]], negative: false, sure: true, index: 0 }
}

function cleanName(s: string): string {
  return s
    .replace(/^\s*(mall|lazmall|yêu thích\+?|yeu thich\+?|choice|preferred)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function variantOf(line: string): string {
  const v = valueAfter(line, /phan loai( hang)?|bien the|mau sac|kich thuoc|loai/)
  return v.replace(QTY_SUFFIX, '').replace(/[,.;]\s*$/, '').trim()
}

interface SummaryLine {
  role: 'subtotal' | 'total' | 'ship' | 'fee' | 'discount'
  token: MoneyToken
  label: string
  line: number
}

function parseOrder(lines: string[], src: { source: AppSource; name: string }): AppReceipt {
  const prefix = src.source === 'shopee' || src.source === 'lazada' || src.source === 'tiktok' || src.source === 'shopeefood' || src.source === 'tiki'
  const folded = lines.map(fold)
  const notes: string[] = []

  // --- thông tin chung
  let merchant: string | null = null
  let orderId: string | null = null
  let method: string | null = null
  let when: { date: string; time: string | null } | null = null
  for (let i = 0; i < lines.length; i++) {
    const f = folded[i]
    if (!merchant && /xem shop|\bchat\b/.test(f)) merchant = cleanName(lines[i].replace(/xem shop|chat ngay|\bchat\b|>/gi, '')) || null
    if (!merchant && SHOP_LINE.test(f) && !moneyTokens(lines[i], false).length) merchant = cleanName(lines[i].replace(/[>›]/g, '')) || null
    if (!orderId && L_ORDER_ID.test(f)) {
      const after = (valueAfter(lines[i], L_ORDER_ID) || lines[i + 1] || '').replace(/sao ch[ée]p|copy/gi, ' ')
      const id = after
        .toUpperCase()
        .split(/\s+/)
        .find((w) => /^[A-Z0-9]{8,24}$/.test(w) && /\d/.test(w))
      if (id) orderId = id
    }
    if (!method && L_METHOD.test(f)) method = valueAfter(lines[i], L_METHOD) || (lines[i + 1] && !moneyTokens(lines[i + 1], prefix).length ? lines[i + 1].trim() : null)
    if (L_DATE.test(f)) when = findDate(lines[i]) || (lines[i + 1] ? findDate(lines[i + 1]) : null) || when
  }
  if (!when) for (const l of lines) if ((when = findDate(l))) break

  // --- món
  const items: RawItem[] = []
  const summary: SummaryLine[] = []
  let nameBuf: string[] = []
  let variant = ''
  // giá đứng riêng một dòng giữa tên và "x1" (Lazada)
  let pending: MoneyToken | null = null
  const used = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue
    const line = lines[i]
    const f = folded[i]
    const tokens = moneyTokens(line, prefix)

    // dòng tổng kết
    const role: SummaryLine['role'] | null = L_DISCOUNT.test(f)
      ? 'discount'
      : L_SUBTOTAL.test(f)
        ? 'subtotal'
        : L_SHIP.test(f) && !/dia chi|thong tin/.test(f)
          ? 'ship'
          : L_FEE.test(f)
            ? 'fee'
            : L_TOTAL.test(f)
              ? 'total'
              : null
    if (role) {
      let tk = tokens[tokens.length - 1]
      if (!tk && lines[i + 1] && /^[\s\-–đd₫\d.,vnd]+$/i.test(lines[i + 1])) {
        tk = moneyTokens(lines[i + 1], prefix).pop() as MoneyToken
        if (tk) used.add(i + 1)
      }
      if (tk) summary.push({ role, token: tk, label: line.replace(MONEY_RE, '').trim(), line: i })
      else if (role === 'ship' || role === 'discount') {
        /* "Miễn phí" */
      }
      nameBuf = []
      variant = ''
      continue
    }

    // món dạng "2x Trà sữa  ₫90.000" (app đồ ăn: số tiền là thành tiền cả dòng)
    const pre = QTY_PREFIX.exec(line.trim())
    if (pre && tokens.length) {
      items.push({ name: cleanName(pre[2].replace(MONEY_RE, '')), qty: Number(pre[1]), money: tokens[tokens.length - 1], lineTotal: true, line: i })
      nameBuf = []
      continue
    }

    const qm = QTY_SUFFIX.exec(f)
    if (qm && (nameBuf.length || /phan loai/.test(f))) {
      const qty = Number(qm[1] || qm[2])
      if (/phan loai|bien the/.test(f)) variant = variantOf(line)
      else if (!variant) {
        const before = line.slice(0, qm.index).trim()
        if (before && /[A-Za-zÀ-ỹ]/.test(before) && before.length <= 40 && !moneyTokens(before, prefix).length) variant = before
      }
      // giá: cùng dòng, dòng sau (dòng chỉ có số), hoặc dòng trước
      let tk = tokens.filter((t) => t.index > (qm.index ?? 0)).pop() || null
      if (!tk && lines[i + 1] && !/[a-z]{3,}/.test(folded[i + 1].replace(/vnd/g, ''))) {
        tk = gluedToken(lines[i + 1], prefix) || moneyTokens(lines[i + 1], prefix).pop() || null
        if (tk) used.add(i + 1)
      }
      if (!tk && tokens.length) tk = tokens[tokens.length - 1]
      if (!tk) tk = pending
      if (tk && nameBuf.length) {
        const base = cleanName(nameBuf.join(' ').replace(MONEY_RE, ' '))
        items.push({ name: variant ? `${base} (${variant})` : base, qty, money: tk, lineTotal: false, line: i })
      }
      nameBuf = []
      variant = ''
      pending = null
      continue
    }

    if (/phan loai|bien the/.test(f)) {
      variant = variantOf(line)
      continue
    }
    if (NOT_NAME.test(f) || (merchant && cleanName(line.replace(/[>›]/g, '')) === merchant) || (merchant && line.includes(merchant))) {
      nameBuf = []
      continue
    }
    // dòng chữ (không phải chỉ có số) → có thể là tên món
    if (/[a-zA-ZÀ-ỹ]{2,}/.test(line) && !tokens.length) {
      if (pending) nameBuf = []
      pending = null
      nameBuf.push(line.trim())
      if (nameBuf.length > 3) nameBuf.shift()
    } else if (tokens.length && nameBuf.length) pending = tokens[tokens.length - 1]
    else if (!tokens.length && nameBuf.length && gluedToken(line, prefix)) pending = gluedToken(line, prefix)
    else if (!tokens.length) nameBuf = []
  }

  // --- đối chiếu
  const pick = solveOrder(items, summary)
  const finalItems: AppItem[] = items.map((it, k) => {
    const v = pick.items[k]
    const amount = it.lineTotal ? v : v * it.qty
    return { name: it.name, quantity: it.qty, unitPrice: it.lineTotal ? Math.round(v / it.qty) : v, amount, check: pick.hidden ? items.length > 1 : v !== it.money.values[0] || (pick.status !== 'OK' && it.money.values.length > 1) }
  })
  if (pick.hidden) {
    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n)
    if (items.length === 1) {
      notes.push(`${src.name} ẩn chi tiết voucher/phí ship, nên giá món lấy theo số tiền thực trả ${fmt(pick.total!)}.`)
      if (pick.hidden.listed[0] && pick.hidden.listed[0] !== pick.total) notes.push(`Giá bán trên đơn đọc được khoảng ${fmt(pick.hidden.listed[0])} (có thể sai vài số).`)
    } else {
      notes.push(`${src.name} ẩn chi tiết: các món cộng lại ${fmt(pick.subtotal!)}, thực trả ${fmt(pick.total!)}${pick.hidden.gap > 0 ? ` → coi ${fmt(pick.hidden.gap)} là voucher/giảm giá` : pick.hidden.gap < 0 ? ` → coi ${fmt(-pick.hidden.gap)} là phí ship/phí` : ''}. Giá từng món có thể sai vài số, xem lại.`)
    }
  } else if (pick.status === 'OK') notes.push(`Đã đối chiếu: ${pick.explain}.`)
  else if (pick.status === 'MISMATCH') notes.push(`Chưa khớp: ${pick.explain}. Kiểm tra lại các số trong ảnh.`)
  else notes.push('Ảnh không có đủ dòng tổng để đối chiếu, kiểm tra lại số tiền.')
  if (pick.corrected) notes.push('Đã sửa vài số tiền có ký hiệu ₫ bị đọc thành số (4 hoặc 2).')

  return {
    kind: 'order',
    source: src.source,
    sourceName: src.name,
    merchant,
    date: when?.date ?? null,
    time: when?.time ?? null,
    total: pick.total,
    subtotal: pick.subtotal,
    fee: pick.fee,
    discount: pick.discount,
    items: finalItems,
    orderId,
    paymentMethod: method,
    content: null,
    status: pick.status === 'OK' && pick.corrected ? 'CORRECTED' : pick.status,
    hiddenBreakdown: !!pick.hidden,
    notes,
  }
}

interface OrderPick {
  /** App chỉ hiện "Thành tiền" (ẩn tiền hàng, phí ship, voucher): đã suy ra phần chênh. */
  hidden?: { listed: number[]; gap: number }
  items: number[]
  total: number | null
  subtotal: number | null
  fee: number
  discount: number
  status: 'OK' | 'MISMATCH' | 'UNVERIFIED'
  corrected: boolean
  explain: string
}

/** Thử các cách hiểu số tiền (bỏ số 4 đầu = ₫) để khớp: Σmón = tiền hàng, tiền hàng + phí − giảm = tổng. */
function solveOrder(items: RawItem[], summary: SummaryLine[]): OrderPick {
  const totals = summary.filter((s) => s.role === 'total')
  const subs = summary.filter((s) => s.role === 'subtotal')
  // tổng cuối là dòng tổng nằm SAU các dòng phí/giảm giá (hoặc dòng tổng cuối cùng)
  const lastAdj = Math.max(-1, ...summary.filter((s) => s.role === 'ship' || s.role === 'fee' || s.role === 'discount').map((s) => s.line))
  const totalLine = totals.filter((t) => t.line > lastAdj).pop() || totals[totals.length - 1] || null
  // "Thành tiền:" của từng shop đứng trước khối tổng kết cũng là một dạng tiền hàng
  const subLine = subs[subs.length - 1] || totals.find((t) => t !== totalLine && t.line < (totalLine?.line ?? Infinity)) || null
  const adds = summary.filter((s) => s.role === 'ship' || s.role === 'fee')
  const minus = summary.filter((s) => s.role === 'discount')

  const vars: MoneyToken[] = [...items.map((i) => i.money), ...adds.map((s) => s.token), ...minus.map((s) => s.token)]
  if (totalLine) vars.push(totalLine.token)
  if (subLine) vars.push(subLine.token)

  const choices = vars.map((t) => t.values.length)
  const space = choices.reduce((a, b) => a * b, 1)
  let best: { idx: number[]; cost: number; ok: boolean; okSub: boolean } | null = null

  const evalCombo = (idx: number[]) => {
    let k = 0
    const iv = items.map((it) => {
      const v = it.money.values[idx[k++]]
      return it.lineTotal ? v : v * it.qty
    })
    const add = adds.reduce((s) => s + vars[k].values[idx[k++]], 0)
    const sub = minus.reduce((s) => s + vars[k].values[idx[k++]], 0)
    const total = totalLine ? vars[k].values[idx[k++]] : null
    const subtotal = subLine ? vars[k].values[idx[k++]] : null
    const itemSum = iv.reduce((a, b) => a + b, 0)
    const base = subtotal ?? itemSum
    const okSub = subtotal == null || !items.length || itemSum === subtotal
    const ok = total != null && base + add - sub === total && okSub
    const cost = idx.reduce((a, b) => a + b, 0)
    return { ok, okSub, cost }
  }

  if (space <= 1 << 14) {
    const idx = new Array(vars.length).fill(0)
    for (let n = 0; n < space; n++) {
      let r = n
      for (let j = 0; j < vars.length; j++) {
        idx[j] = r % choices[j]
        r = Math.floor(r / choices[j])
      }
      const e = evalCombo(idx)
      const score = (e.ok ? 0 : 1000) + (e.okSub ? 0 : 100) + e.cost
      const bestScore = best ? (best.ok ? 0 : 1000) + (best.okSub ? 0 : 100) + best.cost : Infinity
      if (score < bestScore) best = { idx: [...idx], cost: e.cost, ok: e.ok, okSub: e.okSub }
    }
  }
  const idx = best?.idx ?? new Array(vars.length).fill(0)
  // không khớp: với số không có tiền tố, ưu tiên cách hiểu bỏ số 4 nếu nó làm số nhỏ hơn hợp lý (giảm giá ≤ tiền hàng…)
  let k = 0
  const itemVals = items.map((it) => it.money.values[idx[k++]])
  const fee = adds.reduce((s) => s + vars[k].values[idx[k++]], 0)
  const discount = minus.reduce((s) => s + vars[k].values[idx[k++]], 0)
  const total = totalLine ? vars[k].values[idx[k++]] : null
  const subtotal = subLine ? vars[k].values[idx[k++]] : null
  const itemSum = items.reduce((s, it, j) => s + (it.lineTotal ? itemVals[j] : itemVals[j] * it.qty), 0)
  const corrected = idx.some((x) => x > 0)
  const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n)
  // Shopee thu gọn: chỉ có "Thành tiền" (đã trừ voucher, cộng ship) mà không có dòng chi tiết
  if (!best?.ok && total != null && !subLine && !adds.length && !minus.length && items.length) {
    const gap = itemSum - total
    if (items.length === 1) {
      const it = items[0]
      const paid = it.lineTotal ? total : total / it.qty
      return {
        hidden: { listed: [itemVals[0]], gap },
        items: [Number.isInteger(paid) ? paid : total],
        total,
        subtotal: total,
        fee: 0,
        discount: 0,
        status: 'OK',
        corrected: false,
        explain: `ảnh chỉ có Thành tiền ${fmt(total)}`,
      }
    }
    return {
      hidden: { listed: itemVals, gap },
      items: itemVals,
      total,
      subtotal: itemSum,
      fee: gap < 0 ? -gap : 0,
      discount: gap > 0 ? gap : 0,
      status: 'OK',
      corrected: false,
      explain: `các món ${fmt(itemSum)}, Thành tiền ${fmt(total)}`,
    }
  }
  const parts = [`tiền hàng ${fmt(subtotal ?? itemSum)}`]
  if (fee) parts.push(`+ phí ${fmt(fee)}`)
  if (discount) parts.push(`− giảm ${fmt(discount)}`)
  const explain = `${parts.join(' ')} = ${total != null ? fmt(total) : '?'}${subtotal != null && items.length && itemSum !== subtotal ? `; các món cộng lại ${fmt(itemSum)} khác tiền hàng` : ''}`
  return {
    items: itemVals,
    total: total ?? (items.length ? (subtotal ?? itemSum) + fee - discount : null),
    subtotal: subtotal ?? (items.length ? itemSum : null),
    fee,
    discount,
    status: total == null ? 'UNVERIFIED' : best?.ok ? 'OK' : 'MISMATCH',
    corrected: !!best?.ok && corrected,
    explain,
  }
}

// ---------------------------------------------------------------------------
// Biên lai thanh toán / chuyển tiền
// ---------------------------------------------------------------------------

const L_PAYEE = /nha cung cap|ten nguoi nhan|nguoi nhan|nguoi thu huong|ten tai khoan nhan|tai khoan thu huong|den tai khoan|cua hang|diem ban|doi tac|merchant|don vi (nhan|cung cap|thu huong)|chuyen den|^den\b|ten nguoi thu/
const L_CONTENT = /noi dung( chuyen khoan| giao dich)?|loi nhan|ghi chu|mo ta/
const L_SERVICE = /^dich vu|loai giao dich|^loai dich vu/
const L_TXN = /ma giao dich|so tham chieu|ma tham chieu|ma gd|so giao dich|transaction id/
const L_AMOUNT = /so tien( giao dich| thanh toan| chuyen)?|tong tien|tong thanh toan|thanh tien/
const L_PFEE = /tong phi|phi giao dich|phi chuyen|phi dich vu|^phi\b/
const L_WHEN = /thoi gian|ngay giao dich|ngay gio|ngay thuc hien|ngay chuyen/

function parsePayment(lines: string[], src: { source: AppSource; name: string }): AppReceipt {
  const folded = lines.map(fold)
  let amount: number | null = null
  let merchant: string | null = null
  let content: string | null = null
  let service: string | null = null
  let orderId: string | null = null
  let fee = 0
  let when: { date: string; time: string | null } | null = null
  const notes: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const f = folded[i]
    const line = lines[i]
    const label = (re: RegExp) => valueAfter(line, re) || (lines[i + 1] && !L_PAYEE.test(folded[i + 1]) ? lines[i + 1].trim() : '')
    if (!merchant && L_PAYEE.test(f)) merchant = label(L_PAYEE) || null
    else if (!content && L_CONTENT.test(f)) content = label(L_CONTENT) || null
    else if (!service && L_SERVICE.test(f)) service = valueAfter(line, L_SERVICE) || null
    else if (!orderId && L_TXN.test(f)) {
      const id = /([A-Z0-9]{6,30})/.exec(valueAfter(line, L_TXN).toUpperCase().replace(/\s+/g, '') || '')
      if (id) orderId = id[1]
    } else if (L_PFEE.test(f)) {
      const t = moneyTokens(line, false).pop()
      if (t) fee = t.values[0]
    } else if (amount == null && L_AMOUNT.test(f)) {
      const t = moneyTokens(line, false).pop()
      if (t) amount = t.values[0]
    }
    if (!when && L_WHEN.test(f)) when = findDate(line) || (lines[i + 1] ? findDate(lines[i + 1]) : null)
  }
  // số tiền lớn ở đầu biên lai: dòng chỉ có số tiền (có thể kèm dấu trừ, đ, VND) trong 10 dòng đầu
  if (amount == null) {
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
      const stripped = folded[i].replace(/[\s\-–+đd₫]|vnd/g, '')
      if (/^\d{1,3}([.,]\d{3})+$/.test(stripped)) {
        amount = toNumber(stripped)
        break
      }
    }
  }
  if (!when) for (const l of lines) if ((when = findDate(l))) break
  if (merchant) merchant = merchant.replace(/\s{2,}/g, ' ').trim()
  if (amount == null) notes.push('Không thấy số tiền trong ảnh, nhập tay nhé.')
  else notes.push(`${src.name}: ${new Intl.NumberFormat('vi-VN').format(amount)} đ${fee ? ` (phí ${new Intl.NumberFormat('vi-VN').format(fee)} đ)` : ''}.`)

  return {
    kind: 'payment',
    source: src.source,
    sourceName: src.name,
    merchant,
    date: when?.date ?? null,
    time: when?.time ?? null,
    total: amount == null ? null : amount + fee,
    subtotal: amount,
    fee,
    discount: 0,
    items: [],
    orderId,
    paymentMethod: src.source === 'bank' ? 'Chuyển khoản' : src.name,
    content: content || service,
    status: amount == null ? 'MISMATCH' : 'UNVERIFIED',
    notes,
  }
}

// ---------------------------------------------------------------------------

/** Ghép văn bản nhiều ảnh chụp màn hình liên tiếp, bỏ phần trùng ở chỗ nối. */
export function mergeScreens(texts: string[]): string {
  const key = (l: string) => fold(l).replace(/\s+/g, '')
  let out: string[] = []
  for (const t of texts) {
    let lines = t.split('\n').filter((l) => l.trim())
    if (out.length) {
      // thanh trạng thái / tiêu đề trang lặp lại ở đầu ảnh sau
      const head = new Set(out.slice(0, 4).map(key))
      let s = 0
      while (s < Math.min(3, lines.length) && head.has(key(lines[s]))) s++
      lines = lines.slice(s)
    }
    let overlap = 0
    for (let n = Math.min(out.length, lines.length, 25); n > 0; n--) {
      let same = true
      for (let j = 0; j < n && same; j++) same = key(out[out.length - n + j]) === key(lines[j])
      if (same) {
        overlap = n
        break
      }
    }
    out = out.concat(lines.slice(overlap))
  }
  return out.join('\n')
}

/** Đọc văn bản OCR của ảnh app. Trả `null` khi không nhận ra là ảnh từ app (dùng bộ đọc bill giấy). */
export function readAppReceipt(text: string): AppReceipt | null {
  const src = detectSource(text)
  if (!src) return null
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() !== '')
  return src.kind === 'order' ? parseOrder(lines, src) : parsePayment(lines, src)
}
