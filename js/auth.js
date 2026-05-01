// Google Identity Services 기반 OAuth
// 사용자가 본인의 OAuth 클라이언트 ID 입력 → drive.appdata 스코프로 토큰 발급

import { Meta } from './db.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const TOKEN_KEY = 'gauth_token'; // { access_token, expires_at }
const CID_KEY = 'gauth_client_id';

let tokenClient = null;
let cachedToken = null;

export const Auth = {
  async getClientId() {
    return Meta.get(CID_KEY, '');
  },

  async setClientId(id) {
    await Meta.set(CID_KEY, (id || '').trim());
    tokenClient = null; // 재초기화
  },

  async hasClientId() {
    const id = await this.getClientId();
    return !!id;
  },

  async ensureGisLoaded() {
    // GIS가 비동기 로드되므로 대기
    let tries = 0;
    while (!(window.google && google.accounts && google.accounts.oauth2)) {
      await new Promise((r) => setTimeout(r, 100));
      if (++tries > 50) throw new Error('Google Identity Services 로드 실패');
    }
  },

  async getToken({ interactive = true } = {}) {
    // 메모리 캐시
    if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) {
      return cachedToken.access_token;
    }
    // 저장된 토큰
    const saved = await Meta.get(TOKEN_KEY);
    if (saved && saved.expires_at > Date.now() + 60_000) {
      cachedToken = saved;
      return saved.access_token;
    }
    if (!interactive) return null;

    const clientId = await this.getClientId();
    if (!clientId) throw new Error('OAuth 클라이언트 ID가 설정되지 않았습니다. 설정 화면에서 입력해주세요.');

    await this.ensureGisLoaded();

    return new Promise((resolve, reject) => {
      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: async (resp) => {
            if (resp.error) {
              reject(new Error(resp.error_description || resp.error));
              return;
            }
            const expires_at = Date.now() + (resp.expires_in - 30) * 1000;
            const token = { access_token: resp.access_token, expires_at };
            cachedToken = token;
            await Meta.set(TOKEN_KEY, token);
            resolve(resp.access_token);
          },
          error_callback: (err) => reject(new Error(err.message || '인증 취소됨')),
        });
        tokenClient.requestAccessToken({ prompt: '' });
      } catch (e) {
        reject(e);
      }
    });
  },

  async signOut() {
    const token = cachedToken?.access_token || (await Meta.get(TOKEN_KEY))?.access_token;
    cachedToken = null;
    await Meta.set(TOKEN_KEY, null);
    if (token && window.google?.accounts?.oauth2) {
      try { google.accounts.oauth2.revoke(token, () => {}); } catch {}
    }
  },

  async isSignedIn() {
    if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) return true;
    const saved = await Meta.get(TOKEN_KEY);
    return !!(saved && saved.expires_at > Date.now() + 60_000);
  },
};
