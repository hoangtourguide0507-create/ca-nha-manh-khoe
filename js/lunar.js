// Âm lịch Việt Nam (múi giờ UTC+7), theo thuật toán của Hồ Ngọc Đức.
// Chỉ đổi dương → âm; tìm ngày âm kế tiếp bằng cách dò từng ngày.

const TZ = 7;
const PI = Math.PI;
const INT = Math.floor;

function jdFromDate(dd, mm, yy) {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}

function newMoon(k) {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd1 + C1 - deltat;
}

const newMoonDay = (k) => INT(newMoon(k) + 0.5 + TZ / 24);

function sunLongitude(jdn) {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= PI * 2 * INT(L / (PI * 2));
  return L;
}
const sunLongitudeSector = (dayNumber) => INT((sunLongitude(dayNumber - 0.5 - TZ / 24) / PI) * 6);

function lunarMonth11(yy) {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = newMoonDay(k);
  if (sunLongitudeSector(nm) >= 9) nm = newMoonDay(k - 1);
  return nm;
}

function leapMonthOffset(a11) {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last;
  let i = 1;
  let arc = sunLongitudeSector(newMoonDay(k + i));
  do {
    last = arc;
    i++;
    arc = sunLongitudeSector(newMoonDay(k + i));
  } while (arc !== last && i < 14);
  return i - 1;
}

const cache = new Map();

/** 'YYYY-MM-DD' (dương) → { day, month, year, leap, monthDays } (âm). */
export function toLunar(s) {
  if (cache.has(s)) return cache.get(s);
  const [yy, mm, dd] = s.split('-').map(Number);
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = newMoonDay(k + 1);
  let nextStart = newMoonDay(k + 2);
  if (monthStart > dayNumber) {
    nextStart = monthStart;
    monthStart = newMoonDay(k);
  }
  let a11 = lunarMonth11(yy);
  let b11 = a11;
  let year;
  if (a11 >= monthStart) {
    year = yy;
    a11 = lunarMonth11(yy - 1);
  } else {
    year = yy + 1;
    b11 = lunarMonth11(yy + 1);
  }
  const day = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let leap = false;
  let month = diff + 11;
  if (b11 - a11 > 365) {
    const leapDiff = leapMonthOffset(a11);
    if (diff >= leapDiff) {
      month = diff + 10;
      if (diff === leapDiff) leap = true;
    }
  }
  if (month > 12) month -= 12;
  if (month >= 11 && diff < 4) year -= 1;
  const r = { day, month, year, leap, monthDays: nextStart - monthStart };
  if (cache.size > 2000) cache.clear();
  cache.set(s, r);
  return r;
}

const pad = (n) => String(n).padStart(2, '0');
function addDay(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Ngày âm có khớp không. Tháng thiếu (29 ngày) thì "ngày 30" tính là ngày 29. */
function matchDay(l, want) {
  return l.day === want || (want === 30 && l.monthDays === 29 && l.day === 29);
}

/**
 * Ngày dương gần nhất (>= from) rơi vào ngày âm cần tìm.
 *   mode 'monthly': days = [1, 15]… mỗi tháng âm (kể cả tháng nhuận)
 *   mode 'yearly' : day + month, mỗi năm âm (bỏ qua tháng nhuận, như lệ cúng giỗ)
 */
export function nextLunar({ mode, days, day, month }, from) {
  let s = from;
  for (let i = 0; i < 420; i++, s = addDay(s, 1)) {
    const l = toLunar(s);
    if (mode === 'yearly') {
      if (!l.leap && l.month === month && matchDay(l, day)) return s;
    } else if ((days || []).some((d) => matchDay(l, d))) {
      return s;
    }
  }
  return null;
}

export function dayName(d) {
  if (d === 1) return 'Mùng 1';
  if (d === 15) return 'Rằm';
  return d <= 10 ? `Mùng ${d}` : `Ngày ${d}`;
}

/** "7/10 âm", "15/7N âm" (N = tháng nhuận). */
export function lunarShort(s) {
  if (!s) return '';
  const l = toLunar(s);
  return `${l.day}/${l.month}${l.leap ? 'N' : ''} âm`;
}
