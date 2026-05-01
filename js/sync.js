// Google Drive appdata 폴더 동기화
// 단일 JSON 파일(data.json)에 전체 데이터를 저장하고 머지

import { Auth } from './auth.js';
import { exportAll, importMerge, Meta } from './db.js';

const FILE_NAME = 'glucose-memo-data.json';
const LAST_SYNC_KEY = 'last_sync_at';

async function authedFetch(url, init = {}) {
  const token = await Auth.getToken({ interactive: false });
  if (!token) throw new Error('NOT_SIGNED_IN');
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  return res;
}

async function findFileId() {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)`;
  const res = await authedFetch(url);
  if (!res.ok) throw new Error(`Drive 조회 실패: ${res.status}`);
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function downloadFile(id) {
  const res = await authedFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  if (!res.ok) throw new Error(`다운로드 실패: ${res.status}`);
  return res.json();
}

async function uploadFile(id, payload) {
  const body = JSON.stringify(payload);
  if (id) {
    // 업데이트 (multipart 불필요 - 미디어 업로드만)
    const res = await authedFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }
    );
    if (!res.ok) throw new Error(`업로드 실패: ${res.status}`);
    return id;
  } else {
    // 신규 생성: multipart (메타데이터 + 본문)
    const boundary = '-------glucose' + Date.now();
    const meta = { name: FILE_NAME, parents: ['appDataFolder'] };
    const multipart =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n' +
      `--${boundary}\r\n` +
      'Content-Type: application/json\r\n\r\n' +
      body + '\r\n' +
      `--${boundary}--`;
    const res = await authedFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart }
    );
    if (!res.ok) throw new Error(`생성 실패: ${res.status}`);
    return (await res.json()).id;
  }
}

export const Sync = {
  async run() {
    // 1) 토큰 확보
    await Auth.getToken({ interactive: true });

    // 2) 원격 파일 찾기
    let fileId = await findFileId();
    let remote = null;
    if (fileId) {
      try { remote = await downloadFile(fileId); } catch (e) { console.warn('원격 다운로드 실패', e); }
    }

    // 3) 원격이 있으면 로컬에 머지
    let merged = { added: 0, updated: 0 };
    if (remote) merged = await importMerge(remote);

    // 4) 로컬 전체를 export 후 업로드
    const local = await exportAll();
    fileId = await uploadFile(fileId, local);

    await Meta.set(LAST_SYNC_KEY, Date.now());
    return { fileId, ...merged, uploaded: local.readings.length + local.alarms.length };
  },

  async lastSyncAt() {
    return Meta.get(LAST_SYNC_KEY, null);
  },
};
