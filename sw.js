// 혈당 메모 - Service Worker
// 오프라인 캐시 + 알람 알림 처리

const CACHE_VERSION = 'v1';
const CACHE_NAME = `glucose-memo-${CACHE_VERSION}`;
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/app.js',
  './js/db.js',
  './js/ui.js',
  './js/alarms.js',
  './js/chart.js',
  './js/auth.js',
  './js/sync.js',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL).catch((err) => console.warn('[sw] precache fail', err))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 같은 출처의 GET 요청만 캐시 우선, 그 외는 네트워크
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// 알람 표시 (페이지에서 postMessage로 트리거)
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'show-notification') {
    const { title, body, tag, alarmId } = data;
    self.registration.showNotification(title || '혈당 측정 시간', {
      body: body || '혈당을 측정하고 기록해주세요.',
      icon: './icons/icon.svg',
      badge: './icons/icon.svg',
      tag: tag || `alarm-${alarmId || Date.now()}`,
      requireInteraction: false,
      data: { alarmId, url: './index.html' },
      actions: [
        { action: 'record', title: '지금 기록' },
        { action: 'snooze', title: '10분 후' },
      ],
    });
  }
});

// 알림 클릭
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
  const action = event.action;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList.find((c) => c.url.includes('index.html') || c.url.endsWith('/'));

      if (action === 'snooze') {
        // 10분 뒤 다시 표시
        setTimeout(() => {
          self.registration.showNotification(event.notification.title, {
            body: event.notification.body,
            icon: './icons/icon.svg',
            tag: event.notification.tag + '-snooze',
            data: event.notification.data,
          });
        }, 10 * 60 * 1000);
        return;
      }

      const url = action === 'record' ? targetUrl + '#add' : targetUrl;
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'notification-action', action, alarmId: event.notification.data?.alarmId });
      } else {
        self.clients.openWindow(url);
      }
    })()
  );
});
