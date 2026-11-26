// =====================================================================
//  Sổ Nhà — Cloudflare Worker
//  • Đồng bộ dữ liệu giữa các máy (lưu trong Cloudflare D1)
//  • Gửi thông báo đẩy (Web Push) tới iPhone / Android / máy tính
//  • Chạy theo lịch (Cron) mỗi giờ để nhắc việc đến hạn
//
//  Cần cấu hình trên Cloudflare (xem README):
//    - Binding D1 tên  DB
//    - (Không bắt buộc) Secret HOUSE_KEY — nếu đặt thì app phải nhập đúng mã nhà
//    - Cron Trigger    0 * * * *
//  Không cần tạo khóa VAPID: Worker tự tạo lần đầu và lưu vào D1.
// =====================================================================

const VAPID_SUBJECT = 'mailto:sonha@fiddle.vn'; // email liên hệ cho dịch vụ push, đổi nếu muốn
const TZ_OFFSET_HOURS = 7; // giờ Việt Nam
const KINDS = new Set(['task', 'log', 'expense', 'config']);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
    try {
      await ensureSchema(env);
      const url = new URL(request.url);
      if (url.pathname === '/' && request.method === 'GET') {
        return json({ app: 'Sổ Nhà API', ok: true, configured: !!env.DB, houseKey: !!env.HOUSE_KEY });
      }
      // Mã nhà là tùy chọn: chỉ kiểm tra khi đã đặt secret HOUSE_KEY
      if (env.HOUSE_KEY && !safeEqual(request.headers.get('X-House-Key') || '', env.HOUSE_KEY)) {
        return json({ error: 'Sai mã nhà' }, 401);
      }

      const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /ping':
          return json({ ok: true, time: Date.now() });
        case 'POST /sync':
          return json(await handleSync(env, body));
        case 'GET /vapid':
          return json({ publicKey: (await getVapid(env)).pub });
        case 'POST /subscribe':
          return json(await handleSubscribe(env, body));
        case 'POST /unsubscribe':
          await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(String(body.endpoint || '')).run();
          return json({ ok: true });
        case 'POST /test-push':
          return json(await testPush(env, body));
        case 'POST /remind-now':
          return json(await runReminders(env, { force: true }));
        default:
          return json({ error: 'Không tìm thấy' }, 404);
      }
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    await ensureSchema(env);
    ctx.waitUntil(runReminders(env));
  },
};

// ---------------------------------------------------------------------
//  Tiện ích
// ---------------------------------------------------------------------
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-House-Key',
    'Access-Control-Max-Age': '86400',
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors() },
  });
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  if (!env.DB) throw new Error('Chưa gắn D1 database với tên biến DB');
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS items (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_ts INTEGER NOT NULL, PRIMARY KEY (kind, id))'
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_items_ts ON items (server_ts)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, user TEXT, data TEXT NOT NULL, label TEXT, created INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS notified (task_id TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (task_id, day))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)'),
  ]);
  schemaReady = true;
}

// ---------------------------------------------------------------------
//  Đồng bộ: bản ghi nào có updated_at mới hơn thì thắng
// ---------------------------------------------------------------------
async function handleSync(env, { since = 0, changes = [] }) {
  const now = Date.now();
  const valid = (Array.isArray(changes) ? changes : []).filter(
    (c) => c && KINDS.has(c.kind) && typeof c.id === 'string' && c.id.length <= 64 && Number.isFinite(c.updated_at)
  );
  if (valid.length) {
    const stmt = env.DB.prepare(
      `INSERT INTO items (kind, id, data, updated_at, deleted, server_ts) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
         deleted = excluded.deleted, server_ts = excluded.server_ts
       WHERE excluded.updated_at >= items.updated_at`
    );
    const stmts = valid.map((c) =>
      stmt.bind(c.kind, c.id, c.deleted ? null : JSON.stringify(c.data ?? null), Math.floor(c.updated_at), c.deleted ? 1 : 0, now)
    );
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  }
  // lùi 10 giây để không sót bản ghi ghi cùng lúc
  const from = Math.max(0, Number(since) - 10000);
  const { results } = await env.DB.prepare('SELECT kind, id, data, updated_at, deleted FROM items WHERE server_ts > ?').bind(from).all();
  return {
    now,
    items: results.map((r) => ({ kind: r.kind, id: r.id, data: r.data ? JSON.parse(r.data) : null, updated_at: r.updated_at, deleted: r.deleted })),
  };
}

async function handleSubscribe(env, { subscription, user, label }) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) throw new Error('Đăng ký thông báo không hợp lệ');
  const u = user === null || user === undefined ? null : String(user);
  await env.DB.prepare(
    `INSERT INTO subs (endpoint, user, data, label, created) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (endpoint) DO UPDATE SET user = excluded.user, data = excluded.data, label = COALESCE(excluded.label, subs.label)`
  )
    .bind(subscription.endpoint, u, JSON.stringify(subscription), label || null, Date.now())
    .run();
  return { ok: true };
}

// ---------------------------------------------------------------------
//  Nhắc việc
// ---------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
function vnNow() {
  const d = new Date(Date.now() + TZ_OFFSET_HOURS * 3600000);
  return { day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, hour: d.getUTCHours() };
}
const toUTC = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = new Date(toUTC(s) + n * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);

function dueText(task, today) {
  const n = diffDays(today, task.nextDue);
  if (n < 0) return `quá hạn ${-n} ngày`;
  if (n === 0) return 'hôm nay';
  if (n === 1) return 'ngày mai';
  const [, m, d] = task.nextDue.split('-');
  return `còn ${n} ngày (${d}/${m})`;
}

async function loadTasks(env) {
  const { results } = await env.DB.prepare("SELECT data FROM items WHERE kind = 'task' AND deleted = 0").all();
  return results.map((r) => JSON.parse(r.data)).filter(Boolean);
}
async function loadSubs(env) {
  const { results } = await env.DB.prepare('SELECT endpoint, user, data FROM subs').all();
  return results.map((r) => ({ endpoint: r.endpoint, user: r.user, sub: JSON.parse(r.data) }));
}

const isDue = (t, today) => !t.finished && t.nextDue && addDays(t.nextDue, -(Number(t.remindBefore) || 0)) <= today;
const forUser = (t, user) => t.assignee === 'all' || t.assignee === undefined || t.assignee === null || String(t.assignee) === String(user) || user === null;

async function runReminders(env, { force = false } = {}) {
  const { day, hour } = vnNow();
  const tasks = await loadTasks(env);
  // Nhắc từ giờ đã chọn trở đi: nếu Cron lỡ một lượt thì lượt sau vẫn nhắc.
  // Bảng `notified` đảm bảo mỗi việc chỉ nhắc một lần mỗi ngày.
  let due = tasks.filter((t) => isDue(t, day) && (force || hour >= Number(t.remindHour ?? 8)));

  if (!force && due.length) {
    const { results } = await env.DB.prepare('SELECT task_id FROM notified WHERE day = ?').bind(day).all();
    const done = new Set(results.map((r) => r.task_id));
    due = due.filter((t) => !done.has(t.id));
  }
  if (!due.length) return { tasks: 0, sent: 0 };

  const allDueToday = tasks.filter((t) => !t.finished && t.nextDue && t.nextDue <= day);
  const subs = await loadSubs(env);
  let sent = 0;
  for (const s of subs) {
    const mine = due.filter((t) => forUser(t, s.user)).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    if (!mine.length) continue;
    const badge = allDueToday.filter((t) => forUser(t, s.user)).length;
    const payload =
      mine.length === 1
        ? { title: `${mine[0].icon || '🔔'} ${mine[0].title}`, body: `Đến hạn ${dueText(mine[0], day)}${mine[0].note ? ' · ' + mine[0].note : ''}` }
        : { title: `Sổ Nhà · ${mine.length} việc cần làm`, body: mine.map((t) => `${t.icon || '•'} ${t.title} — ${dueText(t, day)}`).join('\n') };
    if (await deliver(env, s, { ...payload, tag: `sonha-${day}-${hour}`, url: './', badge })) sent++;
  }

  if (!force) {
    const stmt = env.DB.prepare('INSERT OR IGNORE INTO notified (task_id, day) VALUES (?, ?)');
    await env.DB.batch([...due.map((t) => stmt.bind(t.id, day)), env.DB.prepare('DELETE FROM notified WHERE day < ?').bind(addDays(day, -30))]);
  }
  return { tasks: due.length, sent };
}

async function testPush(env, { user }) {
  const subs = await loadSubs(env);
  const targets = user === null || user === undefined ? subs : subs.filter((s) => String(s.user) === String(user));
  let sent = 0;
  for (const s of targets) {
    if (await deliver(env, s, { title: '🔔 Sổ Nhà', body: 'Thông báo thử — máy này đã sẵn sàng nhận nhắc việc.', tag: 'sonha-test', url: './' })) sent++;
  }
  return { sent, devices: targets.length };
}

async function deliver(env, s, payload) {
  try {
    const res = await sendWebPush(env, s.sub, JSON.stringify(payload));
    if (res.status === 404 || res.status === 410) {
      await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(s.endpoint).run();
      return false;
    }
    return res.ok;
  } catch (e) {
    console.log('push error', e.message);
    return false;
  }
}

// ---------------------------------------------------------------------
//  Web Push (RFC 8291 mã hóa aes128gcm + RFC 8292 VAPID), chỉ dùng WebCrypto
// ---------------------------------------------------------------------
const te = new TextEncoder();
function b64u(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

async function getVapid(env) {
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'vapid'").first();
  if (row) return JSON.parse(row.v);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('vapid', ?)").bind(JSON.stringify({ jwk, pub })).run();
  const saved = await env.DB.prepare("SELECT v FROM meta WHERE k = 'vapid'").first();
  return JSON.parse(saved.v);
}

async function vapidHeader(endpoint, vapid) {
  const aud = new URL(endpoint).origin;
  const head = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT })));
  const { key_ops, ext, ...jwk } = vapid.jwk;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapid.pub}`;
}

async function encryptPayload(subscription, payload) {
  const uaPublic = unb64u(subscription.keys.p256dh);
  const authSecret = unb64u(subscription.keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(te.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(te.encode(payload), new Uint8Array([2])))
  );
  const header = new Uint8Array(86);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = 65;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

async function sendWebPush(env, subscription, payload) {
  const vapid = await getVapid(env);
  const body = await encryptPayload(subscription, payload);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  });
}
