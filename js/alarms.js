// 알람 스케줄러
// - Notification Triggers API 지원 시: 앱이 꺼져있어도 알림 (Chrome 계열)
// - 미지원 시: 앱이 열린 동안 setTimeout 기반 (iOS Safari 등)

import { Alarms } from './db.js';

const HORIZON_DAYS = 7; // Notification Triggers로 미리 예약할 기간

export const AlarmScheduler = {
  swReg: null,
  timers: new Map(),

  init(swReg) {
    this.swReg = swReg;
  },

  supportsTriggers() {
    return typeof window !== 'undefined' && 'Notification' in window && 'showTrigger' in Notification.prototype;
  },

  permission() {
    return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
  },

  async requestPermission() {
    if (typeof Notification === 'undefined') return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.requestPermission();
  },

  // 다음 발생 시각 계산 (days가 비어있으면 매일)
  nextOccurrences(alarm, count = 7) {
    const [hh, mm] = alarm.time.split(':').map(Number);
    const days = Array.isArray(alarm.days) && alarm.days.length ? alarm.days : [0,1,2,3,4,5,6];
    const out = [];
    const now = new Date();
    for (let offset = 0; offset < 14 && out.length < count; offset++) {
      const d = new Date(now);
      d.setDate(now.getDate() + offset);
      d.setHours(hh, mm, 0, 0);
      if (d.getTime() <= now.getTime()) continue;
      if (days.includes(d.getDay())) out.push(d.getTime());
    }
    return out;
  },

  async clearScheduled() {
    // setTimeout 정리
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    // 예약된 트리거 알림 정리 (대기 중인 트리거까지 포함)
    if (this.swReg && this.supportsTriggers()) {
      try {
        const notifs = await this.swReg.getNotifications({ includeTriggered: true });
        notifs.filter((n) => (n.tag || '').startsWith('alarm-')).forEach((n) => n.close());
      } catch {}
    }
  },

  async rescheduleAll() {
    if (!this.swReg) return;
    if (this.permission() !== 'granted') return;

    await this.clearScheduled();
    const list = await Alarms.list();
    const enabled = list.filter((a) => a.enabled);
    const supportsTriggers = this.supportsTriggers();

    for (const alarm of enabled) {
      const times = this.nextOccurrences(alarm, HORIZON_DAYS);
      if (!times.length) continue;

      if (supportsTriggers) {
        // 미래 모든 발생을 사전 예약
        for (const t of times) {
          try {
            await this.swReg.showNotification(alarm.label || '혈당 측정 시간', {
              body: '혈당을 측정하고 기록해주세요.',
              tag: `alarm-${alarm.id}-${t}`,
              icon: './icons/icon.svg',
              badge: './icons/icon.svg',
              showTrigger: new TimestampTrigger(t),
              data: { alarmId: alarm.id, url: './index.html' },
            });
          } catch (e) {
            console.warn('트리거 예약 실패', e);
          }
        }
      } else {
        // 앱이 열린 동안만: 다음 발생 1건만 setTimeout
        const next = times[0];
        const delay = next - Date.now();
        if (delay > 0 && delay < 0x7fffffff) {
          const id = setTimeout(() => this.fireAlarm(alarm), delay);
          this.timers.set(`${alarm.id}-${next}`, id);
        }
      }
    }
  },

  fireAlarm(alarm) {
    if (!this.swReg) return;
    navigator.serviceWorker.controller?.postMessage({
      type: 'show-notification',
      title: alarm.label || '혈당 측정 시간',
      body: '혈당을 측정하고 기록해주세요.',
      tag: `alarm-${alarm.id}-${Date.now()}`,
      alarmId: alarm.id,
    });
    // 다음 발생 재예약
    setTimeout(() => this.rescheduleAll(), 1000);
  },

  capabilityMessage() {
    if (typeof Notification === 'undefined') {
      return '이 브라우저는 알림을 지원하지 않습니다.';
    }
    if (Notification.permission === 'denied') {
      return '알림 권한이 차단되어 있습니다. 브라우저 설정에서 허용해주세요.';
    }
    if (Notification.permission !== 'granted') {
      return '알림 권한이 필요합니다. 첫 알람 저장 시 권한을 요청합니다.';
    }
    if (!this.supportsTriggers()) {
      return '이 브라우저는 백그라운드 예약 알림을 지원하지 않습니다 (예: iOS Safari). 앱이 열려있는 동안만 정확한 알람이 동작하며, 이 외에는 휴대폰 기본 알람 앱 사용을 권장합니다.';
    }
    return null;
  },
};
