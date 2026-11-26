// Đăng ký nhận thông báo đẩy (Web Push) với Worker.
import { api, device } from './store.js';

function fromB64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush() {
  if (!pushSupported()) {
    throw new Error(
      isStandalone()
        ? 'Thiết bị này chưa hỗ trợ thông báo web (iPhone cần iOS 16.4 trở lên).'
        : 'Trên iPhone: bấm nút Chia sẻ → "Thêm vào MH chính", rồi mở app từ màn hình chính để bật thông báo.'
    );
  }
  if (device.me == null) throw new Error('Chọn "Tôi là ai" trước khi bật thông báo.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Bạn chưa cho phép thông báo. Vào Cài đặt iPhone → Thông báo → Sổ Nhà để bật.');

  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api('/vapid');
  const key = fromB64u(publicKey);

  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const old = sub.options?.applicationServerKey;
    const same = old && new Uint8Array(old).every((b, i) => b === key[i]);
    if (!same) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api('/subscribe', { subscription: sub.toJSON(), user: device.me, label: navigator.platform || '' });
  return sub;
}

/** Gọi lại khi đổi "Tôi là ai" để máy chủ gửi đúng người. */
export async function refreshPushOwner() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await api('/subscribe', { subscription: sub.toJSON(), user: device.me });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await api('/unsubscribe', { endpoint: sub.endpoint });
  } catch {}
  await sub.unsubscribe();
}
