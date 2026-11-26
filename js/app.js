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
const EXP_CATS = [
  { id: 'car', name: 'Xe cộ', icon: '🚗' },
  { id: 'luxury', name: 'Đồ hiệu', icon: '👜' },
  { id: 'tech', name: 'Điện máy', icon: '📱' },
  { id: 'home', name: 'Nhà cửa', icon: '🛋️' },
  { id: 'travel', name: 'Du lịch', icon: '✈️' },
  { id: 'health', name: 'Sức khỏe', icon: '🩺' },
  { id: 'other', name: 'Khác', icon: '💰' },
];
const METHODS = ['Chuyển khoản', 'Thẻ', 'Tiền mặt', 'Trả góp', 'Khác'];

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
  { title: 'Tẩy giun cho mèo', icon: '🪱', category: 'pet', type: 'interval', everyDays: 90 },
  { title: 'Tiêm phòng cho mèo', icon: '💉', category: 'pet', type: 'interval', everyDays: 365 },
  { title: 'Thay lõi lọc nước', icon: '🚰', category: 'home', type: 'interval', everyDays: 180 },
  { title: 'Bảo dưỡng xe', icon: '🔧', category: 'car', type: 'interval', everyDays: 180, trackAmount: true },
  { title: 'Bảo hiểm xe', icon: '🛡️', category: 'car', type: 'monthly', everyMonths: 12, trackAmount: true, remindBefore: 7 },
];

const catOf = (id, list = CATS) => list.find((c) => c.id === id) || list[list.length - 1];

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
        }</div></div><button class="btn small" data-act="editSubject" data-id="${esc(subj.id)}">Sửa</button></div>`
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
  const years = [...new Set([new Date().getFullYear(), ...all.map((e) => Number((e.at || '').slice(0, 4)))])].filter(Boolean).sort();
  const list = all.filter((e) => (e.at || '').startsWith(String(expYear))).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const total = list.reduce((s, e) => s + (e.amount || 0), 0);
  const byCat = EXP_CATS.map((c) => ({ c, sum: list.filter((e) => (e.category || 'other') === c.id).reduce((s, e) => s + (e.amount || 0), 0) }))
    .filter((x) => x.sum > 0)
    .sort((a, b) => b.sum - a.sum);
  const max = Math.max(1, ...byCat.map((x) => x.sum));

  const months = {};
  for (const e of list) (months[(e.at || '').slice(0, 7)] ||= []).push(e);

  const idx = years.indexOf(expYear);
  return `
  <header class="top"><div><div class="eyebrow">Khoản chi lớn</div><h1>Chi tiêu</h1></div>${syncBadge()}</header>
  <div class="card total">
    <div class="year">
      <button class="icon-btn" data-act="year" data-y="${years[idx - 1] ?? ''}" ${idx > 0 ? '' : 'disabled'}>‹</button>
      <span>Năm ${expYear}</span>
      <button class="icon-btn" data-act="year" data-y="${years[idx + 1] ?? ''}" ${idx < years.length - 1 ? '' : 'disabled'}>›</button>
    </div>
    <div class="sum">${money(total) || '0 đ'}</div>
    <div class="sub">${list.length} khoản chi</div>
    ${byCat
      .map(
        (x) => `<div class="bar"><span>${x.c.icon} ${x.c.name}</span><div class="track"><i style="width:${(x.sum / max) * 100}%"></i></div><b>${money(x.sum)}</b></div>`
      )
      .join('')}
  </div>
  ${Object.entries(months)
    .map(
      ([ym, es]) => `<section><h2>Tháng ${Number(ym.slice(5))}<span class="count">${money(es.reduce((s, e) => s + (e.amount || 0), 0))}</span></h2>
      ${es
        .map(
          (e) => `<div class="card task" data-act="editExpense" data-id="${e.id}">
          <div class="ico" data-cat="${esc(e.category || 'other')}">${catOf(e.category, EXP_CATS).icon}</div>
          <div class="body"><div class="title">${esc(e.title)}</div><div class="meta"><span>${fmtDateTime(e.at)}</span>${e.method ? `<span>${esc(e.method)}</span>` : ''}<span>${esc(who(e.by))}</span></div></div>
          <div class="amount">${money(e.amount)}</div></div>`
        )
        .join('')}</section>`
    )
    .join('')}
  ${!list.length ? `<div class="empty"><div class="big">👜</div><div>Chưa có khoản chi lớn nào trong năm ${expYear}.</div></div>` : ''}`;
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
          return `<div class="prow" data-act="editSubject" data-id="${esc(p.id)}"><span class="av">${esc(p.icon)}</span><b>${esc(p.name)}</b><span class="hint">${n} việc</span><span class="chev">›</span></div>`;
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

  <section><h2>Dữ liệu</h2>
  <div class="card form">
    <div class="row2">
      <button class="btn" data-act="syncNow">Đồng bộ ngay</button>
      <button class="btn" data-act="export">Xuất sao lưu</button>
    </div>
    <label class="btn file">Nhập từ file sao lưu<input type="file" accept="application/json,.json" data-act-change="import" hidden></label>
    <button class="btn ghost" data-act="resync">Tải lại toàn bộ từ máy chủ</button>
  </div></section>
  <p class="foot">Sổ Nhà · v1.4 · 🧡</p>`;
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
  <form class="form" data-form="task" data-type="${t.type}" data-lunar="${t.lunarMode}" data-id="${t.id || ''}">
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

    <label class="check"><input type="checkbox" name="trackAmount" ${t.trackAmount ? 'checked' : ''}> Ghi số tiền mỗi lần xong (hóa đơn)</label>
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
function markDone(task, day = D.today(), amount = null, note = '') {
  const prev = { ...task };
  const log = S.put('log', {
    taskId: task.id,
    day,
    doneAt: day === D.today() ? new Date().toISOString() : `${day}T12:00:00`,
    by: me(),
    amount,
    note,
  });
  const next = D.afterDone(task, day);
  S.put('task', { ...task, ...next });
  const msg = next.finished ? `Xong “${task.title}”` : `Xong · lần tới ${D.short(next.nextDue)}`;
  toast(msg, 'Hoàn tác', () => {
    S.remove('log', log.id);
    S.put('task', prev);
  });
}

function doneSheet(task) {
  openSheet(`
  <form class="form" data-form="done" data-id="${task.id}">
    <h3>${esc(task.icon || catOf(task.category).icon)} ${esc(task.title)}</h3>
    <label>Ngày làm<input name="day" type="date" value="${D.today()}" max="${D.today()}"></label>
    ${task.trackAmount ? `<label>Số tiền<input name="amount" inputmode="decimal" placeholder="VD: 850k hoặc 1tr2" autocomplete="off"></label>` : ''}
    <label>Ghi chú<input name="note" placeholder="Không bắt buộc"></label>
    <div class="actions">
      <button type="button" class="btn" data-act="closeSheet">Hủy</button>
      <button type="submit" class="btn primary">Đánh dấu xong</button>
    </div>
  </form>`);
  setTimeout(() => $('#sheet [name=amount]')?.focus(), 250);
}

function taskDetail(id) {
  const render = () => {
    const t = S.get('task', id);
    if (!t) return closeSheet();
    const logs = S.all('log').filter((l) => l.taskId === id).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    const amounts = logs.filter((l) => l.amount).slice(0, 12).reverse();
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
      <div class="label">Lịch sử (${logs.length})</div>
      <div class="history">${
        logs
          .slice(0, 50)
          .map(
            (l) => `<div class="hrow"><span>${D.weekday(l.day)} ${D.short(l.day)}/${l.day.slice(0, 4)}</span><span>${esc(who(l.by))}</span><b>${money(l.amount)}</b>
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

// ---------- Form chi tiêu ----------
function expenseForm(e = {}) {
  const isNew = !e.id;
  const m = members();
  const by = e.by ?? me() ?? 'all';
  openSheet(`
  <form class="form" data-form="expense" data-id="${e.id || ''}">
    <h3>${isNew ? 'Ghi khoản chi lớn' : 'Sửa khoản chi'}</h3>
    <label>Khoản chi<input name="title" required value="${esc(e.title || '')}" placeholder="VD: Mua xe SH, túi LV Neverfull…"></label>
    <div class="row2">
      <label>Số tiền<input name="amount" inputmode="decimal" required value="${e.amount ? new Intl.NumberFormat('vi-VN').format(e.amount) : ''}" placeholder="VD: 95tr, 1tỷ2"></label>
      <label>Thời điểm<input name="at" type="datetime-local" value="${e.at || nowLocal()}"></label>
    </div>
    <div class="row2">
      <label>Nhóm<select name="category">${EXP_CATS.map((c) => `<option value="${c.id}" ${c.id === e.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select></label>
      <label>Thanh toán<select name="method">${METHODS.map((x) => `<option ${x === e.method ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
    <div class="label">Người chi</div>
    <div class="seg" data-seg="by">
      ${m.map((n, i) => `<button type="button" data-v="${i}" class="${String(by) === String(i) ? 'on' : ''}">${esc(n)}</button>`).join('')}
      <button type="button" data-v="all" class="${by === 'all' ? 'on' : ''}">Chung</button>
    </div>
    <input type="hidden" name="by" value="${by}">
    <label>Ghi chú<textarea name="note" rows="2" placeholder="Nơi mua, số hóa đơn, thời hạn bảo hành…">${esc(e.note || '')}</textarea></label>
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
}

function saveExpense(form) {
  const f = Object.fromEntries(new FormData(form));
  const amount = parseMoney(f.amount);
  if (!f.title.trim()) return toast('Nhập tên khoản chi');
  if (!amount) return toast('Số tiền chưa đúng (VD: 95tr, 1.250.000)');
  const old = form.dataset.id ? S.get('expense', form.dataset.id) : null;
  const e = S.put('expense', {
    ...(old || {}),
    title: f.title.trim(),
    amount,
    at: f.at || nowLocal(),
    category: f.category,
    method: f.method,
    by: f.by === 'all' ? 'all' : Number(f.by),
    note: f.note.trim(),
  });
  expYear = Number(e.at.slice(0, 4));
  closeSheet();
  if (old) toast('Đã lưu');
  else toast(`Đã ghi ${money(amount)}`, 'Tạo nhắc kèm', () => followUp(e));
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
  fab: () => (tab === 'expenses' ? expenseForm() : taskForm({}, tab === 'tasks' && subjFilter ? { subjects: [subjFilter] } : null)),
  subj: (d) => {
    subjFilter = subjFilter === d.id ? null : d.id;
    taskFilter = 'all';
    render();
  },
  newSubject: () => subjectForm(),
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
});

// Enter trong ô thêm nhanh tên → thêm tên, không gửi cả form việc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[name=newSubjName], [name=newSubjIcon]')) {
    e.preventDefault();
    actions.saveSubjInline({}, e.target);
  }
});

document.addEventListener('change', async (e) => {
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
  else if (kind === 'done') {
    const t = S.get('task', form.dataset.id);
    const f = Object.fromEntries(new FormData(form));
    const amount = f.amount !== undefined ? parseMoney(f.amount) : null;
    if (f.amount && amount == null) return toast('Số tiền chưa đúng');
    closeSheet();
    markDone(t, f.day || D.today(), amount, (f.note || '').trim());
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
