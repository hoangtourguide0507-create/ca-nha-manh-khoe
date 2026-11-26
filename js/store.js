// Lưu dữ liệu trên máy (localStorage) + đồng bộ với Cloudflare Worker.
// Mỗi bản ghi có updatedAt; khi hai máy cùng sửa, bản sửa sau cùng thắng.
// Thay đổi khi mất mạng được giữ trong "outbox" và gửi lại khi có mạng.

const DATA_KEY = 'sonha:data:v1';
const DEVICE_KEY = 'sonha:device:v1';
const KINDS = ['task', 'log', 'expense', 'config'];

function blank() {
  return { items: Object.fromEntries(KINDS.map((k) => [k, {}])), outbox: {}, cursor: 0, lastSync: 0 };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(DATA_KEY));
    if (s && s.items) {
      for (const k of KINDS) s.items[k] ||= {};
      s.outbox ||= {};
      return s;
    }
  } catch {}
  return blank();
}

// Địa chỉ Worker của nhà mình, điền sẵn để không phải nhập trên từng máy.
export const DEFAULT_API = 'https://so-nha-api.hoangtourguide0507.workers.dev';

let state = load();
export const device = (() => {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(DEVICE_KEY)) || {};
  } catch {}
  const d = { api: '', key: '', me: null, ...saved };
  if (!d.api) d.api = DEFAULT_API; // máy cũ chưa nhập hoặc để trống → dùng địa chỉ mặc định
  return d;
})();

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

let status = { state: 'idle', message: '' };
export const syncStatus = () => ({ ...status, pending: Object.keys(state.outbox).length, lastSync: state.lastSync });
function setStatus(s, message = '') {
  status = { state: s, message };
  emit();
}

function persist() {
  localStorage.setItem(DATA_KEY, JSON.stringify(state));
}
export function saveDevice(patch) {
  Object.assign(device, patch);
  localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  emit();
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const all = (kind) => Object.values(state.items[kind] || {});
export const get = (kind, id) => state.items[kind]?.[id] || null;

export function put(kind, obj) {
  const item = { ...obj, id: obj.id || uid(), updatedAt: Date.now() };
  state.items[kind][item.id] = item;
  state.outbox[`${kind}:${item.id}`] = { kind, id: item.id, data: item, updated_at: item.updatedAt, deleted: 0 };
  persist();
  emit();
  queueSync();
  return item;
}

export function remove(kind, id) {
  delete state.items[kind][id];
  state.outbox[`${kind}:${id}`] = { kind, id, data: null, updated_at: Date.now(), deleted: 1 };
  persist();
  emit();
  queueSync();
}

export function exportJSON() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), items: state.items }, null, 2);
}

/** Nhập lại từ file sao lưu: mọi bản ghi được ghi đè và đồng bộ lên. */
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data.items) throw new Error('File không đúng định dạng sao lưu Sổ Nhà');
  let n = 0;
  for (const k of KINDS) {
    for (const obj of Object.values(data.items[k] || {})) {
      put(k, obj);
      n++;
    }
  }
  return n;
}

// ---------- API ----------
export async function api(path, body) {
  if (!device.api) throw new Error('Chưa nhập địa chỉ Worker');
  const res = await fetch(device.api.replace(/\/+$/, '') + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-House-Key': device.key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401) throw new Error('Sai mã nhà');
  if (!res.ok) throw new Error(data?.error || `Lỗi máy chủ (${res.status})`);
  return data;
}

// ---------- Đồng bộ ----------
let syncing = false;
let again = false;
let timer = null;

export function queueSync(delay = 800) {
  clearTimeout(timer);
  timer = setTimeout(sync, delay);
}

function apply(row) {
  const key = `${row.kind}:${row.id}`;
  if (state.outbox[key]) return; // máy này còn bản sửa chưa gửi → giữ bản của máy
  const bucket = (state.items[row.kind] ||= {});
  const local = bucket[row.id];
  if (local && (local.updatedAt || 0) > row.updated_at) return;
  if (row.deleted) delete bucket[row.id];
  else bucket[row.id] = row.data;
}

export async function sync() {
  if (!device.api) return setStatus('unconfigured');
  if (!navigator.onLine) return setStatus('offline');
  if (syncing) {
    again = true;
    return;
  }
  syncing = true;
  setStatus('syncing');
  try {
    const sent = { ...state.outbox };
    const res = await api('/sync', { since: state.cursor, changes: Object.values(sent) });
    for (const [k, v] of Object.entries(sent)) {
      if (state.outbox[k] && state.outbox[k].updated_at === v.updated_at) delete state.outbox[k];
    }
    for (const row of res.items) apply(row);
    state.cursor = res.now;
    state.lastSync = Date.now();
    persist();
    setStatus('ok');
  } catch (e) {
    setStatus('error', e.message);
  } finally {
    syncing = false;
    if (again) {
      again = false;
      queueSync(100);
    }
  }
}

/** Xóa dữ liệu trên máy và tải lại toàn bộ từ máy chủ. */
export async function resync() {
  const outbox = state.outbox;
  state = blank();
  state.outbox = outbox;
  persist();
  emit();
  await sync();
}
