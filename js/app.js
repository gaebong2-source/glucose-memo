// 앱 진입점: SW 등록, 이벤트 와이어링, 알람 부트스트랩

import { showView, openRecordModal, openAlarmModal, closeModals, ModalActions, Render, toast } from './ui.js';
import { AlarmScheduler } from './alarms.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.warn('SW 등록 실패', e);
    return null;
  }
}

function wireNav() {
  $$('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => showView(b.dataset.view));
  });
}

function wireRecordModal() {
  $('#btn-add').addEventListener('click', () => openRecordModal());

  // 컨텍스트 버튼 토글
  $('#r-context-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.ctx-btn');
    if (!b) return;
    $$('.ctx-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
  });

  $('#r-save').addEventListener('click', async () => {
    const ok = await ModalActions.saveReading();
    if (ok) {
      closeModals();
      Render.record();
    }
  });

  $('#r-delete').addEventListener('click', async () => {
    const ok = await ModalActions.deleteReading();
    if (ok) {
      closeModals();
      Render.record();
    }
  });
}

function wireAlarmModal() {
  $('#btn-add-alarm').addEventListener('click', () => openAlarmModal());

  $('#a-days').addEventListener('click', (e) => {
    const b = e.target.closest('.day-btn');
    if (!b) return;
    b.classList.toggle('active');
  });

  $('#a-save').addEventListener('click', async () => {
    const ok = await ModalActions.saveAlarm();
    if (ok) {
      closeModals();
      Render.alarms();
    }
  });

  $('#a-delete').addEventListener('click', async () => {
    const ok = await ModalActions.deleteAlarm();
    if (ok) {
      closeModals();
      Render.alarms();
    }
  });
}

function wireModalDismiss() {
  $$('.modal-close').forEach((b) => b.addEventListener('click', closeModals));
  $$('.modal').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) closeModals();
    });
  });
}

function wireStatsRange() {
  $$('.range-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const days = Number(b.dataset.range);
      $$('.range-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      Render.stats(days);
    });
  });
}

async function wireSettings() {
  const { Auth } = await import('./auth.js');
  const { Sync } = await import('./sync.js');
  const { exportAll, importMerge } = await import('./db.js');

  $('#btn-save-client-id').addEventListener('click', async () => {
    const id = $('#oauth-client-id').value.trim();
    if (id && !/\.apps\.googleusercontent\.com$/.test(id)) {
      if (!confirm('형식이 일반적인 OAuth 클라이언트 ID와 달라보입니다. 그래도 저장할까요?')) return;
    }
    await Auth.setClientId(id);
    toast('저장됨');
  });

  $('#btn-signin').addEventListener('click', async () => {
    try {
      await Auth.getToken({ interactive: true });
      toast('로그인됨');
      Render.settings();
    } catch (e) {
      toast(e.message || '로그인 실패');
    }
  });

  $('#btn-signout').addEventListener('click', async () => {
    await Auth.signOut();
    toast('로그아웃됨');
    Render.settings();
  });

  $('#btn-sync').addEventListener('click', async () => {
    $('#sync-status').textContent = '동기화 중...';
    try {
      const result = await Sync.run();
      toast(`동기화 완료 (추가 ${result.added}, 갱신 ${result.updated})`);
      Render.settings();
      Render.record();
    } catch (e) {
      console.error(e);
      $('#sync-status').textContent = '동기화 실패: ' + (e.message || e);
      toast('동기화 실패');
    }
  });

  $('#btn-export').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glucose-memo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const result = await importMerge(payload);
      toast(`가져옴 (추가 ${result.added}, 갱신 ${result.updated})`);
      Render.record();
    } catch (err) {
      toast('가져오기 실패: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });
}

function wireSWMessages() {
  navigator.serviceWorker?.addEventListener('message', (e) => {
    const msg = e.data || {};
    if (msg.type === 'notification-action') {
      if (msg.action === 'record') {
        showView('record');
        openRecordModal();
      }
    }
  });

  // URL 해시로 들어오면 입력창 열기
  if (location.hash === '#add') {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => openRecordModal(), 100);
  }
}

async function init() {
  wireNav();
  wireRecordModal();
  wireAlarmModal();
  wireModalDismiss();
  wireStatsRange();
  await wireSettings();
  wireSWMessages();

  showView('record');

  const reg = await registerSW();
  if (reg) {
    AlarmScheduler.init(reg);
    await AlarmScheduler.rescheduleAll();
  }

  // 백그라운드 복귀 시 알람 재예약 (시간 변경 등 대응)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      AlarmScheduler.rescheduleAll();
    }
  });
}

init().catch((e) => {
  console.error('초기화 실패', e);
  toast('초기화 실패: ' + (e.message || e));
});
