// Tính ngày đến hạn. Mọi ngày lưu dạng chuỗi 'YYYY-MM-DD' theo giờ địa phương.
//
// 3 kiểu lặp:
//   interval : lặp sau N ngày kể từ lần làm gần nhất (thay cát mèo, tưới cây…)
//   monthly  : lặp theo lịch cố định, mỗi M tháng vào ngày D (tiền điện ngày 5,
//              bảo hiểm xe mỗi 12 tháng…). Trả trễ không làm lệch lịch tháng sau.
//   once     : một lần duy nhất (hết bảo hành, hẹn lịch…)

const pad = (n) => String(n).padStart(2, '0');
export const fmt = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function today(date = new Date()) {
  return fmt(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

const toUTC = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUTC = (t) => {
  const d = new Date(t);
  return fmt(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

export const addDays = (s, n) => fromUTC(toUTC(s) + n * 86400000);
/** Số ngày từ a đến b (b - a). */
export const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Cộng n tháng, giữ "ngày gốc" (ngày 31 → 28/2 → 31/3). */
export function addMonths(s, n, anchorDay) {
  let [y, m, d] = s.split('-').map(Number);
  const day = anchorDay || d;
  const idx = y * 12 + (m - 1) + n;
  y = Math.floor(idx / 12);
  m = (idx % 12) + 1;
  return fmt(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Lần gần nhất (>= hôm nay) rơi vào ngày `day` trong tháng. */
export function nextDayOfMonth(day, from = today()) {
  const [y, m] = from.split('-').map(Number);
  let c = fmt(y, m, Math.min(day, daysInMonth(y, m)));
  if (c < from) c = addMonths(c, 1, day);
  return c;
}

/** Trạng thái mới của việc sau khi đánh dấu xong vào ngày doneDay. */
export function afterDone(task, doneDay) {
  if (task.type === 'interval') {
    return { lastDone: doneDay, nextDue: addDays(doneDay, Math.max(1, task.everyDays || 1)) };
  }
  if (task.type === 'monthly') {
    const base = task.nextDue || doneDay;
    return { lastDone: doneDay, nextDue: addMonths(base, Math.max(1, task.everyMonths || 1), task.anchorDay) };
  }
  return { lastDone: doneDay, nextDue: null, finished: true };
}

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export function weekday(s) {
  return WD[new Date(toUTC(s)).getUTCDay()];
}
export function short(s) {
  if (!s) return '';
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}
export function long(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${weekday(s)}, ${d}/${m}/${y}`;
}

/** Nhãn hạn: "Quá hạn 2 ngày", "Hôm nay", "Ngày mai", "Còn 5 ngày · 01/12". */
export function dueLabel(nextDue, t = today()) {
  if (!nextDue) return 'Đã xong';
  const n = diffDays(t, nextDue);
  if (n < 0) return `Quá hạn ${-n} ngày`;
  if (n === 0) return 'Hôm nay';
  if (n === 1) return 'Ngày mai';
  return `Còn ${n} ngày · ${short(nextDue)}`;
}

export function dueState(task, t = today()) {
  if (task.finished || !task.nextDue) return 'finished';
  const n = diffDays(t, task.nextDue);
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n <= Math.max(7, task.remindBefore || 0)) return 'soon';
  return 'later';
}

export function recurLabel(task) {
  if (task.type === 'interval') return `Mỗi ${task.everyDays} ngày`;
  if (task.type === 'monthly') {
    const m = task.everyMonths || 1;
    if (m === 1) return `Ngày ${task.anchorDay} hằng tháng`;
    if (m === 12) return `Hằng năm · ${short(task.nextDue)}`;
    return `Ngày ${task.anchorDay} · mỗi ${m} tháng`;
  }
  return 'Một lần';
}
