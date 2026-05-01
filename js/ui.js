// UI 렌더링 + 뷰 전환 + 모달 관리

import { Readings, Alarms } from './db.js';
import { renderTrend, summarize } from './chart.js';
import { AlarmScheduler } from './alarms.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

const CTX_LABEL = {
  fasting: '공복',
  before_meal: '식전',
  after_meal: '식후 2시간',
  bedtime: '취침 전',
  random: '기타',
};

const VIEW_TITLES = {
  record: '혈당 기록',
  alarms: '측정 알람',
  stats: '통계',
  settings: '설정',
};

export function showView(name) {
  $$('.view').forEach((el) => el.classList.add('hidden'));
  const view = $(`#view-${name}`);
  if (view) view.classList.remove('hidden');
  $('#view-title').textContent = VIEW_TITLES[name] || '';
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));

  if (name === 'record') renderRecord();
  if (name === 'alarms') renderAlarmsList();
  if (name === 'stats') renderStats(currentRange);
  if (name === 'settings') renderSettings();
}

export function toast(msg, ms = 2000) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function classify(value) {
  // 일반 가이드: 정상 70-180 (식후 포함)
  if (value < 70) return { label: '저혈당', color: 'text-red-600' };
  if (value <= 140) return { label: '정상', color: 'text-emerald-600' };
  if (value <= 180) return { label: '약간 높음', color: 'text-amber-600' };
  return { label: '고혈당', color: 'text-red-600' };
}

function fmtTime(ts) {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - new Date(d).setHours(0, 0, 0, 0);
  const dayLabel = diff === 0 ? '오늘' : diff === 86400000 ? '어제' : `${d.getMonth() + 1}/${d.getDate()}`;
  const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return `${dayLabel} ${time}`;
}

// ========== 기록 뷰 ==========
async function renderRecord() {
  const stats = await Readings.stats();
  $('#stat-today').textContent = stats.todayAvg ?? '-';
  $('#stat-week').textContent = stats.weekAvg ?? '-';
  $('#stat-count').textContent = stats.count ?? '0';

  const list = await Readings.list({ limit: 30 });
  const ul = $('#recent-list');
  const empty = $('#empty-recent');
  if (!list.length) {
    ul.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  ul.innerHTML = list.map((r) => {
    const c = classify(r.value);
    return `
      <li>
        <button data-id="${r.id}" class="reading-item w-full text-left bg-white rounded-xl p-3 border border-slate-200 active:bg-slate-50">
          <div class="flex items-center justify-between">
            <div class="flex items-baseline gap-2">
              <span class="text-2xl font-bold ${c.color}">${r.value}</span>
              <span class="text-xs text-slate-500">mg/dL</span>
              <span class="text-xs ${c.color}">${c.label}</span>
            </div>
            <span class="text-xs text-slate-400">${fmtTime(r.timestamp)}</span>
          </div>
          <div class="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span class="px-2 py-0.5 bg-slate-100 rounded">${CTX_LABEL[r.context] || '기타'}</span>
            ${r.insulin ? `<span>인슐린 ${r.insulin}u</span>` : ''}
            ${r.note ? `<span class="truncate">· ${escapeHtml(r.note)}</span>` : ''}
          </div>
        </button>
      </li>
    `;
  }).join('');

  ul.onclick = (e) => {
    const btn = e.target.closest('.reading-item');
    if (!btn) return;
    openRecordModal(Number(btn.dataset.id));
  };
}

// ========== 알람 뷰 ==========
async function renderAlarmsList() {
  const list = await Alarms.list();
  const ul = $('#alarm-list');
  const empty = $('#empty-alarms');
  const warn = $('#notif-warning');

  const msg = AlarmScheduler.capabilityMessage();
  if (msg) {
    warn.textContent = msg;
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }

  if (!list.length) {
    ul.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.sort((a, b) => a.time.localeCompare(b.time));
  ul.innerHTML = list.map((a) => {
    const days = a.days?.length ? a.days.sort().map((d) => '일월화수목금토'[d]).join(' ') : '매일';
    return `
      <li>
        <div class="bg-white rounded-xl p-3 border border-slate-200 flex items-center gap-3">
          <button data-id="${a.id}" class="alarm-edit flex-1 text-left">
            <div class="text-2xl font-semibold ${a.enabled ? '' : 'text-slate-400'}">${a.time}</div>
            <div class="text-xs text-slate-500 mt-0.5">${escapeHtml(a.label || '혈당 측정')} · ${days}</div>
          </button>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" data-id="${a.id}" class="alarm-toggle sr-only peer" ${a.enabled ? 'checked' : ''} />
            <div class="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-brand-500 transition-colors"></div>
            <div class="absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full transition-transform peer-checked:translate-x-5"></div>
          </label>
        </div>
      </li>
    `;
  }).join('');

  ul.onclick = async (e) => {
    const editBtn = e.target.closest('.alarm-edit');
    if (editBtn) {
      openAlarmModal(Number(editBtn.dataset.id));
      return;
    }
  };
  ul.onchange = async (e) => {
    const toggle = e.target.closest('.alarm-toggle');
    if (!toggle) return;
    const id = Number(toggle.dataset.id);
    await Alarms.update(id, { enabled: toggle.checked });
    if (toggle.checked) {
      const perm = await AlarmScheduler.requestPermission();
      if (perm !== 'granted') toast('알림 권한이 필요해요');
    }
    await AlarmScheduler.rescheduleAll();
    renderAlarmsList();
  };
}

// ========== 통계 뷰 ==========
let currentRange = 7;

async function renderStats(days) {
  currentRange = days;
  $$('.range-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.range) === days));

  const from = Date.now() - days * 86400000;
  const list = await Readings.list({ from, to: Date.now() });
  const canvas = $('#trend-chart');
  renderTrend(canvas, list);

  const sum = summarize(list);
  const grid = $('#stats-summary');
  if (!sum) {
    grid.innerHTML = `<div class="col-span-2 text-center text-slate-400 py-6 text-sm">이 기간에 기록이 없어요.</div>`;
    return;
  }
  grid.innerHTML = `
    ${tile('평균', `${sum.avg}`, 'mg/dL')}
    ${tile('정상범위 %', `${sum.tir}%`, '70-180')}
    ${tile('최저', `${sum.min}`, 'mg/dL')}
    ${tile('최고', `${sum.max}`, 'mg/dL')}
    ${Object.keys(sum.ctxAvg).length ? `
      <div class="col-span-2 bg-white rounded-xl p-3 border border-slate-200">
        <div class="text-xs text-slate-500 mb-2">측정 시점별 평균</div>
        <div class="space-y-1.5 text-sm">
          ${Object.entries(sum.ctxAvg).map(([k, v]) => `
            <div class="flex justify-between"><span class="text-slate-600">${CTX_LABEL[k] || k}</span><span class="font-medium">${v} mg/dL</span></div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function tile(label, big, sub) {
  return `<div class="bg-white rounded-xl p-3 border border-slate-200">
    <div class="text-xs text-slate-500">${label}</div>
    <div class="text-xl font-bold mt-1">${big}</div>
    <div class="text-xs text-slate-400">${sub}</div>
  </div>`;
}

// ========== 설정 뷰 ==========
async function renderSettings() {
  const { Auth } = await import('./auth.js');
  const { Sync } = await import('./sync.js');
  const { Meta } = await import('./db.js');

  $('#oauth-client-id').value = await Auth.getClientId();
  const signedIn = await Auth.isSignedIn();
  $('#auth-state').textContent = signedIn ? '로그인됨' : '로그아웃됨';
  $('#btn-signin').classList.toggle('hidden', signedIn);
  $('#btn-signout').classList.toggle('hidden', !signedIn);
  $('#btn-sync').classList.toggle('hidden', !signedIn);

  const last = await Sync.lastSyncAt();
  $('#sync-status').textContent = last ? `최근 동기화: ${new Date(last).toLocaleString('ko-KR')}` : '';
}

// ========== 모달 ==========
let editingReadingId = null;
let editingAlarmId = null;

export function openRecordModal(id = null) {
  editingReadingId = id;
  const modal = $('#modal-record');
  $('#modal-record-title').textContent = id ? '기록 수정' : '혈당 기록';
  $('#r-delete').classList.toggle('hidden', !id);

  // 기본값
  $('#r-value').value = '';
  $('#r-insulin').value = '';
  $('#r-note').value = '';
  setActiveCtx('fasting');
  $('#r-time').value = toLocalDatetime(Date.now());

  if (id) {
    Readings.get(id).then((r) => {
      if (!r) return;
      $('#r-value').value = r.value;
      $('#r-insulin').value = r.insulin ?? '';
      $('#r-note').value = r.note || '';
      setActiveCtx(r.context);
      $('#r-time').value = toLocalDatetime(r.timestamp);
    });
  }

  modal.classList.remove('hidden');
  setTimeout(() => $('#r-value').focus(), 50);
}

export function openAlarmModal(id = null) {
  editingAlarmId = id;
  const modal = $('#modal-alarm');
  $('#modal-alarm-title').textContent = id ? '알람 수정' : '새 알람';
  $('#a-delete').classList.toggle('hidden', !id);

  $('#a-time').value = '08:00';
  $('#a-label').value = '';
  setActiveDays([]);

  if (id) {
    Alarms.get(id).then((a) => {
      if (!a) return;
      $('#a-time').value = a.time;
      $('#a-label').value = a.label || '';
      setActiveDays(a.days || []);
    });
  }
  modal.classList.remove('hidden');
}

export function closeModals() {
  $('#modal-record').classList.add('hidden');
  $('#modal-alarm').classList.add('hidden');
  editingReadingId = null;
  editingAlarmId = null;
}

function setActiveCtx(ctx) {
  $$('.ctx-btn').forEach((b) => b.classList.toggle('active', b.dataset.ctx === ctx));
}

function getActiveCtx() {
  return $$('.ctx-btn').find((b) => b.classList.contains('active'))?.dataset.ctx || 'random';
}

function setActiveDays(days) {
  $$('.day-btn').forEach((b) => b.classList.toggle('active', days.includes(Number(b.dataset.d))));
}

function getActiveDays() {
  return $$('.day-btn').filter((b) => b.classList.contains('active')).map((b) => Number(b.dataset.d));
}

function toLocalDatetime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 모달 폼 핸들러용 외부 노출
export const ModalActions = {
  async saveReading() {
    const v = Number($('#r-value').value);
    if (!v || v < 20 || v > 600) {
      toast('혈당값(20-600)을 입력해주세요');
      return false;
    }
    const ts = $('#r-time').value ? new Date($('#r-time').value).getTime() : Date.now();
    const data = {
      value: v,
      context: getActiveCtx(),
      timestamp: ts,
      insulin: $('#r-insulin').value || null,
      note: $('#r-note').value || '',
    };
    if (editingReadingId) {
      await Readings.update(editingReadingId, data);
      toast('수정됨');
    } else {
      await Readings.add(data);
      toast('기록 저장됨');
    }
    return true;
  },

  async deleteReading() {
    if (!editingReadingId) return false;
    if (!confirm('이 기록을 삭제할까요?')) return false;
    await Readings.softDelete(editingReadingId);
    toast('삭제됨');
    return true;
  },

  async saveAlarm() {
    const time = $('#a-time').value;
    if (!time) { toast('시간을 입력해주세요'); return false; }
    const data = {
      time,
      days: getActiveDays(),
      label: $('#a-label').value || '',
      enabled: true,
    };
    if (editingAlarmId) {
      await Alarms.update(editingAlarmId, data);
      toast('수정됨');
    } else {
      await Alarms.add(data);
      const perm = await AlarmScheduler.requestPermission();
      if (perm !== 'granted') {
        toast('알림 권한이 필요해요');
      } else {
        toast('알람 저장됨');
      }
    }
    await AlarmScheduler.rescheduleAll();
    return true;
  },

  async deleteAlarm() {
    if (!editingAlarmId) return false;
    if (!confirm('이 알람을 삭제할까요?')) return false;
    await Alarms.softDelete(editingAlarmId);
    await AlarmScheduler.rescheduleAll();
    toast('삭제됨');
    return true;
  },
};

export const Render = {
  record: renderRecord,
  alarms: renderAlarmsList,
  stats: (days) => renderStats(days ?? currentRange),
  settings: renderSettings,
};
