// Tạo wrangler.toml lúc deploy, lấy đúng D1 đang gắn với Worker trên Cloudflare
// để không phải ghi tay ID database vào repo.
import { writeFileSync } from 'node:fs';

const WORKER = 'so-nha-api';
const DB_BINDING = 'DB';
const DB_NAME_FALLBACK = 'so-nha-db';
const token = process.env.CLOUDFLARE_API_TOKEN;

async function api(path) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!json.success) throw new Error(`${path} → ${res.status} ${JSON.stringify(json.errors || json)}`);
  return json.result;
}

let account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!account) {
  const accounts = await api('/accounts');
  if (accounts.length !== 1) {
    throw new Error(`Token thấy ${accounts.length} tài khoản. Thêm secret CLOUDFLARE_ACCOUNT_ID để chọn đúng tài khoản.`);
  }
  account = accounts[0].id;
}

let dbId = null;
let compat = '2025-01-01';
try {
  const settings = await api(`/accounts/${account}/workers/scripts/${WORKER}/settings`);
  const b = (settings.bindings || []).find((x) => x.type === 'd1' && x.name === DB_BINDING);
  if (b) dbId = b.id || b.database_id;
  if (settings.compatibility_date) compat = settings.compatibility_date;
} catch (e) {
  console.log(`Không đọc được cấu hình Worker hiện tại (${e.message}). Thử tìm D1 theo tên.`);
}
if (!dbId) {
  const dbs = await api(`/accounts/${account}/d1/database?name=${DB_NAME_FALLBACK}`);
  const db = dbs.find((d) => d.name === DB_NAME_FALLBACK);
  if (!db) throw new Error(`Không tìm thấy D1 "${DB_NAME_FALLBACK}". Kiểm tra lại binding DB của Worker.`);
  dbId = db.uuid;
}

const toml = `name = "${WORKER}"
main = "worker/worker.js"
account_id = "${account}"
compatibility_date = "${compat}"
workers_dev = true

[[d1_databases]]
binding = "${DB_BINDING}"
database_name = "${DB_NAME_FALLBACK}"
database_id = "${dbId}"

[triggers]
crons = ["0 * * * *"]

[observability]
enabled = true
`;
writeFileSync('wrangler.toml', toml);
console.log(toml.replace(account, '***'));
