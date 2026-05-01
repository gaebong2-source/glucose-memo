# 혈당 메모

당뇨 환자를 위한 모바일 PWA. 혈당 측정 알람, 기록, 추세 분석, Google Drive 동기화를 제공합니다.

## 주요 기능

- **간편 기록**: 혈당값 + 측정 시점(공복/식전/식후/취침전/기타) + 인슐린 단위 + 메모
- **측정 알람**: 시간/요일별 반복 알람 (Chrome 계열은 앱이 닫혀있어도 알림 작동)
- **추세 통계**: 7/30/90일 그래프, 정상범위 비율(TIR), 측정 시점별 평균
- **로컬 저장**: 모든 데이터는 IndexedDB에 저장 (의료 데이터는 외부로 전송되지 않음)
- **Google Drive 동기화 (선택)**: 본인 Google Drive의 **앱 전용 숨김 폴더**에만 저장. 다른 앱은 접근 불가

## 빠르게 실행해보기

별도 빌드 단계가 없습니다. 간단한 정적 서버만 있으면 됩니다.

### PowerShell만으로 띄우기 (Node/Python 불필요)

프로젝트에 포함된 `serve.ps1`을 실행:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
# 또는 포트 변경
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8080
```

브라우저에서 `http://localhost:5173` 접속.

### Python이 있다면

```powershell
python -m http.server 5173
```

> **주의**: Service Worker와 IndexedDB는 `file://` 프로토콜에서는 동작하지 않습니다. 반드시 `http(s)://` 또는 `localhost`로 열어주세요.

### 모바일에서 테스트

1. 같은 와이파이의 PC에서 위처럼 서버 실행
2. PC IP 확인 (`ipconfig`)
3. 휴대폰 브라우저에서 `http://<PC-IP>:5173` 접속
4. Chrome 메뉴 → "홈 화면에 추가"로 PWA 설치

> 단, **푸시 알림은 HTTPS에서만 동작**합니다. 로컬 IP로는 알람 기능을 완전히 테스트할 수 없습니다. 실제 배포 후 사용하세요.

## 배포

GitHub Pages, Netlify, Vercel, Cloudflare Pages 어디든 정적 호스팅으로 가능합니다.

가장 빠른 경로:
1. 이 폴더를 GitHub 저장소에 푸시
2. 저장소 Settings → Pages → 브랜치 선택
3. 발급된 `https://<유저>.github.io/<레포>/` 주소가 곧 앱 URL

## Google Drive 동기화 설정

### 1. Google Cloud OAuth 클라이언트 ID 발급

1. [Google Cloud Console](https://console.cloud.google.com/) 접속 → 프로젝트 생성
2. **API 및 서비스 → 라이브러리** → "Google Drive API" 활성화
3. **API 및 서비스 → OAuth 동의 화면** → 외부(External) → 앱 정보 입력
   - 사용자 유형: 외부
   - 범위(Scopes): `.../auth/drive.appdata` 추가
   - 테스트 사용자: 본인 Google 계정 추가 (게시 전까지 본인만 사용 가능)
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 JavaScript 원본: 앱이 호스팅되는 URL (예: `https://yourname.github.io`)
   - 승인된 리디렉션 URI: 사용 안 함 (GIS는 popup 흐름)
5. 발급된 **클라이언트 ID** 복사 (형식: `xxxxx.apps.googleusercontent.com`)

### 2. 앱에 입력

앱 → **설정 탭 → OAuth 클라이언트 ID** 칸에 붙여넣고 저장 → "Google 로그인" 클릭.

이후 **지금 동기화** 버튼으로 양방향 머지(updatedAt 큰 쪽 우선).

### 데이터 안전성

- 동기화 데이터는 Google Drive의 **앱 전용 폴더(appDataFolder)** 에 저장됩니다. 사용자가 일반 Drive UI에서는 볼 수 없으며, 이 OAuth 클라이언트 ID로만 접근 가능합니다.
- 개인 OAuth 클라이언트 ID를 본인이 직접 발급해 사용하므로, 제3자(앱 개발자 포함)는 데이터에 접근할 수 없습니다.

## 알림 동작 범위

| 환경 | 앱 열려 있음 | 앱 닫혀 있음 |
|------|-----------|-----------|
| Android Chrome (PWA 설치) | O | O (Notification Triggers) |
| Desktop Chrome/Edge | O | O |
| iOS Safari (PWA 설치) | O | △ 제한적 (홈 화면 추가 필수) |
| 일반 모바일 브라우저 (설치 X) | O | X |

**iOS 사용자 권장**: PWA 설치 후에도 백그라운드 알림은 불안정할 수 있으니, 휴대폰 기본 알람 앱과 병행 사용을 권장합니다.

## 데이터 구조

- `readings`: `{ id, timestamp, value, context, insulin, note, updatedAt, deleted }`
- `alarms`: `{ id, time(HH:MM), days(0-6), label, enabled, updatedAt, deleted }`
- 삭제는 `deleted: 1` 소프트 삭제 (동기화 시 충돌 방지)

## 프로젝트 구조

```
.
├── index.html         # 진입점 (CDN 의존성 포함)
├── manifest.json      # PWA 매니페스트
├── sw.js              # Service Worker (캐시 + 알림)
├── styles.css         # 커스텀 스타일
├── icons/icon.svg     # 앱 아이콘
└── js/
    ├── app.js         # 진입점 + 이벤트 와이어링
    ├── ui.js          # 뷰 렌더링 + 모달
    ├── db.js          # Dexie/IndexedDB 데이터 계층
    ├── alarms.js      # 알람 스케줄러
    ├── chart.js       # Chart.js 추세 그래프
    ├── auth.js        # Google OAuth
    └── sync.js        # Google Drive appdata 동기화
```

## 면책

이 앱은 의료기기가 아니며, 진단·치료의 근거로 사용하지 마세요. 의료 결정은 반드시 담당 의료진과 상의하세요.
