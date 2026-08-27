/**
 * 推送通知 composable
 * 处理浏览器 Push API 注册、权限请求、通知跳转
 */
import { ref } from 'vue';
import type { Ref } from 'vue';
import { http } from '../api/http';

export interface PushNotificationPermission {
  state: Ref<NotificationPermission>;
  request(): Promise<NotificationPermission>;
}

export function usePushPermission(): PushNotificationPermission {
  const state = ref<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  ) as Ref<NotificationPermission>;

  async function request(): Promise<NotificationPermission> {
    if (typeof Notification === 'undefined') return 'denied';
    const result = await Notification.requestPermission();
    state.value = result;
    return result;
  }

  return { state, request };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSubscription() {
  const subscribed = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function checkExisting(): Promise<PushSubscription | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function subscribe(deviceTag?: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        error.value = '当前浏览器不支持推送通知';
        return false;
      }

      let sub = await checkExisting();
      if (sub) {
        subscribed.value = true;
        await sendSubscriptionToServer(sub, deviceTag);
        return true;
      }

      const { data } = await http.get('/notifications/vapid-public-key');
      const publicKey = data.publicKey as string;
      if (!publicKey) {
        error.value = '推送服务暂不可用';
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await sendSubscriptionToServer(sub, deviceTag);
      subscribed.value = true;
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : '订阅失败';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function unsubscribe(): Promise<boolean> {
    loading.value = true;
    try {
      const sub = await checkExisting();
      if (!sub) {
        subscribed.value = false;
        return true;
      }
      await sub.unsubscribe();
      await http.delete('/notifications/subscribe', { data: { endpoint: sub.endpoint } });
      subscribed.value = false;
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : '取消订阅失败';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function init() {
    const sub = await checkExisting();
    subscribed.value = !!sub;
  }

  return { subscribed, loading, error, subscribe, unsubscribe, init, checkExisting };
}

async function sendSubscriptionToServer(sub: PushSubscription, deviceTag?: string) {
  const json = sub.toJSON();
  await http.post('/notifications/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
    deviceTag,
  });
}

export function listenToNotificationClicks(onNavigate: (route: string) => void) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data;
    if (data?.type === 'NOTIFICATION_CLICK' && data.route) {
      onNavigate(data.route as string);
    }
  });
}
