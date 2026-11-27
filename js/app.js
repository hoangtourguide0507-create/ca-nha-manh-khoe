import * as S from './store.js';
import * as D from './schedule.js';
import { lunarShort } from './lunar.js';
import { enablePush, disablePush, pushState, refreshPushOwner, isStandalone } from './push.js';

// ---------- Danh mục & mẫu ----------
const CATS = [
  { id: 'pet', name: 'Thú cưng', icon: '🐾' },
  { id: 'bill', name: 'Hóa đơn', icon: '🧾' },
  { id: 'home', name: 'Nhà cửa', icon: '🏠' },
  { id: 'car', name: 'Xe cộ', icon: '🚗' },
  { id: 'health', name: 'Sức khỏe', icon: '💊' },
  { id: 'spirit', name: 'Cúng giỗ', icon: '🪔' },
  { id: 'other', name: 'Khác', icon: '📌' },
];
const APP_VERSION = 'v1.12';

const EXP_CATS = [
  { id: 'grocery', name: 'Đi chợ & siêu thị', icon: '🛒' },
  { id: 'online', name: 'Mua online', icon: '🛍️' },
  { id: 'food', name: 'Ăn uống', icon: '🍜' },
  { id: 'car', name: 'Xe cộ', icon: '🚗' },
  { id: 'luxury', name: 'Đồ hiệu', icon: '👜' },
  { id: 'tech', name: 'Điện máy', icon: '📱' },
  { id: 'home', name: 'Nhà cửa', icon: '🛋️' },
  { id: 'travel', name: 'Du lịch', icon: '✈️' },
  { id: 'health', name: 'Sức khỏe', icon: '🩺' },
  { id: 'other', name: 'Khác', icon: '💰' },
];
const METHODS = ['Chuyển khoản', 'Thẻ', 'Ví điện tử', 'Tiền mặt', 'Trả góp', 'Khác'];

const TEMPLATES = [
  { title: 'Thay cát mèo', icon: '🐱', category: 'pet', type: 'interval', everyDays: 3 },
  { title: 'Tiền điện', icon: '⚡', category: 'bill', type: 'monthly', day: 5, trackAmount: true, remindBefore: 1 },
  { title: 'Tiền nước', icon: '💧', category: 'bill', type: 'monthly', day: 10, trackAmount: true, remindBefore: 1 },
  { title: 'Internet', icon: '🌐', category: 'bill', type: 'monthly', day: 15, trackAmount: true },
  { title: 'Thắp hương mùng 1 & rằm', icon: '🪔', category: 'spirit', type: 'lunar', lunarMode: 'monthly', lunarDays: [1, 15], remindBefore: 1, remindHour: 7 },
  { title: 'Giỗ ', icon: '🕯️', category: 'spirit', type: 'lunar', lunarMode: 'yearly', lunarDay: '', lunarMonth: '', remindBefore: 7, remindHour: 8 },
  { title: 'Cúng ông Công ông Táo', icon: '🎏', category: 'spirit', type: 'lunar', lunarMode: 'yearly', lunarDay: 23, lunarMonth: 12, remindBefore: 3, remindHour: 8 },
  { title: 'Rằm tháng Giêng', icon: '🏮', category: 'spirit', type: 'lunar', lunarMode: 'yearly', lunarDay: 15, lunarMonth: 1, remindBefore: 2, remindHour: 8 },
  { title: 'Rằm tháng 7 (Vu Lan)', icon: '🪷', category: 'spirit', type: 'lunar', lunarMode: 'yearly', lunarDay: 15, lunarMonth: 7, remindBefore: 3, remindHour: 8 },
  { title: 'Tẩy giun cho mèo', icon: '🪱', category: 'pet', type: 'interval', everyDays: 90, trackAmount: true },
  { title: 'Tiêm phòng cho mèo', icon: '💉', category: 'pet', type: 'interval', everyDays: 365, trackAmount: true },
  { title: 'Thay lõi lọc nước', icon: '🚰', category: 'home', type: 'interval', everyDays: 180, trackAmount: true },
  { title: 'Bảo dưỡng xe', icon: '🔧', category: 'car', type: 'interval', everyDays: 180, trackAmount: true },
  { title: 'Bảo hiểm xe', icon: '🛡️', category: 'car', type: 'monthly', everyMonths: 12, trackAmount: true, remindBefore: 7 },
];

const catOf = (id, list = CATS) => list.find((c) => c.id === id) || list[list.length - 1];

// ---------- Nơi mua ----------
const SHOPS = [
  { id: 'shopee', name: 'Shopee', icon: '🧡', hint: 'Dán link sản phẩm Shopee' },
  { id: 'lazada', name: 'Lazada', icon: '💙', hint: 'Dán link sản phẩm Lazada' },
  { id: 'tiktok', name: 'TikTok Shop', icon: '🎵', hint: 'Dán link sản phẩm TikTok Shop' },
  { id: 'store', name: 'Cửa hàng', icon: '🏪', hint: 'Địa chỉ hoặc SĐT cửa hàng' },
  { id: 'zalo', name: 'Zalo', icon: '💬', hint: 'SĐT Zalo người bán' },
  { id: 'other', name: 'Khác', icon: '📦', hint: 'Link, SĐT hoặc địa chỉ' },
];
const shopOf = (id) => SHOPS.find((x) => x.id === id) || null;
const shopLabel = (b) => (b ? b.name || shopOf(b.kind)?.name || '' : '');
const hasBuy = (b) => !!(b && (b.kind || b.name || b.link));

/** Các nơi mua đã dùng (để gợi ý khi gõ tên shop). */
function knownShops() {
  const m = new Map();
  const items = [...S.all('log'), ...S.all('task')].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  for (const x of items) if (x.buy?.name) m.set(x.buy.name.normalize('NFC').toLowerCase(), x.buy);
  for (const r of shopRecords()) m.set(r.name.normalize('NFC').toLowerCase(), { kind: r.kind, name: r.name, link: r.link });
  return [...m.values()];
}

/** Link "Mua lại": Shopee/Lazada mở app, Zalo nhắn người bán, cửa hàng gọi điện hoặc chỉ đường. */
function buyHref(b, item = '') {
  if (!b) return null;
  const raw = String(b.link || '').trim();
  const open = { shopee: 'Mở Shopee', lazada: 'Mở Lazada', tiktok: 'Mở TikTok Shop', zalo: 'Nhắn Zalo người bán' }[b.kind] || 'Mở link mua lại';
  if (/^https?:\/\//i.test(raw)) return { url: raw, label: open };
  if (/^[\w-]+(\.[\w-]+)+\/\S*$/.test(raw)) return { url: `https://${raw}`, label: open };
  const digits = raw.replace(/[\s.()-]/g, '');
  if (/^\+?\d{8,12}$/.test(digits)) {
    const local = digits.replace(/^\+?84/, '0');
    return b.kind === 'zalo' ? { url: `https://zalo.me/${local}`, label: 'Nhắn Zalo người bán' } : { url: `tel:${local}`, label: 'Gọi người bán' };
  }
  if (raw) return { url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.name, raw].filter(Boolean).join(', '))}`, label: 'Chỉ đường tới nơi mua' };
  const q = item || b.name;
  if (q && b.kind === 'shopee') return { url: `https://shopee.vn/search?keyword=${encodeURIComponent(q)}`, label: 'Tìm trên Shopee' };
  if (q && b.kind === 'lazada') return { url: `https://www.lazada.vn/catalog/?q=${encodeURIComponent(q)}`, label: 'Tìm trên Lazada' };
  return null;
}

// ---------- Thống kê chi phí từ các lần làm có ghi tiền ----------
function pricedLogs(taskId) {
  return S.all('log')
    .filter((l) => l.taskId === taskId && l.amount)
    .sort((a, b) => (b.doneAt || b.day || '').localeCompare(a.doneAt || a.day || ''));
}
/** Chênh lệch % so với lần trước, VD 21 nghĩa là đắt hơn 21%. */
const pctChange = (now, before) => (before ? Math.round(((now - before) / before) * 100) : 0);
function chgBadge(p) {
  if (!p || Math.abs(p) < 1) return '';
  return `<i class="chg ${p > 0 ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'}${Math.abs(p)}%</i>`;
}
function periodicStats(year) {
  const tasks = new Map(S.all('task').map((t) => [t.id, t]));
  const logs = S.all('log').filter((l) => l.amount && (l.day || '').startsWith(String(year)));
  const byTask = new Map();
  for (const l of logs) {
    const t = tasks.get(l.taskId);
    if (!t) continue;
    const x = byTask.get(t.id) || { t, sum: 0, n: 0 };
    x.sum += l.amount;
    x.n++;
    byTask.set(t.id, x);
  }
  const rows = [...byTask.values()].sort((a, b) => b.sum - a.sum);
  const total = rows.reduce((s, x) => s + x.sum, 0);
  const byCat = CATS.map((c) => ({ c, sum: rows.filter((x) => (x.t.category || 'other') === c.id).reduce((s, x) => s + x.sum, 0) }))
    .filter((x) => x.sum > 0)
    .sort((a, b) => b.sum - a.sum);
  const bySubj = subjects()
    .map((p) => ({ p, sum: rows.filter((x) => (x.t.subjects || []).includes(p.id)).reduce((s, x) => s + x.sum, 0) }))
    .filter((x) => x.sum > 0)
    .sort((a, b) => b.sum - a.sum);
  return { total, rows, byCat, bySubj, years: [...new Set(S.all('log').filter((l) => l.amount).map((l) => Number((l.day || '').slice(0, 4))))] };
}
/** Tổng chi phí trong năm của các việc gắn với một người/thú cưng. */
function subjectYearCost(id, year = D.today().slice(0, 4)) {
  const ids = new Set(S.all('task').filter((t) => (t.subjects || []).includes(id)).map((t) => t.id));
  return S.all('log')
    .filter((l) => l.amount && ids.has(l.taskId) && (l.day || '').startsWith(year))
    .reduce((s, l) => s + l.amount, 0);
}

// ---------- Nhắc đặt hàng sớm ----------
const ORDER_OPTS = [0, 1, 2, 3, 5, 7, 10, 14];
function needsOrder(t, today = D.today()) {
  const n = Number(t.orderBefore) || 0;
  if (!n || t.finished || !t.nextDue || t.orderedFor === t.nextDue) return false;
  return D.addDays(t.nextDue, -n) <= today && today < t.nextDue;
}

// ---------- Danh bạ nơi mua: gộp từ lịch sử + nơi mua tự thêm (config 'shop:<id>') ----------
const shopRecords = () => S.all('config').filter((c) => String(c.id).startsWith('shop:') && c.name);
const shopKey = (b) => (b.name || shopOf(b.kind)?.name || b.link || '').normalize('NFC').toLowerCase().trim();
function shopDirectory() {
  const map = new Map();
  const entry = (b) => {
    const k = shopKey(b);
    if (!k) return null;
    if (!map.has(k)) map.set(k, { key: k, name: b.name || '', kind: b.kind || '', link: b.link || '', note: '', items: new Set(), count: 0, sum: 0, last: null, rec: null });
    return map.get(k);
  };
  for (const r of shopRecords()) Object.assign(entry(r), { name: r.name, kind: r.kind || '', link: r.link || '', note: r.note || '', rec: r });
  const tasks = new Map(S.all('task').map((t) => [t.id, t]));
  const logs = S.all('log').filter((l) => hasBuy(l.buy)).sort((a, b) => (a.day || '').localeCompare(b.day || ''));
  for (const l of logs) {
    const e = entry(l.buy);
    if (!e) continue;
    if (!e.rec) {
      if (l.buy.kind) e.kind = l.buy.kind;
      if (l.buy.link) e.link = l.buy.link;
      if (l.buy.name) e.name = l.buy.name;
    }
    const t = tasks.get(l.taskId);
    if (t) e.items.add(t.buyItem || t.title);
    e.count++;
    e.sum += l.amount || 0;
    e.last = l;
  }
  for (const t of tasks.values()) {
    if (!hasBuy(t.buy)) continue;
    const e = entry(t.buy);
    if (!e) continue;
    e.items.add(t.buyItem || t.title);
    if (!e.rec) {
      e.kind ||= t.buy.kind || '';
      e.link ||= t.buy.link || '';
      e.name ||= t.buy.name || '';
    }
  }
  return [...map.values()].sort((a, b) => (b.last?.day || '').localeCompare(a.last?.day || '') || a.name.localeCompare(b.name));
}

/** Ô nhập nơi mua (dùng trong form việc và form đánh dấu xong). */
function buyFields(b = {}) {
  b = b || {};
  const shops = knownShops();
  return `
    <div class="chips shop-pick">${SHOPS.map(
      (x) => `<button type="button" class="chip ${b.kind === x.id ? 'on' : ''}" data-act="pickShop" data-v="${x.id}">${x.icon} ${x.name}</button>`
    ).join('')}</div>
    <input type="hidden" name="buyKind" value="${esc(b.kind || '')}">
    <div class="row2">
      <label>Tên shop / người bán<input name="buyName" list="shopList" value="${esc(b.name || '')}" placeholder="VD: Kangaroo Official" autocomplete="off"></label>
      <label>Link / SĐT / địa chỉ<input name="buyLink" value="${esc(b.link || '')}" placeholder="${esc(shopOf(b.kind)?.hint || 'Link, SĐT hoặc địa chỉ')}" autocomplete="off" autocapitalize="off"></label>
    </div>
    <datalist id="shopList">${shops.map((x) => `<option value="${esc(x.name)}">${esc(shopOf(x.kind)?.name || '')}</option>`).join('')}</datalist>`;
}
function readBuy(form) {
  const e = form.elements;
  if (!e.buyKind) return null;
  const b = { kind: e.buyKind.value || '', name: e.buyName.value.trim(), link: e.buyLink.value.trim() };
  return hasBuy(b) ? b : null;
}

// ---------- Người & thú cưng (mỗi người là một bản ghi config 'subject:<id>') ----------
const SUBJ_ICONS = ['🐱', '🐈‍⬛', '🐶', '🐰', '🐹', '🐟', '🐦', '👶', '👧', '👦', '👩', '👨', '👵', '👴', '🕯️', '🪴'];
function subjects() {
  return S.all('config')
    .filter((c) => String(c.id).startsWith('subject:') && c.name)
    .sort((a, b) => (a.created || 0) - (b.created || 0));
}
const subjOf = (id) => subjects().find((p) => p.id === id) || null;
const taskSubjects = (t) => (t.subjects || []).map(subjOf).filter(Boolean);
const norm = (s) => String(s || '').normalize('NFC').toLowerCase();
/** Tên có xuất hiện như một từ riêng trong câu không ("Má" khớp "Giỗ Má", không khớp "Máy lọc"). */
function mentions(text, name) {
  const n = norm(name).trim();
  if (!n) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u');
  return re.test(norm(text));
}
/** Tạo người/thú cưng mới và tự gắn vào các việc có tên đó trong tiêu đề. */
function createSubject(name, icon) {
  const p = S.put('config', { id: `subject:${S.uid()}`, name, icon: icon || '🙂', created: Date.now() });
  let linked = 0;
  for (const t of S.all('task')) {
    if (mentions(t.title, name) && !(t.subjects || []).includes(p.id)) {
      S.put('task', { ...t, subjects: [...(t.subjects || []), p.id] });
      linked++;
    }
  }
  return { p, linked };
}

// ---------- Tiện ích ----------
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => (n == null || n === '' ? '' : new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' đ');

/** "350k" → 350000, "1tr2" → 1200000, "1,5tr" → 1500000, "2.500.000" → 2500000 */
export function parseMoney(input) {
  let s = String(input ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/đ|vnd$/g, '');
  if (!s) return null;
  const units = { k: 1e3, nghìn: 1e3, ngàn: 1e3, tr: 1e6, triệu: 1e6, m: 1e6, tỷ: 1e9, ty: 1e9, tỉ: 1e9, b: 1e9 };
  let m = s.match(/^(\d+)(k|tr|triệu|m|tỷ|ty|tỉ|b)(\d+)$/);
  if (m) return Math.round(parseFloat(`${m[1]}.${m[3]}`) * units[m[2]]);
  m = s.match(/^([\d.,]+)(k|nghìn|ngàn|tr|triệu|m|tỷ|ty|tỉ|b)?$/);
  if (!m) return null;
  if (m[2]) return Math.round(parseFloat(m[1].replace(',', '.')) * units[m[2]]);
  const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function members() {
  return S.get('config', 'house')?.members || ['Anh', 'Em'];
}
function who(a) {
  if (a === 'all' || a == null || a === '') return 'Cả hai';
  return members()[a] ?? '—';
}
const me = () => (S.device.me == null ? null : Number(S.device.me));

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function fmtDateTime(s) {
  if (!s) return '';
  const [day, time] = s.split('T');
  return `${time ? time.slice(0, 5) + ' · ' : ''}${D.short(day)}/${day.slice(0, 4)}`;
}

// ---------- Trạng thái giao diện ----------
let tab = localStorage.getItem('sonha:tab') || 'today';
let expYear = new Date().getFullYear();
let taskFilter = 'all';
let subjFilter = null;

function activeTasks() {
  return S.all('task').filter((t) => !t.finished && t.nextDue);
}
const byDue = (a, b) => (a.nextDue || '9').localeCompare(b.nextDue || '9') || a.title.localeCompare(b.title);

// ---------- Thẻ việc ----------
function taskCard(t, today = D.today()) {
  const st = D.dueState(t, today);
  return `
  <div class="card task ${st}" data-act="openTask" data-id="${t.id}">
    <div class="ico" data-cat="${esc(t.category || 'other')}">${esc(t.icon || catOf(t.category).icon)}</div>
    <div class="body">
      <div class="title">${esc(t.title)}</div>
      <div class="meta"><span class="due">${D.dueLabel(t.nextDue, today)}</span><span>${D.recurLabel(t)}</span>${taskSubjects(t)
        .filter((p) => !mentions(t.title, p.name))
        .map((p) => `<span class="tag">${esc(p.icon)} ${esc(p.name)}</span>`)
        .join('')}<span>${esc(who(t.assignee))}</span></div>
    </div>
    ${t.finished ? '' : `<button class="done-btn" data-act="quickDone" data-id="${t.id}" aria-label="Đã xong">${ICON.check}</button>`}
  </div>`;
}

function orderCard(t, today = D.today()) {
  const go = buyHref(t.buy, t.buyItem);
  return `
  <div class="card task order" data-act="openTask" data-id="${t.id}">
    <div class="ico" data-cat="${esc(t.category || 'other')}">🛒</div>
    <div class="body">
      <div class="title">Đặt ${esc(t.buyItem || t.title)}</div>
      <div class="meta"><span>Cần cho “${esc(t.title)}” · ${D.dueLabel(t.nextDue, today).toLowerCase()}</span>${hasBuy(t.buy) ? `<span>${shopOf(t.buy.kind)?.icon || '🛍️'} ${esc(shopLabel(t.buy))}</span>` : ''}</div>
      <div class="order-actions">
        ${go ? `<a class="btn small primary" href="${esc(go.url)}" target="_blank" rel="noopener">${go.label} ↗</a>` : ''}
        <button class="btn small" data-act="ordered" data-id="${t.id}">✓ Đã đặt</button>
      </div>
    </div>
  </div>`;
}

function section(title, list, today, extra = '') {
  if (!list.length) return '';
  return `<section><h2>${title}<span class="count">${list.length}</span>${extra}</h2>${list.map((t) => taskCard(t, today)).join('')}</section>`;
}

// ---------- Các màn hình ----------
function viewToday() {
  const t = D.today();
  const tasks = activeTasks().sort(byDue);
  const overdue = tasks.filter((x) => x.nextDue < t);
  const todays = tasks.filter((x) => x.nextDue === t);
  const soon = tasks.filter((x) => {
    const n = D.diffDays(t, x.nextDue);
    return n > 0 && n <= Math.max(7, x.remindBefore || 0);
  });
  const name = me() == null ? '' : members()[me()];
  const banner = !S.device.api
    ? `<div class="banner" data-act="tab" data-tab="settings">Chưa kết nối máy chủ — dữ liệu mới chỉ lưu trên máy này. <b>Kết nối ngay →</b></div>`
    : me() == null
      ? `<div class="banner" data-act="tab" data-tab="settings">Chọn <b>“Tôi là ai”</b> trong Cài đặt để nhận đúng thông báo →</div>`
      : '';
  const empty =
    !overdue.length && !todays.length
      ? `<div class="empty"><div class="big">🐱</div><div>Hôm nay rảnh rang, không có việc gì đến hạn.</div>${
          tasks.length ? '' : `<button class="btn primary" data-act="newTask">Thêm việc đầu tiên</button>`
        }</div>`
      : '';
  return `
  <header class="top">
    <div><div class="eyebrow">${D.long(t)} · ${lunarShort(t)}</div><h1>${name ? `Chào ${esc(name)} 👋` : 'Sổ Nhà 🏡'}</h1></div>
    ${syncBadge()}
  </header>
  ${banner}
  <div class="stats">
    <div class="stat ${overdue.length ? 'bad' : ''}"><b>${overdue.length}</b><span>⏰ Quá hạn</span></div>
    <div class="stat ${todays.length ? 'warn' : ''}"><b>${todays.length}</b><span>☀️ Hôm nay</span></div>
    <div class="stat ${soon.length ? 'soon' : ''}"><b>${soon.length}</b><span>🌱 7 ngày tới</span></div>
  </div>
  ${section('Quá hạn', overdue, t)}
  ${(() => {
    const orders = activeTasks().filter((x) => needsOrder(x, t)).sort(byDue);
    return orders.length ? `<section><h2>🛒 Cần đặt hàng<span class="count">${orders.length}</span></h2>${orders.map((x) => orderCard(x, t)).join('')}</section>` : '';
  })()}
  ${section('Hôm nay', todays, t)}
  ${empty}
  ${section('Sắp tới', soon, t)}`;
}

function peopleRow() {
  return `<div class="people">${subjects()
    .map(
      (p) => `<button class="person ${subjFilter === p.id ? 'on' : ''}" data-act="subj" data-id="${esc(p.id)}"><span class="av">${esc(p.icon)}</span><span class="nm">${esc(p.name)}</span></button>`
    )
    .join('')}<button class="person add" data-act="newSubject"><span class="av">＋</span><span class="nm">Thêm</span></button></div>`;
}

function viewTasks() {
  const t = D.today();
  const everything = S.all('task');
  if (subjFilter && !subjOf(subjFilter)) subjFilter = null;
  const subj = subjFilter ? subjOf(subjFilter) : null;
  const all = subj ? everything.filter((x) => (x.subjects || []).includes(subj.id)) : everything;
  const filters = [{ id: 'all', name: 'Tất cả' }, ...CATS.filter((c) => all.some((x) => x.category === c.id))];
  if (!filters.some((f) => f.id === taskFilter)) taskFilter = 'all';
  const shown = all.filter((x) => taskFilter === 'all' || x.category === taskFilter);
  const active = shown.filter((x) => !x.finished).sort(byDue);
  const finished = shown.filter((x) => x.finished).sort((a, b) => (b.lastDone || '').localeCompare(a.lastDone || ''));
  const groups = CATS.map((c) => ({ c, list: active.filter((x) => (x.category || 'other') === c.id) })).filter((g) => g.list.length);
  return `
  <header class="top"><div><div class="eyebrow">${everything.filter((x) => !x.finished).length} việc đang theo dõi</div><h1>${subj ? `Việc của ${esc(subj.name)}` : 'Tất cả việc'}</h1></div>${syncBadge()}</header>
  ${peopleRow()}
  ${
    subj
      ? `<div class="card person-head"><div class="av big">${esc(subj.icon)}</div><div class="body"><div class="title">${esc(subj.name)}</div><div class="meta"><span>${all.filter((x) => !x.finished).length} việc đang theo dõi</span>${
          all.some((x) => x.finished) ? `<span>${all.filter((x) => x.finished).length} đã xong</span>` : ''
        }</div>${(() => {
          const c = subjectYearCost(subj.id);
          return c ? `<div class="cost-line">💸 Năm ${D.today().slice(0, 4)}: <b>${money(c)}</b></div>` : '';
        })()}</div><button class="btn small" data-act="editSubject" data-id="${esc(subj.id)}">Sửa</button></div>`
      : ''
  }
  <div class="chips">${filters
    .map((f) => `<button class="chip ${f.id === taskFilter ? 'on' : ''}" data-act="filter" data-f="${f.id}">${f.icon ? f.icon + ' ' : ''}${f.name}</button>`)
    .join('')}</div>
  ${groups.map((g) => section(`${g.c.icon} ${g.c.name}`, g.list, t)).join('')}
  ${
    !all.length
      ? subj
        ? `<div class="empty"><div class="big">${esc(subj.icon)}</div><div>Chưa có việc nào cho ${esc(subj.name)}.</div><button class="btn primary" data-act="fab">Thêm việc cho ${esc(subj.name)}</button></div>`
        : `<div class="empty"><div class="big">📝</div><div>Chưa có việc nào. Bấm <b>+</b> để thêm.</div></div>`
      : ''
  }
  ${finished.length ? `<details class="finished"><summary>Đã hoàn thành (${finished.length})</summary>${finished.map((x) => taskCard(x, t)).join('')}</details>` : ''}`;
}

function viewExpenses() {
  const all = S.all('expense');
  const per = periodicStats(expYear);
  const years = [...new Set([new Date().getFullYear(), ...all.map((e) => Number((e.at || '').slice(0, 4))), ...per.years])].filter(Boolean).sort();
  const list = all.filter((e) => (e.at || '').startsWith(String(expYear))).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const total = list.reduce((s, e) => s + (e.amount || 0), 0);
  const byCat = EXP_CATS.map((c) => ({ c, sum: list.filter((e) => (e.category || 'other') === c.id).reduce((s, e) => s + (e.amount || 0), 0) }))
    .filter((x) => x.sum > 0)
    .sort((a, b) => b.sum - a.sum);
  const max = Math.max(1, ...byCat.map((x) => x.sum));

  const months = {};
  for (const e of list) (months[(e.at || '').slice(0, 7)] ||= []).push(e);

  const idx = years.indexOf(expYear);
  const pmax = Math.max(1, ...per.byCat.map((x) => x.sum));
  const periodicCard = per.total
    ? `<div class="card total periodic">
    <div class="card-head"><b>🔁 Chi phí định kỳ</b><span>${per.rows.reduce((s, x) => s + x.n, 0)} lần</span></div>
    <div class="sum small">${money(per.total)}</div>
    ${per.byCat
      .map((x) => `<div class="bar"><span>${x.c.icon} ${x.c.name}</span><div class="track"><i style="width:${(x.sum / pmax) * 100}%"></i></div><b>${money(x.sum)}</b></div>`)
      .join('')}
    <div class="label sp">Từng việc</div>
    ${per.rows
      .slice(0, 8)
      .map(
        (x) => `<div class="prow" data-act="openTask" data-id="${esc(x.t.id)}"><span class="av" data-cat="${esc(x.t.category || 'other')}">${esc(x.t.icon || catOf(x.t.category).icon)}</span><b>${esc(x.t.title)}</b><span class="hint">${x.n} lần · <b class="money">${money(x.sum)}</b></span></div>`
      )
      .join('')}
    ${
      per.bySubj.length
        ? `<div class="label sp">Theo người & thú cưng</div><div class="subj-costs">${per.bySubj
            .map((x) => `<button class="subj-cost" data-act="subjGo" data-id="${esc(x.p.id)}"><span class="av">${esc(x.p.icon)}</span><span>${esc(x.p.name)}</span><b>${money(x.sum)}</b></button>`)
            .join('')}</div>`
        : ''
    }
  </div>`
    : `<div class="card total periodic"><div class="card-head"><b>🔁 Chi phí định kỳ</b></div><div class="hint">Bật “Ghi chi phí” cho việc như thay lõi lọc, tẩy giun… rồi ghi số tiền mỗi lần làm, tổng sẽ hiện ở đây.</div></div>`;
  return `
  <header class="top"><div><div class="eyebrow">Tổng năm ${expYear}: ${money(total + per.total) || '0 đ'}</div><h1>Chi tiêu</h1></div>${syncBadge()}</header>
  <div class="card total">
    <div class="year">
      <button class="icon-btn" data-act="year" data-y="${years[idx - 1] ?? ''}" ${idx > 0 ? '' : 'disabled'}>‹</button>
      <span>Năm ${expYear}</span>
      <button class="icon-btn" data-act="year" data-y="${years[idx + 1] ?? ''}" ${idx < years.length - 1 ? '' : 'disabled'}>›</button>
    </div>
    <div class="card-head"><b>👜 Khoản chi</b><span>${list.length} khoản</span></div>
    <div class="sum">${money(total) || '0 đ'}</div>
    ${byCat
      .map(
        (x) => `<div class="bar"><span>${x.c.icon} ${x.c.name}</span><div class="track"><i style="width:${(x.sum / max) * 100}%"></i></div><b>${money(x.sum)}</b></div>`
      )
      .join('')}
  </div>
  ${periodicCard}
  <div class="scan-row">
    <button class="btn primary" data-act="scanPaper">📷 Bill giấy</button>
    <button class="btn primary alt" data-act="scanScreens">📱 Đơn online</button>
    <button class="btn" data-act="priceBook">🏷️ Giá từng món</button>
    <button class="btn" data-act="shopDir">📒 Nơi mua</button>
  </div>
  ${Object.entries(months)
    .map(
      ([ym, es]) => `<section><h2>Tháng ${Number(ym.slice(5))}<span class="count">${money(es.reduce((s, e) => s + (e.amount || 0), 0))}</span></h2>
      ${es
        .map(
          (e) => `<div class="card task" data-act="editExpense" data-id="${e.id}">
          <div class="ico" data-cat="${esc(e.category || 'other')}">${catOf(e.category, EXP_CATS).icon}</div>
          <div class="body"><div class="title">${esc(e.title)}</div><div class="meta"><span>${fmtDateTime(e.at)}</span>${e.items?.length ? `<span>🧾 ${e.items.length} món</span>` : ''}${e.method ? `<span>${esc(e.method)}</span>` : ''}<span>${esc(who(e.by))}</span></div></div>
          <div class="amount">${money(e.amount)}</div></div>`
        )
        .join('')}</section>`
    )
    .join('')}
  ${!list.length ? `<div class="empty"><div class="big">👜</div><div>Chưa có khoản chi nào trong năm ${expYear}.</div><div class="hint">Bấm nút 📷 giữa thanh dưới để chụp bill hoặc chọn ảnh đơn Shopee, MoMo…</div></div>` : ''}`;
}

function viewSettings() {
  const st = S.syncStatus();
  const m = members();
  return `
  <header class="top"><div><div class="eyebrow">Sổ Nhà</div><h1>Cài đặt</h1></div>${syncBadge()}</header>

  <section><h2>Kết nối máy chủ</h2>
  <form class="card form" data-form="connect">
    <label>Địa chỉ Worker<input name="api" type="url" placeholder="https://so-nha-api.xxx.workers.dev" value="${esc(S.device.api)}" autocomplete="off" autocapitalize="off"></label>
    <label>Mã nhà (bỏ trống nếu không đặt)<input name="key" type="password" placeholder="Không bắt buộc" value="${esc(S.device.key)}" autocomplete="off"></label>
    <button class="btn primary" type="submit">Lưu & kiểm tra</button>
    <div class="hint">${statusText(st)}</div>
  </form></section>

  <section><h2>Người & thú cưng trong nhà</h2>
  <div class="card form">
    ${
      subjects()
        .map((p) => {
          const n = S.all('task').filter((x) => !x.finished && (x.subjects || []).includes(p.id)).length;
          const c = subjectYearCost(p.id);
          return `<div class="prow" data-act="editSubject" data-id="${esc(p.id)}"><span class="av">${esc(p.icon)}</span><b>${esc(p.name)}</b><span class="hint">${n} việc${c ? ` · ${money(c)}` : ''}</span><span class="chev">›</span></div>`;
        })
        .join('') || '<div class="hint">Chưa có ai. Thêm thú cưng, ông bà, con cái… để gắn vào việc và xem riêng việc của từng người.</div>'
    }
    <button class="btn" data-act="newSubject">＋ Thêm người hoặc thú cưng</button>
  </div></section>

  <section><h2>Người dùng app (2 máy)</h2>
  <form class="card form" data-form="members">
    <div class="row2">
      <label>Người 1<input name="m0" value="${esc(m[0])}" maxlength="20"></label>
      <label>Người 2<input name="m1" value="${esc(m[1])}" maxlength="20"></label>
    </div>
    <button class="btn" type="submit">Lưu tên</button>
    <div class="label">Tôi là</div>
    <div class="seg">${m.map((n, i) => `<button type="button" class="${me() === i ? 'on' : ''}" data-act="setMe" data-i="${i}">${esc(n)}</button>`).join('')}</div>
    <div class="hint">Mỗi máy chọn một người. Thông báo của việc giao cho ai sẽ gửi về máy của người đó.</div>
  </form></section>

  <section><h2>Thông báo</h2>
  <div class="card form">
    ${isStandalone() ? '' : `<div class="hint warn">Trên iPhone: mở trang này bằng Safari → nút Chia sẻ → <b>Thêm vào MH chính</b>, rồi mở app từ màn hình chính để bật thông báo.</div>`}
    <div id="pushState" class="hint">Đang kiểm tra…</div>
    <div class="row2">
      <button class="btn primary" data-act="enablePush">Bật thông báo</button>
      <button class="btn" data-act="testPush">Gửi thử</button>
    </div>
    <button class="btn" data-act="remindNow">Nhắc ngay các việc đến hạn</button>
    <button class="btn ghost" data-act="disablePush">Tắt thông báo trên máy này</button>
    <div class="hint">Máy chủ kiểm tra mỗi giờ và nhắc mỗi việc từ giờ bạn chọn (mặc định 8:00). Nếu lỡ một lượt thì lượt sau vẫn nhắc, mỗi việc chỉ nhắc một lần mỗi ngày. Việc quá hạn sẽ được nhắc lại mỗi ngày cho đến khi xong.</div>
  </div></section>

  <section><h2>Nơi mua</h2>
  <div class="card form">
    <button class="btn" data-act="shopDir">📒 Danh bạ nơi mua (${shopDirectory().length})</button>
    <div class="hint">Shopee, người bán Zalo, cửa hàng… gom từ các lần mua. Bấm là mở link, nhắn Zalo hoặc gọi.</div>
  </div></section>

  <section><h2>Dữ liệu</h2>
  <div class="card form">
    <div class="row2">
      <button class="btn" data-act="syncNow">Đồng bộ ngay</button>
      <button class="btn" data-act="export">Xuất sao lưu</button>
    </div>
    <label class="btn file">Nhập từ file sao lưu<input type="file" accept="application/json,.json" data-act-change="import" hidden></label>
    <button class="btn ghost" data-act="resync">Tải lại toàn bộ từ máy chủ</button>
  </div></section>
  <p class="foot">Sổ Nhà · ${APP_VERSION} · 🧡</p>`;
}

const views = { today: viewToday, tasks: viewTasks, expenses: viewExpenses, settings: viewSettings };

function statusText(st) {
  const last = st.lastSync ? `Lần cuối: ${new Date(st.lastSync).toLocaleString('vi-VN')}` : '';
  const pend = st.pending ? ` · ${st.pending} thay đổi chờ gửi` : '';
  switch (st.state) {
    case 'unconfigured':
      return 'Chưa kết nối — dữ liệu chỉ nằm trên máy này.';
    case 'syncing':
      return 'Đang đồng bộ…';
    case 'offline':
      return `Đang offline${pend}. Sẽ tự gửi khi có mạng.`;
    case 'error':
      return `<span class="err">Lỗi: ${esc(st.message)}</span>${pend}`;
    case 'ok':
      return `✓ Đã đồng bộ. ${last}${pend}`;
    default:
      return last + pend;
  }
}

function syncBadge() {
  const st = S.syncStatus();
  const cls = { ok: 'ok', syncing: 'busy', error: 'bad', offline: 'busy', unconfigured: 'off' }[st.state] || (st.pending ? 'busy' : 'ok');
  return `<button class="sync ${cls}" data-act="syncNow" aria-label="Đồng bộ"><i></i></button>`;
}

// ---------- Vẽ lại ----------
function render() {
  const main = $('#main');
  const y = window.scrollY;
  main.innerHTML = views[tab]();
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#fab').hidden = tab === 'settings';
  window.scrollTo(0, y);
  if (tab === 'settings') updatePushState();
  updateBadge();
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    // không vẽ lại khi đang gõ trong form cài đặt
    if (tab === 'settings' && document.activeElement?.matches('#main input')) return;
    render();
    if (sheetRefresh) sheetRefresh();
  });
}

function updateBadge() {
  const t = D.today();
  const n = activeTasks().filter((x) => x.nextDue <= t).length;
  try {
    if (n) navigator.setAppBadge?.(n);
    else navigator.clearAppBadge?.();
  } catch {}
}

async function updatePushState() {
  const el = $('#pushState');
  if (!el) return;
  const s = await pushState();
  el.innerHTML = {
    on: '✓ Máy này đang nhận thông báo.',
    off: 'Máy này chưa bật thông báo.',
    denied: '<span class="err">Thông báo đang bị chặn. Vào Cài đặt iPhone → Thông báo → Sổ Nhà để bật lại.</span>',
    unsupported: 'Trình duyệt này chưa hỗ trợ thông báo.',
  }[s];
}

// ---------- Bottom sheet ----------
let sheetRefresh = null;
function openSheet(html, refresh = null) {
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="sheet-bg" data-act="closeSheet"></div><div class="sheet-panel"><div class="grab"></div>${html}</div>`;
  sheet.hidden = false;
  document.body.classList.add('locked');
  sheetRefresh = refresh;
  requestAnimationFrame(() => sheet.classList.add('open'));
}
function closeSheet() {
  if (scanAbort) {
    scanAbort.abort();
    scanAbort = null;
  }
  const sheet = $('#sheet');
  sheet.classList.remove('open');
  sheetRefresh = null;
  document.body.classList.remove('locked');
  setTimeout(() => {
    if (!sheet.classList.contains('open')) {
      sheet.hidden = true;
      sheet.innerHTML = '';
    }
  }, 220);
}

// ---------- Toast ----------
let toastTimer;
function toast(msg, actionLabel, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (actionLabel) {
    el.querySelector('button').onclick = () => {
      el.classList.remove('show');
      action();
    };
  }
  toastTimer = setTimeout(() => el.classList.remove('show'), actionLabel ? 6000 : 2500);
}

// ---------- Form việc ----------
function hourOptions(sel) {
  let s = '';
  for (let h = 0; h <= 23; h++) s += `<option value="${h}" ${h === sel ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`;
  return s;
}

function taskForm(task = {}, prefill = null) {
  const isNew = !task.id;
  const t = { type: 'interval', everyDays: 3, everyMonths: 1, remindHour: 8, remindBefore: 0, assignee: 'all', category: 'other', lunarMode: 'monthly', lunarDays: [1, 15], ...task, ...(prefill || {}) };
  const today = D.today();
  const m = members();
  const monthlyDate = t.type === 'monthly' && t.nextDue ? t.nextDue : D.nextDayOfMonth(t.day || Number(today.slice(8)));
  openSheet(`
  <form class="form" data-form="task" data-type="${t.type}" data-lunar="${t.lunarMode}" data-cost="${t.trackAmount ? 1 : 0}" data-id="${t.id || ''}">
    <h3>${isNew ? 'Thêm việc' : 'Sửa việc'}</h3>
    ${
      isNew
        ? `<div class="label">Mẫu có sẵn</div><div class="chips scroll">${TEMPLATES.map(
            (x, i) => `<button type="button" class="chip" data-act="template" data-i="${i}">${x.icon} ${x.title}</button>`
          ).join('')}</div>`
        : ''
    }
    <div class="row-icon">
      <label class="icon-input">Biểu tượng<input name="icon" value="${esc(t.icon || '')}" maxlength="4" placeholder="${catOf(t.category).icon}"></label>
      <label>Tên việc<input name="title" required value="${esc(t.title || '')}" placeholder="VD: Thay cát mèo"></label>
    </div>
    <label>Nhóm<select name="category">${CATS.map((c) => `<option value="${c.id}" ${c.id === t.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select></label>

    <div class="label">Liên quan đến</div>
    <div class="chips subj-pick" data-subjects>${subjChips(t.subjects || [])}</div>
    <div class="inline-add" hidden>
      <div class="row-icon">
        <label class="icon-input">Biểu tượng<input name="newSubjIcon" maxlength="4" placeholder="🐱" autocomplete="off"></label>
        <label>Tên<input name="newSubjName" placeholder="VD: Thúi, Bé Na, Bà nội" autocomplete="off"></label>
      </div>
      <div class="icon-pick">${SUBJ_ICONS.map((i) => `<button type="button" data-act="pickInlineIcon" data-v="${i}">${i}</button>`).join('')}</div>
      <button type="button" class="btn" data-act="saveSubjInline">Thêm vào danh sách</button>
    </div>
    <input type="hidden" name="subjects" value="${esc((t.subjects || []).join(','))}">

    <div class="label">Kiểu lặp</div>
    <div class="seg tight" data-seg="type">
      <button type="button" data-v="interval" class="${t.type === 'interval' ? 'on' : ''}">Sau N ngày</button>
      <button type="button" data-v="monthly" class="${t.type === 'monthly' ? 'on' : ''}">Theo tháng</button>
      <button type="button" data-v="lunar" class="${t.type === 'lunar' ? 'on' : ''}">Âm lịch</button>
      <button type="button" data-v="once" class="${t.type === 'once' ? 'on' : ''}">Một lần</button>
    </div>
    <input type="hidden" name="type" value="${t.type}">

    <div class="only-interval row2">
      <label>Lặp lại sau (ngày)<input name="everyDays" type="number" min="1" max="3650" inputmode="numeric" value="${t.everyDays || 3}"></label>
      <label>Lần làm gần nhất<input name="lastDone" type="date" value="${t.lastDone || today}"></label>
    </div>
    <div class="only-interval hint">Hạn lần tới = lần làm gần nhất + số ngày. Làm trễ thì lịch tự lùi theo.</div>

    <div class="only-monthly row2">
      <label>Hạn lần tới<input name="monthlyDue" type="date" value="${monthlyDate}"></label>
      <label>Lặp mỗi (tháng)<input name="everyMonths" type="number" min="1" max="120" inputmode="numeric" value="${t.everyMonths || 1}"></label>
    </div>
    <div class="only-monthly hint">Giữ đúng ngày trong tháng dù trả sớm hay trễ. 12 tháng = hằng năm.</div>

    <div class="only-lunar">
      <div class="seg" data-seg="lunarMode">
        <button type="button" data-v="monthly" class="${t.lunarMode !== 'yearly' ? 'on' : ''}">Hằng tháng</button>
        <button type="button" data-v="yearly" class="${t.lunarMode === 'yearly' ? 'on' : ''}">Hằng năm (giỗ)</button>
      </div>
      <input type="hidden" name="lunarMode" value="${t.lunarMode === 'yearly' ? 'yearly' : 'monthly'}">
    </div>
    <label class="only-lunar only-lunar-monthly">Các ngày âm<input name="lunarDays" value="${esc((t.lunarDays || [1, 15]).join(', '))}" inputmode="numeric" placeholder="VD: 1, 15" autocomplete="off"></label>
    <div class="only-lunar only-lunar-yearly row2">
      <label>Ngày âm<input name="lunarDay" type="number" min="1" max="30" inputmode="numeric" value="${t.lunarDay || ''}" placeholder="VD: 10"></label>
      <label>Tháng âm<input name="lunarMonth" type="number" min="1" max="12" inputmode="numeric" value="${t.lunarMonth || ''}" placeholder="VD: 3"></label>
    </div>
    <div class="only-lunar hint" data-lunar-preview></div>

    <label class="only-once">Ngày<input name="onceDue" type="date" value="${t.type === 'once' && t.nextDue ? t.nextDue : today}"></label>

    <div class="row2">
      <label>Giờ nhắc<select name="remindHour">${hourOptions(Number(t.remindHour))}</select></label>
      <label>Nhắc trước<select name="remindBefore">${[0, 1, 2, 3, 5, 7, 14, 30]
        .map((n) => `<option value="${n}" ${n === Number(t.remindBefore) ? 'selected' : ''}>${n ? n + ' ngày' : 'Đúng ngày'}</option>`)
        .join('')}</select></label>
    </div>

    <div class="label">Ai phụ trách</div>
    <div class="seg" data-seg="assignee">
      ${m.map((n, i) => `<button type="button" data-v="${i}" class="${String(t.assignee) === String(i) ? 'on' : ''}">${esc(n)}</button>`).join('')}
      <button type="button" data-v="all" class="${t.assignee === 'all' ? 'on' : ''}">Cả hai</button>
    </div>
    <input type="hidden" name="assignee" value="${t.assignee}">

    <label class="check cost-toggle"><input type="checkbox" name="trackAmount" ${t.trackAmount ? 'checked' : ''}> 💰 Ghi giá tiền & nơi mua mỗi lần làm</label>
    <div class="only-cost cost-box">
      <div class="row2 price-row">
        <label>Sản phẩm hay mua<input name="buyItem" value="${esc(t.buyItem || '')}" placeholder="VD: Lõi lọc số 1" autocomplete="off"></label>
        <label>💰 Giá mỗi lần<input name="price" inputmode="decimal" value="${t.price ? new Intl.NumberFormat('vi-VN').format(t.price) : ''}" placeholder="VD: 320k" autocomplete="off"></label>
      </div>
      <div class="label">Nơi mua quen</div>
      ${buyFields(t.buy)}
      <label>Nhắc đặt hàng trước<select name="orderBefore">${ORDER_OPTS.map(
        (n) => `<option value="${n}" ${n === (Number(t.orderBefore) || 0) ? 'selected' : ''}>${n ? `${n} ngày (để kịp giao hàng)` : 'Không nhắc'}</option>`
      ).join('')}</select></label>
      <div class="hint">Mỗi lần đánh dấu xong, app điền sẵn giá và nơi mua này để bạn xác nhận hoặc sửa. Giá được cập nhật theo lần trả gần nhất.</div>
    </div>
    <label>Ghi chú<textarea name="note" rows="2" placeholder="VD: Mã KH điện PE01…">${esc(t.note || '')}</textarea></label>

    <div class="actions">
      <button type="button" class="btn" data-act="closeSheet">Hủy</button>
      <button type="submit" class="btn primary">${isNew ? 'Thêm việc' : 'Lưu'}</button>
    </div>
  </form>`);
}

function subjChips(sel) {
  return (
    subjects()
      .map((p) => `<button type="button" class="chip ${sel.includes(p.id) ? 'on' : ''}" data-act="pickSubj" data-id="${esc(p.id)}">${esc(p.icon)} ${esc(p.name)}</button>`)
      .join('') + `<button type="button" class="chip add" data-act="addSubjInline">＋ Thêm</button>`
  );
}
const selectedSubj = (form) => String(form.elements.subjects.value || '').split(',').filter(Boolean);
function setSelectedSubj(form, ids) {
  form.elements.subjects.value = ids.join(',');
  form.querySelector('[data-subjects]').innerHTML = subjChips(ids);
}
/** Gõ tên việc có chứa tên người/thú cưng → tự chọn (trừ khi đã bỏ chọn bằng tay). */
function autoPickSubj(form) {
  if (!form?.elements.subjects) return;
  const off = (form.dataset.subjOff || '').split(',');
  const sel = selectedSubj(form);
  const add = subjects().filter((p) => !sel.includes(p.id) && !off.includes(p.id) && mentions(form.elements.title.value, p.name));
  if (add.length) setSelectedSubj(form, [...sel, ...add.map((p) => p.id)]);
}

function applyTemplate(form, x) {
  const set = (n, v) => {
    const el = form.elements[n];
    if (el) el.value = v;
  };
  set('title', x.title);
  autoPickSubj(form);
  set('icon', x.icon);
  set('category', x.category);
  setSeg(form, 'type', x.type);
  if (x.type === 'interval') set('everyDays', x.everyDays);
  if (x.type === 'monthly') {
    set('everyMonths', x.everyMonths || 1);
    set('monthlyDue', x.day ? D.nextDayOfMonth(x.day) : x.everyMonths === 12 ? D.addMonths(D.today(), 12) : D.today());
  }
  if (x.type === 'lunar') {
    setSeg(form, 'lunarMode', x.lunarMode || 'monthly');
    if (x.lunarDays) set('lunarDays', x.lunarDays.join(', '));
    set('lunarDay', x.lunarDay ?? '');
    set('lunarMonth', x.lunarMonth ?? '');
  }
  set('remindBefore', x.remindBefore || 0);
  if (x.remindHour != null) set('remindHour', x.remindHour);
  form.elements.trackAmount.checked = !!x.trackAmount;
  form.dataset.cost = x.trackAmount ? '1' : '0';
  updateLunarPreview(form);
  if (x.type === 'lunar' && x.lunarMode === 'yearly' && !x.lunarDay) {
    const el = form.elements.title;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }
}

/** Đọc cấu hình âm lịch từ form. Trả về null nếu chưa hợp lệ. */
function lunarFromForm(form) {
  const f = form.elements;
  if (f.lunarMode.value === 'yearly') {
    const day = parseInt(f.lunarDay.value, 10);
    const month = parseInt(f.lunarMonth.value, 10);
    if (!(day >= 1 && day <= 30 && month >= 1 && month <= 12)) return null;
    return { lunarMode: 'yearly', lunarDay: day, lunarMonth: month };
  }
  const days = [...new Set(String(f.lunarDays.value).split(/[^\d]+/).map(Number).filter((d) => d >= 1 && d <= 30))].sort((a, b) => a - b);
  return days.length ? { lunarMode: 'monthly', lunarDays: days } : null;
}

function updateLunarPreview(form) {
  const el = form.querySelector('[data-lunar-preview]');
  if (!el) return;
  const cfg = form.elements.type.value === 'lunar' ? lunarFromForm(form) : null;
  if (!cfg) {
    el.textContent = form.elements.lunarMode.value === 'yearly' ? 'Nhập ngày và tháng âm, VD: giỗ ngày 10 tháng 3.' : 'Nhập ngày âm, cách nhau bằng dấu phẩy. VD: 1, 15.';
    return;
  }
  const next = D.lunarNext(cfg);
  el.textContent = next ? `Lần tới: ${D.long(next)} (${lunarShort(next)}). Tháng thiếu thì ngày 30 tính là ngày 29.` : 'Không tìm thấy ngày phù hợp.';
}

function setSeg(form, name, v) {
  form.elements[name].value = v;
  form.querySelectorAll(`[data-seg="${name}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  if (name === 'type') form.dataset.type = v;
  if (name === 'lunarMode') form.dataset.lunar = v;
  if (name === 'type' || name === 'lunarMode') updateLunarPreview(form);
}

function saveTask(form) {
  const f = Object.fromEntries(new FormData(form));
  const old = form.dataset.id ? S.get('task', form.dataset.id) : null;
  const title = f.title.trim();
  if (!title) return toast('Nhập tên việc');
  if (f.trackAmount && f.price && parseMoney(f.price) == null) return toast('Giá chưa đúng (VD: 320k, 1tr2)');
  const task = {
    ...(old || {}),
    title,
    icon: f.icon.trim(),
    category: f.category,
    type: f.type,
    remindHour: Number(f.remindHour),
    remindBefore: Number(f.remindBefore),
    assignee: f.assignee === 'all' ? 'all' : Number(f.assignee),
    trackAmount: !!f.trackAmount,
    buyItem: (f.buyItem || '').trim(),
    price: f.trackAmount ? parseMoney(f.price) || null : (old?.price ?? null),
    orderBefore: f.trackAmount ? Number(f.orderBefore) || 0 : 0,
    buy: f.trackAmount ? readBuy(form) : (old?.buy ?? null),
    note: f.note.trim(),
    finished: false,
  };
  if (f.type === 'interval') {
    task.everyDays = Math.max(1, parseInt(f.everyDays, 10) || 1);
    task.lastDone = f.lastDone || D.today();
    task.nextDue = D.addDays(task.lastDone, task.everyDays);
  } else if (f.type === 'monthly') {
    task.everyMonths = Math.max(1, parseInt(f.everyMonths, 10) || 1);
    task.nextDue = f.monthlyDue || D.today();
    task.anchorDay = Number(task.nextDue.slice(8));
  } else if (f.type === 'lunar') {
    const cfg = lunarFromForm(form);
    if (!cfg) return toast(f.lunarMode === 'yearly' ? 'Nhập ngày (1–30) và tháng âm (1–12)' : 'Nhập ngày âm, VD: 1, 15');
    delete task.lunarDays;
    delete task.lunarDay;
    delete task.lunarMonth;
    Object.assign(task, cfg);
    const key = (x) => JSON.stringify([x.lunarMode, x.lunarDays, x.lunarDay, x.lunarMonth]);
    const sameCfg = old && old.type === 'lunar' && key(old) === key(task);
    // sửa tên/giờ nhắc thì giữ hạn cũ (kể cả đang quá hạn); đổi ngày âm thì tính lại
    task.nextDue = sameCfg && old.nextDue ? old.nextDue : D.lunarNext(task, D.today());
  } else {
    task.nextDue = f.onceDue || D.today();
  }
  task.subjects = String(f.subjects || '').split(',').filter((id) => id && subjOf(id));
  if (!old) task.createdBy = me();
  S.put('task', task);
  closeSheet();
  toast(old ? 'Đã lưu' : `Đã thêm · ${D.dueLabel(task.nextDue)}`);
}

// ---------- Đánh dấu xong ----------
function markDone(task, day = D.today(), amount = null, note = '', buy = null) {
  const prev = { ...task };
  const log = S.put('log', {
    taskId: task.id,
    day,
    doneAt: day === D.today() ? new Date().toISOString() : `${day}T12:00:00`,
    by: me(),
    amount,
    note,
    ...(buy ? { buy } : {}),
  });
  const next = D.afterDone(task, day);
  S.put('task', { ...task, ...next, ...(buy ? { buy } : {}), ...(amount ? { price: amount } : {}) });
  const msg = next.finished ? `Xong “${task.title}”` : `Xong · lần tới ${D.short(next.nextDue)}`;
  toast(msg, 'Hoàn tác', () => {
    S.remove('log', log.id);
    S.put('task', prev);
  });
}

function doneCostFields(task) {
  const last = S.all('log')
    .filter((l) => l.taskId === task.id && l.amount)
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))[0];
  const showShop = hasBuy(task.buy) || task.category !== 'bill';
  return `
    <label>Số tiền<input name="amount" inputmode="decimal" value="${task.price ? new Intl.NumberFormat('vi-VN').format(task.price) : ''}" placeholder="${last ? `Lần trước ${money(last.amount)}${last.buy ? ' · ' + esc(shopLabel(last.buy)) : ''}` : 'VD: 850k hoặc 1tr2'}" autocomplete="off"></label>
    <div class="price-hint" data-price-hint hidden></div>
    ${showShop ? `<div class="label">Mua ở</div>${buyFields(task.buy)}` : ''}`;
}

/** So giá đang nhập với lần trước và giá rẻ nhất từng mua. */
function updatePriceHint(form) {
  const el = form.querySelector('[data-price-hint]');
  if (!el) return;
  const amount = parseMoney(form.elements.amount.value);
  const logs = pricedLogs(form.dataset.id);
  if (!amount || !logs.length) return (el.hidden = true);
  const last = logs[0];
  const min = logs.reduce((m, l) => (l.amount < m.amount ? l : m), logs[0]);
  const p = pctChange(amount, last.amount);
  const at = (l) => (l.buy ? ` · ${esc(shopLabel(l.buy))}` : '');
  let html = '';
  if (p >= 20) {
    html = `⚠️ <b>Đắt hơn lần trước ${p}%</b> (${money(last.amount)}${at(last)}).`;
    if (min.amount < amount) {
      const go = buyHref(min.buy);
      html += ` Rẻ nhất từng mua: <b>${money(min.amount)}</b>${at(min)}.${go ? ` <a href="${esc(go.url)}" target="_blank" rel="noopener">${go.label} ↗</a>` : ''}`;
    }
    el.className = 'price-hint up';
  } else if (p <= -5) {
    html = `🎉 Rẻ hơn lần trước ${-p}% (${money(last.amount)}${at(last)}).`;
    el.className = 'price-hint down';
  } else {
    html = `Gần bằng lần trước (${money(last.amount)}${at(last)}).`;
    el.className = 'price-hint';
  }
  el.innerHTML = html;
  el.hidden = false;
}

/** Sửa một lần đã làm: ngày, giá tiền, nơi mua, ghi chú. */
function logForm(l) {
  const t = S.get('task', l.taskId) || {};
  openSheet(`
  <form class="form" data-form="log" data-id="${l.id}">
    <h3>${esc(t.icon || '📝')} ${esc(t.title || 'Lần làm')}</h3>
    <label>Ngày làm<input name="day" type="date" value="${esc(l.day)}" max="${D.today()}"></label>
    <label>Số tiền<input name="amount" inputmode="decimal" value="${l.amount ? new Intl.NumberFormat('vi-VN').format(l.amount) : ''}" placeholder="VD: 850k hoặc 1tr2" autocomplete="off"></label>
    ${t.category === 'bill' && !hasBuy(l.buy) ? '' : `<div class="label">Mua ở</div>${buyFields(l.buy || t.buy)}`}
    <label>Ghi chú<input name="note" value="${esc(l.note || '')}" placeholder="Không bắt buộc"></label>
    <div class="actions">
      <button type="button" class="btn" data-act="openTask" data-id="${esc(l.taskId)}">Quay lại</button>
      <button type="submit" class="btn primary">Lưu</button>
    </div>
  </form>`);
  setTimeout(() => $('#sheet [name=amount]')?.focus(), 250);
}

function doneSheet(task) {
  openSheet(`
  <form class="form" data-form="done" data-id="${task.id}">
    <h3>${esc(task.icon || catOf(task.category).icon)} ${esc(task.title)}</h3>
    <label>Ngày làm<input name="day" type="date" value="${D.today()}" max="${D.today()}"></label>
    ${
      task.trackAmount
        ? doneCostFields(task)
        : `<details class="cost-more"><summary>💰 Thêm giá tiền, nơi mua</summary><div class="cost-more-body">${doneCostFields(task)}</div></details>`
    }
    <label>Ghi chú<input name="note" placeholder="Không bắt buộc"></label>
    <div class="actions">
      <button type="button" class="btn" data-act="closeSheet">Hủy</button>
      <button type="submit" class="btn primary">Đánh dấu xong</button>
    </div>
  </form>`);
  setTimeout(() => $('#sheet [name=amount]')?.focus(), 250);
}

function buyCard(t, logs) {
  const priced = logs.filter((l) => l.amount);
  const b = hasBuy(t.buy) ? t.buy : logs.find((l) => hasBuy(l.buy))?.buy;
  if (!b && !priced.length && !t.buyItem && !t.price) return '';
  const lastChg = priced.length > 1 ? pctChange(priced[0].amount, priced[1].amount) : 0;
  const orderLine = Number(t.orderBefore)
    ? t.orderedFor && t.orderedFor === t.nextDue
      ? `<div class="order-state ok">✓ Đã đặt hàng cho lần ${D.short(t.nextDue)} <button class="link" data-act="unordered" data-id="${t.id}">Bỏ</button></div>`
      : needsOrder(t)
        ? `<div class="order-state warn">🛒 Đến lúc đặt hàng <button class="btn small" data-act="ordered" data-id="${t.id}">✓ Đã đặt</button></div>`
        : `<div class="order-state">🛒 Nhắc đặt hàng trước ${t.orderBefore} ngày</div>`
    : '';
  const last = priced[0];
  const min = priced.reduce((m, l) => (!m || l.amount < m.amount ? l : m), null);
  const year = D.today().slice(0, 4);
  const yr = priced.filter((l) => (l.day || '').startsWith(year));
  const yrSum = yr.reduce((s, l) => s + l.amount, 0);
  const go = buyHref(b, t.buyItem);
  const shop = shopOf(b?.kind);
  return `
  <div class="buy-card">
    ${t.buyItem ? `<div class="buy-item">📦 ${esc(t.buyItem)}</div>` : ''}
    ${b ? `<div class="buy-shop">${shop?.icon || '🛍️'} <b>${esc(shopLabel(b))}</b>${b.name && shop ? `<span>${shop.name}</span>` : ''}</div>` : ''}
    ${
      !priced.length && t.price ? `<div class="buy-stats"><div><small>Giá mỗi lần</small><b>${money(t.price)}</b><span>chưa có lần trả nào</span></div></div>` : ''
    }
    ${
      priced.length
        ? `<div class="buy-stats">
      <div><small>Lần trước ${chgBadge(lastChg)}</small><b>${money(last.amount)}</b><span>${D.short(last.day)}${last.buy ? ' · ' + esc(shopLabel(last.buy)) : ''}</span></div>
      ${priced.length > 1 ? `<div><small>Rẻ nhất</small><b>${money(min.amount)}</b><span>${min.buy ? esc(shopLabel(min.buy)) : D.short(min.day)}</span></div>` : ''}
      ${yr.length ? `<div><small>Năm ${year}</small><b>${money(yrSum)}</b><span>${yr.length} lần</span></div>` : ''}
    </div>`
        : ''
    }
    ${orderLine}
    ${go ? `<a class="btn primary buy-go" href="${esc(go.url)}" target="_blank" rel="noopener">${go.label} ↗</a>` : ''}
  </div>`;
}

function taskDetail(id) {
  const render = () => {
    const t = S.get('task', id);
    if (!t) return closeSheet();
    const logs = S.all('log').filter((l) => l.taskId === id).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    const priced = logs.filter((l) => l.amount);
    const amounts = priced.slice(0, 12).reverse();
    const max = Math.max(1, ...amounts.map((l) => l.amount));
    const st = D.dueState(t);
    return `
    <div class="detail">
      <div class="detail-head">
        <div class="ico big" data-cat="${esc(t.category || 'other')}">${esc(t.icon || catOf(t.category).icon)}</div>
        <div><h3>${esc(t.title)}</h3><div class="meta"><span>${D.recurLabel(t)}</span><span>${esc(who(t.assignee))}</span><span>${String(t.remindHour ?? 8).padStart(2, '0')}:00</span></div></div>
      </div>
      <div class="due-big ${st}">${t.finished ? 'Đã hoàn thành' : `${D.dueLabel(t.nextDue)}<small>${D.long(t.nextDue)}${t.type === 'lunar' ? ` · ${lunarShort(t.nextDue)}` : ''}</small>`}</div>
      ${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}
      ${
        buyCard(t, logs) ||
        (t.trackAmount
          ? ''
          : `<button class="btn cost-on" data-act="enableCost" data-id="${id}">💰 Ghi giá tiền & nơi mua cho việc này</button>`)
      }
      <div class="actions">
        <button class="btn" data-act="editTask" data-id="${id}">Sửa</button>
        ${t.finished ? '' : `<button class="btn primary" data-act="doneSheet" data-id="${id}">Đánh dấu xong</button>`}
      </div>
      ${
        amounts.length > 1
          ? `<div class="label">Số tiền các lần gần đây</div><div class="chart">${amounts
              .map((l) => `<div class="col" title="${money(l.amount)}"><i style="height:${(l.amount / max) * 100}%"></i><span>${D.short(l.day)}</span></div>`)
              .join('')}</div>`
          : ''
      }
      <div class="label">Lịch sử (${logs.length})${logs.length ? ' · bấm một dòng để thêm/sửa giá' : ''}</div>
      <div class="history">${
        logs
          .slice(0, 50)
          .map((l) => {
            const i = priced.indexOf(l);
            return { ...l, _chg: i >= 0 && priced[i + 1] ? pctChange(l.amount, priced[i + 1].amount) : 0 };
          })
          .map(
            (l) => `<div class="hrow" data-act="editLog" data-id="${l.id}"><span>${D.weekday(l.day)} ${D.short(l.day)}/${l.day.slice(0, 4)}${
              hasBuy(l.buy) ? `<small>${shopOf(l.buy.kind)?.icon || '🛍️'} ${esc(shopLabel(l.buy))}</small>` : ''
            }${l.note ? `<small>${esc(l.note)}</small>` : ''}</span><span>${esc(who(l.by))}</span><b>${money(l.amount)}${chgBadge(l._chg)}</b>
              <button class="icon-btn small" data-act="delLog" data-id="${l.id}" aria-label="Xóa">×</button></div>`
          )
          .join('') || '<div class="hint">Chưa có lần nào.</div>'
      }</div>
      <button class="btn danger ghost" data-act="delTask" data-id="${id}">Xóa việc này</button>
    </div>`;
  };
  openSheet(render(), () => {
    const panel = $('#sheet .sheet-panel');
    if (panel && S.get('task', id)) panel.innerHTML = '<div class="grab"></div>' + render();
  });
}

// ---------- Form người & thú cưng ----------
function subjectForm(p = {}) {
  const isNew = !p.id;
  const n = isNew ? 0 : S.all('task').filter((x) => (x.subjects || []).includes(p.id)).length;
  openSheet(`
  <form class="form" data-form="subject" data-id="${esc(p.id || '')}">
    <h3>${isNew ? 'Thêm người hoặc thú cưng' : 'Sửa'}</h3>
    <div class="row-icon">
      <label class="icon-input">Biểu tượng<input name="icon" value="${esc(p.icon || '')}" maxlength="4" placeholder="🐱" autocomplete="off"></label>
      <label>Tên<input name="name" required value="${esc(p.name || '')}" maxlength="24" placeholder="VD: Thúi, Bé Na, Bà nội" autocomplete="off"></label>
    </div>
    <div class="icon-pick">${SUBJ_ICONS.map((i) => `<button type="button" class="${i === p.icon ? 'on' : ''}" data-act="pickIcon" data-v="${i}">${i}</button>`).join('')}</div>
    <div class="hint">${isNew ? 'Các việc đã có chứa tên này (VD: “Thay cát cho Thúi”) sẽ được gắn tự động.' : `Đang gắn với ${n} việc.`}</div>
    <div class="actions">
      <button type="button" class="btn" data-act="closeSheet">Hủy</button>
      <button type="submit" class="btn primary">${isNew ? 'Thêm' : 'Lưu'}</button>
    </div>
    ${isNew ? '' : `<button type="button" class="btn danger ghost" data-act="delSubject" data-id="${esc(p.id)}">Xóa khỏi danh sách</button>`}
  </form>`);
  if (isNew) setTimeout(() => $('#sheet [name=name]')?.focus(), 250);
}

function saveSubject(form) {
  const f = Object.fromEntries(new FormData(form));
  const name = f.name.trim();
  if (!name) return toast('Nhập tên');
  const icon = f.icon.trim() || '🙂';
  const old = form.dataset.id ? subjOf(form.dataset.id) : null;
  if (!old && subjects().some((p) => norm(p.name) === norm(name))) return toast(`Đã có ${name} trong danh sách`);
  closeSheet();
  if (old) {
    S.put('config', { ...old, name, icon });
    return toast('Đã lưu');
  }
  const { p, linked } = createSubject(name, icon);
  subjFilter = p.id;
  if (tab !== 'settings') actions.tab({ tab: 'tasks' });
  toast(linked ? `Đã thêm ${name} · gắn ${linked} việc có tên ${name}` : `Đã thêm ${name}`);
}

// ---------- Danh bạ nơi mua ----------
function shopDirSheet() {
  const render = () => {
    const list = shopDirectory();
    return `
    <div class="detail">
      <h3>📒 Danh bạ nơi mua</h3>
      ${
        list
          .map((e) => {
            const s = shopOf(e.kind);
            const go = buyHref({ kind: e.kind, name: e.name, link: e.link }, [...e.items][0]);
            return `<div class="shop-card">
          <div class="shop-top"><span class="av">${s?.icon || '🛍️'}</span><div class="body"><div class="title">${esc(e.name || s?.name || e.link)}</div><div class="meta">${s ? `<span>${s.name}</span>` : ''}${e.link ? `<span class="lnk">${esc(e.link)}</span>` : ''}</div></div>
            <button class="btn small" data-act="editShop" data-key="${esc(e.key)}">Sửa</button></div>
          ${e.items.size ? `<div class="shop-items">${[...e.items].map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
          ${e.count ? `<div class="hint">${e.count} lần mua · tổng ${money(e.sum)} · gần nhất ${D.short(e.last.day)} (${money(e.last.amount)})</div>` : ''}
          ${e.note ? `<div class="hint">📝 ${esc(e.note)}</div>` : ''}
          ${go ? `<a class="btn primary small" href="${esc(go.url)}" target="_blank" rel="noopener">${go.label} ↗</a>` : ''}
        </div>`;
          })
          .join('') || '<div class="hint">Chưa có nơi mua nào. Khi đánh dấu xong việc có ghi chi phí, nơi mua sẽ tự vào đây.</div>'
      }
      <button class="btn" data-act="newShop">＋ Thêm nơi mua</button>
    </div>`;
  };
  openSheet(render(), () => {
    const panel = $('#sheet .sheet-panel');
    if (panel && panel.querySelector('.detail h3')?.textContent.includes('Danh bạ')) panel.innerHTML = '<div class="grab"></div>' + render();
  });
}

function shopForm(e = null) {
  const isNew = !e;
  openSheet(`
  <form class="form" data-form="shop" data-key="${esc(e?.key || '')}">
    <h3>${isNew ? 'Thêm nơi mua' : 'Sửa nơi mua'}</h3>
    ${buyFields({ kind: e?.kind, name: e?.name, link: e?.link })}
    <label>Ghi chú<input name="note" value="${esc(e?.note || '')}" placeholder="VD: giao nhanh, hay có mã giảm giá" autocomplete="off"></label>
    ${isNew ? '' : '<div class="hint">Đổi tên, loại hoặc link sẽ cập nhật cho mọi việc và lịch sử dùng nơi mua này.</div>'}
    <div class="actions">
      <button type="button" class="btn" data-act="shopDir">Quay lại</button>
      <button type="submit" class="btn primary">${isNew ? 'Thêm' : 'Lưu'}</button>
    </div>
    ${e?.rec ? `<button type="button" class="btn danger ghost" data-act="delShop" data-id="${esc(e.rec.id)}">Xóa khỏi danh bạ</button>` : ''}
  </form>`);
}

function saveShop(form) {
  const b = readBuy(form);
  if (!b || !b.name) return toast('Nhập tên shop / người bán');
  const note = form.elements.note.value.trim();
  const oldKey = form.dataset.key;
  const old = oldKey ? shopDirectory().find((x) => x.key === oldKey) : null;
  const rec = old?.rec || shopRecords().find((r) => shopKey(r) === shopKey(b));
  S.put('config', { ...(rec || { id: `shop:${S.uid()}` }), name: b.name, kind: b.kind, link: b.link, note });
  if (old) {
    const nb = { kind: b.kind, name: b.name, link: b.link };
    for (const t of S.all('task')) if (hasBuy(t.buy) && shopKey(t.buy) === oldKey) S.put('task', { ...t, buy: nb });
    for (const l of S.all('log')) if (hasBuy(l.buy) && shopKey(l.buy) === oldKey) S.put('log', { ...l, buy: nb });
  }
  toast('Đã lưu nơi mua');
  shopDirSheet();
}

// ---------- Form chi tiêu ----------
function expenseForm(e = {}, scan = null) {
  const isNew = !e.id;
  const m = members();
  const by = e.by ?? me() ?? 'all';
  const items = e.items || [];
  const showItems = items.length > 0 || e.category === 'grocery';
  openSheet(`
  <form class="form" data-form="expense" data-id="${e.id || ''}" data-adjust="${scan ? (scan.fee || 0) + (scan.service || 0) + (scan.vat || 0) - (scan.discount || 0) : e.adjust || 0}">
    <h3>${isNew ? (scan ? 'Kiểm tra hóa đơn' : 'Ghi khoản chi') : 'Sửa khoản chi'}</h3>
    ${scan ? scanNote(scan) : isNew ? `<button type="button" class="btn scan-btn" data-act="scanMenu">📷 Quét bill hoặc ảnh đơn online để điền tự động</button>` : ''}
    <label>Khoản chi<input name="title" required value="${esc(e.title || '')}" placeholder="VD: Đi Co.opmart, mua xe SH…"></label>
    <div class="row2">
      <label>Số tiền<input name="amount" inputmode="decimal" value="${e.amount ? new Intl.NumberFormat('vi-VN').format(e.amount) : ''}" placeholder="VD: 579k, 95tr"></label>
      <label>Thời điểm<input name="at" type="datetime-local" value="${e.at || nowLocal()}"></label>
    </div>
    <div class="row2">
      <label>Nhóm<select name="category">${EXP_CATS.map((c) => `<option value="${c.id}" ${c.id === e.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select></label>
      <label>Thanh toán<select name="method">${METHODS.map((x) => `<option ${x === e.method ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
    <label>Nơi mua<input name="shop" list="expShopList" value="${esc(e.shop || '')}" placeholder="VD: Co.opmart Phú Thạnh, chợ Tân Hương" autocomplete="off"></label>
    <datalist id="expShopList">${expenseShops().map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>
    <div class="items-box" ${showItems ? '' : 'hidden'}>
      <div class="items-head"><b>🧾 Từng món</b><span class="hint" data-items-sum></span></div>
      <div class="item-rows">${items.map(itemRow).join('')}</div>
      <button type="button" class="btn ghost small" data-act="addItemRow">＋ Thêm món</button>
    </div>
    ${showItems ? '' : `<button type="button" class="btn ghost" data-act="showItems">🧾 Ghi từng món (đơn giá, số lượng)</button>`}
    <div class="label">Người chi</div>
    <div class="seg" data-seg="by">
      ${m.map((n, i) => `<button type="button" data-v="${i}" class="${String(by) === String(i) ? 'on' : ''}">${esc(n)}</button>`).join('')}
      <button type="button" data-v="all" class="${by === 'all' ? 'on' : ''}">Chung</button>
    </div>
    <input type="hidden" name="by" value="${by}">
    <label>Ghi chú<textarea name="note" rows="2" placeholder="Số hóa đơn, thời hạn bảo hành…">${esc(e.note || '')}</textarea></label>
    <div class="actions">
      <button type="button" class="btn" data-act="closeSheet">Hủy</button>
      <button type="submit" class="btn primary">${isNew ? 'Lưu' : 'Lưu thay đổi'}</button>
    </div>
    ${
      isNew
        ? ''
        : `<button type="button" class="btn" data-act="followUp" data-id="${e.id}">＋ Tạo nhắc kèm (bảo hành, bảo dưỡng…)</button>
           <button type="button" class="btn danger ghost" data-act="delExpense" data-id="${e.id}">Xóa khoản chi</button>`
    }
  </form>`);
  updateItemsSum($('#sheet form[data-form=expense]'));
}

function saveExpense(form) {
  const f = Object.fromEntries(new FormData(form));
  const items = readItems(form);
  const itemsSum = items.reduce((s, x) => s + x.amount, 0);
  const amount = f.amount.trim() ? parseMoney(f.amount) : itemsSum || null;
  if (!f.title.trim()) return toast('Nhập tên khoản chi');
  if (!amount) return toast('Số tiền chưa đúng (VD: 579k, 1.250.000)');
  const old = form.dataset.id ? S.get('expense', form.dataset.id) : null;
  const e = S.put('expense', {
    ...(old || {}),
    title: f.title.trim(),
    amount,
    at: f.at || nowLocal(),
    category: f.category,
    method: f.method,
    by: f.by === 'all' ? 'all' : Number(f.by),
    shop: (f.shop || '').trim(),
    items: items.length ? items : null,
    adjust: items.length ? Number(form.dataset.adjust) || 0 : 0,
    note: f.note.trim(),
  });
  expYear = Number(e.at.slice(0, 4));
  closeSheet();
  if (old) toast('Đã lưu');
  else if (items.length) toast(`Đã ghi ${money(amount)} · ${items.length} món`, 'Xem giá', () => priceBook());
  else toast(`Đã ghi ${money(amount)}`, 'Tạo nhắc kèm', () => followUp(e));
}

// ---------- Từng món trong khoản chi ----------
const fmtNum = (n) => (n == null || n === '' ? '' : new Intl.NumberFormat('vi-VN').format(Math.round(n)));
const fmtQty = (q) => String(q ?? 1).replace('.', ',');
const parseQty = (s) => {
  const n = parseFloat(String(s || '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function itemRow(i = {}) {
  return `<div class="item-row${i.check ? ' check' : ''}">
    <input name="iName" value="${esc(i.name || '')}" placeholder="Tên món" autocomplete="off">
    <div class="item-nums">
      <label>SL<input name="iQty" inputmode="decimal" value="${esc(fmtQty(i.qty))}" autocomplete="off"></label>
      <label>Đơn giá<input name="iPrice" inputmode="decimal" value="${fmtNum(i.price)}" autocomplete="off"></label>
      <label>Thành tiền<input name="iAmt" inputmode="decimal" value="${fmtNum(i.amount)}" autocomplete="off"></label>
      <button type="button" class="icon-btn small del" data-act="delItemRow" aria-label="Xóa món">×</button>
    </div>
  </div>`;
}

function readItems(form) {
  return [...form.querySelectorAll('.item-row')]
    .map((r) => {
      const v = (n) => r.querySelector(`[name=${n}]`).value;
      const name = v('iName').trim();
      const qty = parseQty(v('iQty')) || 1;
      const price = parseMoney(v('iPrice'));
      const amount = parseMoney(v('iAmt')) ?? (price != null ? Math.round(price * qty) : null);
      if (!name || !amount) return null;
      return { name, qty, price: price ?? Math.round(amount / qty), amount };
    })
    .filter(Boolean);
}

function updateItemsSum(form) {
  const el = form?.querySelector('[data-items-sum]');
  if (!el) return;
  const items = readItems(form);
  const sum = items.reduce((s, x) => s + x.amount, 0);
  const amount = parseMoney(form.elements.amount.value);
  // phần chênh đã biết: phí ship/phục vụ/VAT − giảm giá, voucher
  const adjust = Number(form.dataset.adjust) || 0;
  const gap = amount && sum ? amount - sum : 0;
  const known = gap !== 0 && gap === adjust;
  el.classList.toggle('warn', !!gap && !known);
  el.textContent = !items.length
    ? ''
    : `${items.length} món · ${money(sum)}${gap ? (known ? (gap < 0 ? ` · đã giảm ${money(-gap)}` : ` · + phí ${money(gap)}`) : ` · lệch ${money(Math.abs(gap))} so với Số tiền`) : ''}`;
}

// sửa SL hoặc đơn giá → tự tính thành tiền
function onItemInput(input) {
  const row = input.closest('.item-row');
  if (row && (input.name === 'iQty' || input.name === 'iPrice')) {
    const qty = parseQty(row.querySelector('[name=iQty]').value) || 1;
    const price = parseMoney(row.querySelector('[name=iPrice]').value);
    if (price != null) row.querySelector('[name=iAmt]').value = fmtNum(price * qty);
  }
  row?.classList.remove('check');
  updateItemsSum(input.form);
}

/** Tên nơi mua đã dùng ở các khoản chi trước + danh bạ nơi mua. */
function expenseShops() {
  const m = new Map();
  for (const e of S.all('expense')) if (e.shop) m.set(norm(e.shop), e.shop);
  for (const x of knownShops()) if (x.name) m.set(norm(x.name), x.name);
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'vi'));
}

// ---------- Quét hóa đơn (đọc chữ ngay trên máy; mã từ sakutara/chia-tien, xem tools/ocr) ----------
let scanAbort = null;

/** mode: camera (chụp bill giấy) · paper (chọn ảnh bill giấy) · screens (ảnh chụp màn hình app, chọn được nhiều ảnh) */
function startScan(mode = 'paper') {
  if (!localStorage.getItem('sonha:ocrReady') && !confirm('Lần đầu quét cần tải bộ đọc chữ khoảng 110 MB (nên dùng Wi-Fi). Từ lần sau quét nhanh hơn và không cần mạng. Tiếp tục?')) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (mode === 'camera') input.capture = 'environment';
  if (mode === 'screens') input.multiple = true;
  input.onchange = () => input.files.length && runScan([...input.files].slice(0, 6), mode === 'screens');
  input.click();
}

function scanMenu() {
  openSheet(`<div class="detail scan-menu">
    <h3>Ghi khoản chi từ ảnh</h3>
    <button class="scan-choice" data-act="scanCamera"><span class="big">📷</span><span><b>Chụp bill giấy</b><small>Siêu thị, chợ, nhà hàng, cửa hàng</small></span></button>
    <button class="scan-choice" data-act="scanScreens"><span class="big">📱</span><span><b>Ảnh chụp màn hình</b><small>Đơn Shopee, Lazada, TikTok Shop, ShopeeFood, Grab · biên lai MoMo, ZaloPay, ngân hàng. Đơn dài chọn được nhiều ảnh.</small></span></button>
    <button class="scan-choice" data-act="scanPaper"><span class="big">🖼️</span><span><b>Ảnh bill có sẵn</b><small>Chọn ảnh bill giấy trong thư viện</small></span></button>
  </div>`);
}

async function runScan(files, screenshot = false) {
  const ctrl = new AbortController();
  openSheet(`<div class="detail scan-sheet">
    <h3>${screenshot ? '📱 Đang đọc ảnh đơn hàng' : '📷 Đang đọc hóa đơn'}</h3>
    <div class="scan-prog"><i></i></div>
    <div class="hint" data-scan-stage>Đang tải phần mềm đọc chữ…</div>
    <div class="hint">${localStorage.getItem('sonha:ocrReady') ? `Thường mất 10–40 giây${files.length > 1 ? ' mỗi ảnh' : ''}.` : 'Lần đầu phải tải bộ đọc chữ khoảng 110 MB, nên dùng Wi-Fi.'} Ảnh chỉ xử lý trên máy này, không gửi đi đâu.</div>
    <button class="btn" data-act="closeSheet">Hủy quét</button>
  </div>`);
  scanAbort = ctrl;
  // tự báo lỗi nếu một bước đứng yên quá lâu (mạng rớt, máy thiếu bộ nhớ…)
  let stage = 'tải phần mềm đọc chữ (ocr.js)';
  let lastTick = Date.now();
  let stalled = false;
  const watchdog = setInterval(() => {
    if (Date.now() - lastTick > 90000) {
      stalled = true;
      ctrl.abort();
    }
  }, 3000);
  const progress = (p, text) => {
    lastTick = Date.now();
    stage = text.replace(/…$/, '');
    const bar = $('#sheet .scan-prog i');
    if (bar) bar.style.width = `${p}%`;
    const st = $('#sheet [data-scan-stage]');
    if (st) st.textContent = /MB/.test(text) ? stage : `${stage} · ${p}%`;
  };
  try {
    const ocr = await import('./ocr/ocr.js');
    if (ctrl.signal.aborted) throw new Error('aborted');
    progress(0, 'Đang mở ảnh…');
    const r = await ocr.scanReceipt(files, { screenshot, signal: ctrl.signal, onProgress: progress });
    if (ctrl.signal.aborted) throw new Error('aborted');
    clearInterval(watchdog);
    scanAbort = null;
    localStorage.setItem('sonha:ocrReady', '1');
    expenseForm(scanToExpense(r.summary), r.summary);
  } catch (err) {
    clearInterval(watchdog);
    if (ctrl.signal.aborted && !stalled) return; // người dùng bấm Hủy
    scanAbort = null;
    if (stalled) import('./ocr/ocr.js').then((m) => m.terminateOcrWorker()).catch(() => {});
    const detail = stalled
      ? `Đứng yên hơn 90 giây ở bước: ${stage}`
      : err?.detail || `${err?.name || 'Error'}: ${err?.message || err}`;
    scanFailed(files, screenshot, stalled ? 'Quét bị kẹt quá lâu.' : err?.code === 'OCR_FAILED' ? err.message : 'Không tải được bộ đọc chữ.', detail);
  }
}

function scanFailed(files, screenshot, message, detail) {
  const ua = navigator.userAgent.match(/(iPhone|iPad|Android)[^;)]*|OS \d+_\d+|Version\/[\d.]+|Chrome\/\d+|Safari\/[\d.]+/g)?.join(' ') || '';
  openSheet(`<div class="detail scan-sheet">
    <h3>😿 ${esc(message)}</h3>
    <div class="hint">Gợi ý: dùng Wi-Fi cho lần quét đầu (tải 110 MB), đóng bớt app khác để máy đủ bộ nhớ, rồi bấm Thử lại. Nếu vẫn lỗi, chụp màn hình này gửi lại để sửa.</div>
    <pre class="scan-err">${esc(detail)}\n${esc(ua)} · Sổ Nhà ${esc(APP_VERSION)}</pre>
    <button class="btn primary" data-act="scanRetry">Thử lại</button>
    <button class="btn" data-act="scanManual">Nhập tay</button>
  </div>`);
  lastScan = { files, screenshot };
}

let lastScan = null;

const titleCase = (s) =>
  s === s.toLocaleUpperCase('vi') ? s.toLocaleLowerCase('vi').replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toLocaleUpperCase('vi')) : s;

const shorten = (t, n = 42) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

/** Đoán nhóm chi từ tên người nhận / nội dung biên lai. */
function guessCategory(text, fallback = 'other') {
  const f = fold(text);
  if (/dien luc|evn|cap nuoc|sawaco|nuoc sach|internet|fpt telecom|vnpt|viettel|truyen hinh|chung cu|phi quan ly|gas/.test(f)) return 'home';
  if (/highlands|starbucks|phuc long|cafe|coffee|ca phe|tra sua|nha hang|quan an|com |pho |bun |lau|bbq|kfc|lotte ?ria|jollibee|pizza|food/.test(f)) return 'food';
  if (/co\.?op|bach hoa xanh|winmart|lotte mart|aeon|big ?c|go!|mm mega|emart|sieu thi|cho /.test(f)) return 'grocery';
  if (/grab|xanh ?sm|\bbe\b|vietjet|vietnam airlines|bamboo|agoda|traveloka|booking|khach san|hotel|petrolimex|xang/.test(f)) return 'travel';
  if (/nha thuoc|pharmacity|long chau|an khang|benh vien|phong kham|nha khoa|thu y/.test(f)) return 'health';
  return fallback;
}

function methodOf(pm, fallback) {
  const f = fold(pm || '');
  if (!f) return fallback;
  if (/khi nhan hang|cod|tien mat/.test(f)) return 'Tiền mặt';
  if (/chuyen khoan|ngan hang|banking|napas/.test(f)) return 'Chuyển khoản';
  if (/\bthe\b|visa|master|jcb|credit|tin dung|ghi no/.test(f)) return 'Thẻ';
  if (/pay|momo|vi |vi$|xu|viettel money/.test(f)) return 'Ví điện tử';
  return fallback;
}

function scanToExpense(s) {
  const at = s.date ? `${s.date}T${s.time || nowLocal().slice(11)}` : nowLocal();
  const items = s.items.map((i) => ({ name: i.name, qty: i.quantity, price: i.unitPrice, amount: i.amount, check: i.check }));
  if (s.kind === 'order') {
    const shop = [s.sourceName, s.vendor].filter(Boolean).join(' · ');
    const food = ['shopeefood', 'grab', 'be'].includes(s.source);
    const notes = [s.orderId && `Mã đơn ${s.orderId}`, s.fee && `Phí ship/phí ${money(s.fee)}`, s.discount && `Giảm giá, voucher ${money(s.discount)}`].filter(Boolean);
    return {
      title: items.length ? `${shorten(items[0].name)}${items.length > 1 ? ` +${items.length - 1} món` : ''}` : `Đơn ${s.sourceName}`,
      shop,
      amount: s.total,
      at,
      category: food ? 'food' : 'online',
      method: methodOf(s.paymentMethod, 'Ví điện tử'),
      items,
      note: notes.join(' · '),
    };
  }
  if (s.kind === 'payment') {
    const payee = s.vendor ? titleCase(s.vendor) : '';
    const transfer = s.source === 'bank' || /chuyen tien|chuyen khoan/.test(fold(s.content || ''));
    return {
      title: transfer ? s.content || (payee ? `Chuyển tiền cho ${payee}` : 'Chuyển tiền') : payee || s.content || `Thanh toán ${s.sourceName}`,
      shop: payee,
      amount: s.total,
      at,
      category: guessCategory(`${payee} ${s.content || ''}`),
      method: s.source === 'bank' ? 'Chuyển khoản' : 'Ví điện tử',
      note: [s.sourceName, transfer && payee && `Người nhận: ${payee}`, !transfer && s.content, s.orderId && `Mã GD ${s.orderId}`].filter(Boolean).join(' · '),
    };
  }
  const shop = s.vendor ? titleCase(s.vendor.trim()) : '';
  return {
    title: shop || 'Đi siêu thị',
    shop,
    amount: s.total,
    at,
    category: shop ? guessCategory(shop, 'grocery') : 'grocery',
    method: 'Thẻ',
    items,
  };
}

function scanNote(s) {
  const good = s.status === 'OK' || s.status === 'CORRECTED';
  const n = s.items.length;
  let msg;
  if (s.kind === 'payment') {
    msg = s.total ? `✓ Biên lai ${s.sourceName}: ${money(s.total)}${s.vendor ? ` → ${s.vendor}` : ''}. Kiểm tra rồi bấm Lưu.` : '⚠️ Không thấy số tiền trong ảnh — nhập tay nhé.';
  } else if (!n) {
    msg = s.kind === 'order' && s.total ? `ℹ️ Đơn ${s.sourceName}: ${money(s.total)}, chưa đọc được từng món — thêm tay nếu cần.` : '⚠️ Chưa đọc được món nào — nhập tay hoặc chụp lại rõ hơn.';
  } else {
    const what = s.kind === 'order' ? `Đơn ${s.sourceName}: ${n} món` : `Đọc được ${n} món`;
    msg = {
      OK: `✓ ${what}, tổng khớp${s.kind === 'order' ? ' (tiền hàng + phí − giảm giá)' : ' hóa đơn'}. Xem lại rồi bấm Lưu.`,
      CORRECTED: s.kind === 'order' ? `✓ ${what}, tổng khớp sau khi sửa vài số có ký hiệu ₫ bị đọc nhầm. Xem lại rồi bấm Lưu.` : `✓ ${what}, đã tự sửa vài số cho khớp tổng — xem lại dòng tô vàng.`,
      MISMATCH: `⚠️ ${what} nhưng tổng chưa khớp — so với ảnh và sửa dòng tô vàng.`,
      UNVERIFIED: `ℹ️ ${what}. Ảnh không có dòng tổng để đối chiếu — kiểm tra lại Số tiền.`,
    }[s.status];
  }
  const ok = s.kind === 'payment' ? !!s.total : good && n;
  return `<div class="scan-note ${ok ? 'ok' : 'warn'}"><b>${msg}</b>${
    s.notes.length ? `<details><summary>Chi tiết đối chiếu</summary>${s.notes.map((x) => `<div>${esc(x)}</div>`).join('')}</details>` : ''
  }</div>`;
}

// ---------- Giá từng món: tra giá qua các lần mua ----------
const fold = (s) =>
  String(s || '')
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

function priceIndex() {
  const groups = new Map();
  for (const e of S.all('expense')) {
    for (const it of e.items || []) {
      const key = fold(it.name);
      if (!key || !it.price) continue;
      if (!groups.has(key)) groups.set(key, { key, buys: [] });
      groups.get(key).buys.push({ name: it.name, day: (e.at || '').slice(0, 10), price: it.price, qty: it.qty, shop: e.shop || e.title, expId: e.id });
    }
  }
  return [...groups.values()]
    .map((g) => {
      g.buys.sort((a, b) => b.day.localeCompare(a.day));
      const prices = g.buys.map((b) => b.price);
      return { ...g, name: g.buys[0].name, last: g.buys[0], prev: g.buys[1], min: Math.min(...prices), max: Math.max(...prices) };
    })
    .sort((a, b) => b.last.day.localeCompare(a.last.day) || a.name.localeCompare(b.name, 'vi'));
}

const dayLabel = (d) => (d ? `${D.short(d)}/${d.slice(0, 4)}` : '');

function priceRows(q = '') {
  const k = fold(q);
  const list = priceIndex().filter((g) => !k || g.key.includes(k));
  if (!list.length) {
    return `<div class="hint">${k ? 'Không thấy món nào khớp.' : 'Chưa có món nào. Quét hóa đơn hoặc ghi từng món trong khoản chi, giá sẽ hiện ở đây.'}</div>`;
  }
  return list
    .map(
      (g) => `<details class="price-item">
      <summary>
        <div class="body"><div class="title">${esc(g.name)}</div><div class="meta"><span>${dayLabel(g.last.day)}</span><span>${esc(g.last.shop)}</span>${g.buys.length > 1 ? `<span>${g.buys.length} lần</span>` : ''}</div></div>
        <div class="amount">${money(g.last.price)}${g.prev ? chgBadge(pctChange(g.last.price, g.prev.price)) : ''}</div>
      </summary>
      ${g.buys.length > 1 ? `<div class="hint">Thấp nhất ${money(g.min)} · cao nhất ${money(g.max)}</div>` : ''}
      ${g.buys
        .map(
          (b) => `<div class="price-hist" data-act="editExpense" data-id="${esc(b.expId)}"><span>${dayLabel(b.day)}</span><span class="shop">${esc(b.shop)}</span><b>${b.qty && b.qty !== 1 ? `${esc(fmtQty(b.qty))} × ` : ''}${money(b.price)}</b></div>`
        )
        .join('')}
    </details>`
    )
    .join('');
}

function priceBook() {
  openSheet(`<div class="detail price-book">
    <h3>🏷️ Giá từng món</h3>
    <input name="priceQ" type="search" placeholder="Tìm món: sữa, gạo, cát mèo…" autocomplete="off">
    <div class="price-list">${priceRows()}</div>
  </div>`);
}

function followUp(e) {
  const cat = { car: 'car', health: 'health', home: 'home' }[e.category] || 'other';
  const isCar = e.category === 'car';
  taskForm(
    {},
    isCar
      ? { title: `Bảo hiểm ${e.title.replace(/^mua\s+/i, '')}`, icon: '🛡️', category: 'car', type: 'monthly', everyMonths: 12, nextDue: D.addMonths(e.at.slice(0, 10), 12), remindBefore: 14, trackAmount: true, note: `Từ khoản chi: ${e.title}` }
      : { title: `Hết bảo hành ${e.title.replace(/^mua\s+/i, '')}`, icon: '📄', category: cat, type: 'once', nextDue: D.addMonths(e.at.slice(0, 10), 12), remindBefore: 14, note: `Từ khoản chi: ${e.title} · ${money(e.amount)}` }
  );
}

// ---------- Hành động ----------
const actions = {
  tab: (d) => {
    tab = d.tab;
    localStorage.setItem('sonha:tab', tab);
    window.scrollTo(0, 0);
    render();
  },
  closeSheet,
  newTask: () => taskForm(),
  openTask: (d) => taskDetail(d.id),
  editTask: (d) => taskForm(S.get('task', d.id)),
  doneSheet: (d) => doneSheet(S.get('task', d.id)),
  quickDone: (d) => {
    const t = S.get('task', d.id);
    if (!t) return;
    if (t.trackAmount) doneSheet(t);
    else markDone(t);
  },
  delTask: (d) => {
    const t = S.get('task', d.id);
    if (!t || !confirm(`Xóa “${t.title}” và toàn bộ lịch sử?`)) return;
    S.all('log').filter((l) => l.taskId === d.id).forEach((l) => S.remove('log', l.id));
    S.remove('task', d.id);
    closeSheet();
    toast('Đã xóa');
  },
  delLog: (d) => {
    if (confirm('Xóa lần ghi này?')) S.remove('log', d.id);
  },
  template: (d, el) => applyTemplate(el.closest('form'), TEMPLATES[d.i]),
  filter: (d) => {
    taskFilter = d.f;
    render();
  },
  year: (d) => {
    if (!d.y) return;
    expYear = Number(d.y);
    render();
  },
  editExpense: (d) => expenseForm(S.get('expense', d.id)),
  delExpense: (d) => {
    if (!confirm('Xóa khoản chi này?')) return;
    S.remove('expense', d.id);
    closeSheet();
  },
  followUp: (d) => followUp(S.get('expense', d.id)),
  scanMenu: () => scanMenu(),
  scanCamera: () => startScan('camera'),
  scanPaper: () => startScan('paper'),
  scanScreens: () => startScan('screens'),
  scanRetry: () => lastScan && runScan(lastScan.files, lastScan.screenshot),
  scanManual: () => expenseForm({ category: lastScan?.screenshot ? 'online' : 'grocery' }),
  priceBook: () => priceBook(),
  addItemRow: (d, el) => {
    const box = el.closest('.items-box');
    box.querySelector('.item-rows').insertAdjacentHTML('beforeend', itemRow());
    box.querySelector('.item-row:last-child [name=iName]').focus();
  },
  delItemRow: (d, el) => {
    const form = el.closest('form');
    el.closest('.item-row').remove();
    updateItemsSum(form);
  },
  showItems: (d, el) => {
    const box = el.closest('form').querySelector('.items-box');
    box.hidden = false;
    el.remove();
    if (!box.querySelector('.item-row')) actions.addItemRow(d, box.querySelector('[data-act=addItemRow]'));
  },
  fab: () => (tab === 'expenses' ? expenseForm() : taskForm({}, tab === 'tasks' && subjFilter ? { subjects: [subjFilter] } : null)),
  subj: (d) => {
    subjFilter = subjFilter === d.id ? null : d.id;
    taskFilter = 'all';
    render();
  },
  newSubject: () => subjectForm(),
  enableCost: (d) => {
    taskForm({ ...S.get('task', d.id), trackAmount: true });
    setTimeout(() => {
      $('#sheet .cost-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('#sheet [name=buyItem]')?.focus();
    }, 300);
  },
  editLog: (d) => {
    const l = S.get('log', d.id);
    if (l) logForm(l);
  },
  subjGo: (d) => {
    subjFilter = d.id;
    taskFilter = 'all';
    actions.tab({ tab: 'tasks' });
  },
  ordered: (d) => {
    const t = S.get('task', d.id);
    if (!t) return;
    const prev = { ...t };
    S.put('task', { ...t, orderedFor: t.nextDue });
    toast('Đã đánh dấu đặt hàng', 'Hoàn tác', () => S.put('task', prev));
  },
  unordered: (d) => {
    const t = S.get('task', d.id);
    if (t) S.put('task', { ...t, orderedFor: null });
  },
  shopDir: () => shopDirSheet(),
  newShop: () => shopForm(),
  editShop: (d) => shopForm(shopDirectory().find((x) => x.key === d.key) || null),
  delShop: (d) => {
    if (!confirm('Xóa nơi mua này khỏi danh bạ? Lịch sử mua vẫn giữ nguyên.')) return;
    S.remove('config', d.id);
    shopDirSheet();
  },
  pickShop: (d, el) => {
    const form = el.closest('form');
    const on = form.elements.buyKind.value === d.v;
    form.elements.buyKind.value = on ? '' : d.v;
    form.querySelectorAll('.shop-pick .chip').forEach((c) => c.classList.toggle('on', !on && c === el));
    form.elements.buyLink.placeholder = shopOf(on ? '' : d.v)?.hint || 'Link, SĐT hoặc địa chỉ';
  },
  editSubject: (d) => subjectForm(subjOf(d.id) || {}),
  delSubject: (d) => {
    const p = subjOf(d.id);
    if (!p || !confirm(`Xóa “${p.name}” khỏi danh sách? Các việc vẫn giữ nguyên, chỉ bỏ gắn tên.`)) return;
    for (const t of S.all('task')) {
      if ((t.subjects || []).includes(p.id)) S.put('task', { ...t, subjects: t.subjects.filter((x) => x !== p.id) });
    }
    S.remove('config', p.id);
    if (subjFilter === p.id) subjFilter = null;
    closeSheet();
    toast('Đã xóa');
  },
  pickIcon: (d, el) => {
    const form = el.closest('form');
    form.elements.icon.value = d.v;
    form.querySelectorAll('.icon-pick button').forEach((b) => b.classList.toggle('on', b === el));
  },
  pickSubj: (d, el) => {
    const form = el.closest('form');
    const sel = selectedSubj(form);
    const on = sel.includes(d.id);
    if (on) form.dataset.subjOff = [form.dataset.subjOff || '', d.id].join(',');
    setSelectedSubj(form, on ? sel.filter((x) => x !== d.id) : [...sel, d.id]);
  },
  addSubjInline: (d, el) => {
    const box = el.closest('form').querySelector('.inline-add');
    box.hidden = !box.hidden;
    if (!box.hidden) box.querySelector('[name=newSubjName]').focus();
  },
  pickInlineIcon: (d, el) => {
    const form = el.closest('form');
    form.elements.newSubjIcon.value = d.v;
    form.querySelectorAll('.inline-add .icon-pick button').forEach((b) => b.classList.toggle('on', b === el));
  },
  saveSubjInline: (d, el) => {
    const form = el.closest('form');
    const name = form.elements.newSubjName.value.trim();
    if (!name) return toast('Nhập tên');
    const existing = subjects().find((p) => norm(p.name) === norm(name));
    const p = existing || createSubject(name, form.elements.newSubjIcon.value.trim()).p;
    setSelectedSubj(form, [...new Set([...selectedSubj(form), p.id])]);
    form.elements.newSubjName.value = '';
    form.elements.newSubjIcon.value = '';
    form.querySelector('.inline-add').hidden = true;
    toast(existing ? `Đã chọn ${name}` : `Đã thêm ${name}`);
  },
  setMe: async (d) => {
    S.saveDevice({ me: Number(d.i) });
    render();
    try {
      await refreshPushOwner();
    } catch {}
  },
  syncNow: () => S.sync(),
  resync: async () => {
    if (confirm('Tải lại toàn bộ dữ liệu từ máy chủ? (Thay đổi chưa gửi vẫn được giữ.)')) await S.resync();
  },
  export: () => {
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `so-nha-${D.today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  enablePush: async () => {
    try {
      await enablePush();
      toast('Đã bật thông báo');
    } catch (e) {
      alert(e.message);
    }
    updatePushState();
  },
  disablePush: async () => {
    await disablePush();
    updatePushState();
    toast('Đã tắt thông báo trên máy này');
  },
  testPush: async () => {
    try {
      const r = await S.api('/test-push', { user: me() });
      toast(r.sent ? `Đã gửi tới ${r.sent} máy` : 'Chưa có máy nào bật thông báo');
    } catch (e) {
      alert(e.message);
    }
  },
  remindNow: async () => {
    try {
      await S.sync();
      const r = await S.api('/remind-now', {});
      toast(r.tasks ? `Đã nhắc ${r.tasks} việc tới ${r.sent} máy` : 'Không có việc nào đến hạn');
    } catch (e) {
      alert(e.message);
    }
  },
};

document.addEventListener('click', (e) => {
  if (e.target.closest('a[href]')) return; // link Shopee/Zalo/bản đồ: để trình duyệt tự mở
  const el = e.target.closest('[data-act]');
  if (el) {
    e.preventDefault();
    actions[el.dataset.act]?.(el.dataset, el, e);
    return;
  }
  const seg = e.target.closest('[data-seg] button');
  if (seg) {
    e.preventDefault();
    setSeg(seg.closest('form'), seg.parentElement.dataset.seg, seg.dataset.v);
  }
});

document.addEventListener('input', (e) => {
  if (e.target.matches('[name=lunarDays], [name=lunarDay], [name=lunarMonth]')) updateLunarPreview(e.target.form);
  if (e.target.matches('form[data-form=task] [name=title]')) autoPickSubj(e.target.form);
  if (e.target.matches('form[data-form=done] [name=amount]')) updatePriceHint(e.target.form);
  if (e.target.matches('.item-row input')) onItemInput(e.target);
  if (e.target.matches('form[data-form=expense] [name=amount]')) updateItemsSum(e.target.form);
  if (e.target.matches('[name=priceQ]')) $('#sheet .price-list').innerHTML = priceRows(e.target.value);
  // chọn tên shop đã dùng → điền sẵn loại và link
  if (e.target.matches('[name=buyName]')) {
    const form = e.target.form;
    const k = knownShops().find((x) => x.name.normalize('NFC').toLowerCase() === e.target.value.trim().normalize('NFC').toLowerCase());
    if (k) {
      if (!form.elements.buyLink.value && k.link) form.elements.buyLink.value = k.link;
      if (!form.elements.buyKind.value && k.kind) {
        form.elements.buyKind.value = k.kind;
        form.querySelectorAll('.shop-pick .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === k.kind));
      }
    }
  }
});

// Enter trong ô thêm nhanh tên → thêm tên, không gửi cả form việc
document.addEventListener('keydown', (e) => {
  // Enter trong ô món → sang ô kế tiếp, không lưu vội
  if (e.key === 'Enter' && e.target.matches('.item-row input')) {
    e.preventDefault();
    const inputs = [...e.target.form.querySelectorAll('.item-row input')];
    inputs[inputs.indexOf(e.target) + 1]?.focus();
    return;
  }
  if (e.key === 'Enter' && e.target.matches('[name=newSubjName], [name=newSubjIcon]')) {
    e.preventDefault();
    actions.saveSubjInline({}, e.target);
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.matches('form[data-form=task] [name=trackAmount]')) e.target.form.dataset.cost = e.target.checked ? '1' : '0';
  if (e.target.matches('form[data-form=expense] [name=category]') && e.target.value === 'grocery') {
    const btn = e.target.form.querySelector('[data-act=showItems]');
    if (btn) actions.showItems({}, btn);
  }
  if (e.target.dataset.actChange === 'import') {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const n = S.importJSON(await file.text());
      toast(`Đã nhập ${n} bản ghi`);
    } catch (err) {
      alert(err.message);
    }
    e.target.value = '';
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  e.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'task') saveTask(form);
  else if (kind === 'expense') saveExpense(form);
  else if (kind === 'subject') saveSubject(form);
  else if (kind === 'shop') saveShop(form);
  else if (kind === 'log') {
    const l = S.get('log', form.dataset.id);
    if (!l) return closeSheet();
    const f = Object.fromEntries(new FormData(form));
    const amount = f.amount ? parseMoney(f.amount) : null;
    if (f.amount && amount == null) return toast('Số tiền chưa đúng');
    const buy = readBuy(form);
    S.put('log', { ...l, day: f.day || l.day, amount, note: (f.note || '').trim(), buy: buy || null });
    const t = S.get('task', l.taskId);
    if (t && amount && !t.trackAmount) S.put('task', { ...t, trackAmount: true, ...(buy && !hasBuy(t.buy) ? { buy } : {}) });
    toast('Đã lưu');
    taskDetail(l.taskId);
  }
  else if (kind === 'done') {
    const t = S.get('task', form.dataset.id);
    const f = Object.fromEntries(new FormData(form));
    const amount = f.amount !== undefined ? parseMoney(f.amount) : null;
    if (f.amount && amount == null) return toast('Số tiền chưa đúng');
    closeSheet();
    const buy = readBuy(form);
    // lần đầu nhập giá cho việc chưa bật ghi chi phí → tự bật để lần sau hỏi luôn
    const task = !t.trackAmount && (amount || buy) ? { ...t, trackAmount: true } : t;
    markDone(task, f.day || D.today(), amount, (f.note || '').trim(), buy);
  } else if (kind === 'members') {
    const f = Object.fromEntries(new FormData(form));
    S.put('config', { id: 'house', ...(S.get('config', 'house') || {}), members: [f.m0.trim() || 'Anh', f.m1.trim() || 'Em'] });
    document.activeElement?.blur();
    toast('Đã lưu tên');
  } else if (kind === 'connect') {
    const f = Object.fromEntries(new FormData(form));
    S.saveDevice({ api: f.api.trim(), key: f.key.trim() });
    document.activeElement?.blur();
    try {
      await S.api('/ping');
      await S.sync();
      toast('Kết nối thành công');
    } catch (err) {
      alert(err.message);
    }
    render();
  }
});

// ---------- Khởi động ----------
const ICON = {
  check: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

S.onChange(scheduleRender);
render();
S.sync();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    S.sync();
    render(); // sang ngày mới thì nhãn hạn đổi theo
  }
});
window.addEventListener('online', () => S.sync());
setInterval(() => document.visibilityState === 'visible' && S.sync(), 60000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
