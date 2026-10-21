# 청첩장 미니게임 랭킹 보안 가이드

이 문서는 `security/wedding-ranking-hardening` 브랜치의 보안 강화를 **실서비스 하객에게 피해 없이** 적용하는 순서입니다.
위에서부터 차례대로 진행하세요. (Firebase 프로젝트: `my-wedding-invitation-efd31`)

## 무엇이 바뀌나

| 구분 | 이전 | 이후 |
|---|---|---|
| 공개 랭킹 | `rankings/{전화번호 해시}`, **전화번호 원문 공개** | `scores/{익명 uid}`, 전화번호 없음 |
| 쓰기 권한 | 누구나 아무 문서나 (전화번호만 알면) | 익명 인증 uid **본인 문서만** |
| 점수 검증 | 0 이상 정수면 통과 | **고정 상한 50,000점**(세션 기록이 있으면 경과 시간 기반으로 최대 1,000,000점까지), playCount +1, best=max, 연속 제출 1초 간격 |
| 마감 | 기기 시계 기준(우회 가능) | **서버 시각** 2026-11-01 11:00 KST |
| 연락처 | 공개 문서에 포함 | `contacts/{uid}` **쓰기 전용**(아무도 클라이언트에서 못 읽음) |
| 기존 기록 | – | 읽기 전용으로 계속 표시 → 마이그레이션 후 전화번호 없는 `legacy_scores`로 이전 |

점수 상한 근거(`js/game.js`): 한 발 최대 219점(BULLSEYE 200 + 보너스 19), 한 발 최소 약 1.24초(비행 ≈0.69초 + `STICK_DELAY` 0.55초).
- **고정 상한 경로(기본)**: 과녁은 80라운드까지 빨라지고 이후 랜덤 변동 → 80발 모두 만점이어도 17,520점. 넉넉히 **50,000점**까지 무조건 허용.
- **세션 경로**: 게임 시작 시 서버 시각이 기록됐다면 "0.8초당 219점"(최대 1,000,000점)까지 허용 → 50,000점을 넘는 초고수도 정상 저장.
- 최소 게임 시간 제한은 없습니다(정상 플레이를 거부할 수 있어서 제거).

### 하객이 느끼는 차이를 없애기 위한 동작
- 익명 로그인 실패 → 게임은 그대로 진행, 뒤에서 지수 백오프(1초→최대 30초)로 재시도.
- 게임 시작 기록 실패 → 게임 중 백그라운드 재시도(최대 6회). 끝내 실패해도 점수는 고정 상한 경로로 저장.
- 점수 저장 실패(오프라인/일시 오류/간격 제한) → 1.2초 후 1회 재시도, 그래도 실패하면 기기(localStorage)에 대기열로 저장하고
  다음 게임 시작·온라인 복귀·페이지 재방문 시 조용히 재전송. 게임 종료 화면 BEST SCORE는 "확인 실패" 대신 기기에 기억된 최고점/이번 점수로 표시.
- 랭킹 목록은 로그인과 무관하게 즉시 구독(공개 읽기).
- App Check는 "적용" 전에는 실패해도 아무 영향 없음. reCAPTCHA 배지는 CSS로 숨기고 푸터에 Google 요구 고지 문구를 작게 표시.

---

## 배포 순서

### 0단계. 백업 (필수)
- Firebase 콘솔 > Firestore > `rankings` 데이터를 확인하고, 아래 6단계 스크립트의 `backup` 명령으로 JSON 백업을 받아 두세요.
  (백업 파일에는 전화번호가 들어 있으니 **저장소 밖** 안전한 곳에 보관하고 커밋하지 마세요.)

### 1단계. 익명 인증 켜기 (기존 하객 영향 없음)
1. 콘솔 > **Authentication** > (처음이면 "시작하기") > **로그인 방법(Sign-in method)** > **익명(Anonymous)** > 사용 설정 > 저장.
2. Authentication > **설정(Settings)** > **승인된 도메인(Authorized domains)** 에 `ardmos.github.io` 가 있는지 확인, 없으면 추가.
   (`localhost`는 기본 포함. 커스텀 도메인을 쓴다면 그것도 추가.)

### 2단계. 복합 인덱스 미리 만들기 (기존 하객 영향 없음)
콘솔 > Firestore > **색인(Indexes)** > 복합 > 색인 만들기, 아래 두 개를 추가하고 상태가 "사용 설정됨"이 될 때까지 기다리세요.
- 컬렉션 ID `scores` : `bestScore` 내림차순, `bestScoreAt` 오름차순, 범위 "컬렉션"
- 컬렉션 ID `legacy_scores` : `bestScore` 내림차순, `bestScoreAt` 오름차순, 범위 "컬렉션"
(`rankings` 인덱스는 이미 있음)

### 3단계. 보안 규칙 게시 (전환 기간 모드, 무중단)
1. 콘솔 > Firestore > **규칙** 탭에 `wedding/firestore.rules` 전체를 붙여넣고 **게시**.
2. 이 규칙은 `LEGACY_WRITES_OPEN()` 이 `true` 라서 **옛 페이지도 기존과 똑같은 조건으로 `rankings`에 계속 저장**됩니다.
   새 페이지(`scores`)도 동시에 동작하므로 어느 순간에도 하객이 실패를 겪지 않습니다.
   (전환 기간 동안은 옛 페이지 하객의 전화번호가 기존처럼 `rankings`에 들어갑니다 → 4-1단계에서 닫기)

### 4단계. 클라이언트 배포
1. 브랜치를 `main`에 병합 후 push → GitHub Pages 반영(보통 1~10분).
   스크립트 버전을 올려 두었습니다(`firebase-config.js?v7`, `ranking.js?v7`, `game.js?v8`).
2. 확인(휴대폰 시크릿 창 권장):
   - 게임 1판 → BEST SCORE 숫자 표시
   - 콘솔에서 `scores/{uid}` 생성(전화번호 없음), `contacts/{uid}` 생성 확인
   - 랭킹에 기존 기록 + 새 기록이 함께 표시
   - 기존 참가자가 같은 기기로 다시 하면 본인 화면에서는 높은 기록 하나만 보입니다(다른 사람에겐 6단계 전까지 두 줄로 보일 수 있음).

### 4-1단계. 전환 기간 닫기 (4단계 반영 확인 후 최소 30분 ~ 반나절 뒤)
- GitHub Pages의 HTML 캐시는 최대 10분이지만, 휴대폰 브라우저 탭을 계속 열어 둔 하객이 있을 수 있어 여유를 둡니다.
- 콘솔에서 `rankings` 문서의 갱신 시각이 4단계 이후로 더 이상 바뀌지 않는지(옛 페이지 쓰기 없음) 확인하면 안전합니다.
- `firestore.rules` 에서 `function LEGACY_WRITES_OPEN() { return true; }` → `return false;` 로 바꿔 **게시**.
  (이후 옛 탭을 아주 오래 열어 둔 극소수만 BEST SCORE가 "확인 실패"로 보일 수 있고, 새로고침하면 해소)
- 이 단계를 6단계(마이그레이션) **전에** 해야 마이그레이션 후 레거시에 새 쓰기가 생기지 않습니다.

### 5단계. API 키 제한 (Google Cloud 콘솔)
1. https://console.cloud.google.com > 프로젝트 `my-wedding-invitation-efd31` > **API 및 서비스 > 사용자 인증 정보**
2. "Browser key (auto created by Firebase)"(값 `AIzaSyDgz7…`) 선택
3. **애플리케이션 제한사항**: HTTP 리퍼러 → `https://ardmos.github.io/*` (로컬 테스트가 필요하면 `http://localhost:*/*` 추가)
4. **API 제한사항**: 키 제한 → Cloud Firestore API, Identity Toolkit API, Token Service API, Firebase Installations API, Firebase App Check API
5. 저장 후 **5분 내에 실제 페이지에서 게임/랭킹이 되는지 확인**. 안 되면 API 제한을 "제한하지 않음"으로 되돌리세요.
   (네이버 지도 키는 별개라 영향 없음)

### 6단계. 레거시 데이터 마이그레이션 (전화번호 노출 완전 제거)
Firestore는 문서 일부 필드만 숨길 수 없고, 기존 문서 ID(전화번호 해시)도 전수 대입으로 번호를 역추적할 수 있으므로 **새 랜덤 ID로 옮겨야** 합니다.
클라이언트는 마이그레이션 전/후 모두 정상 동작합니다(`rankings`, `legacy_scores`를 모두 읽고, 읽기가 막히면 조용히 건너뜀).

관리자 PC(PowerShell)에서:
```powershell
mkdir C:\secure\migrate; cd C:\secure\migrate
npm init -y; npm i firebase-admin
copy O:\ardmos.github.io\wedding\tools\migrate-legacy-rankings.mjs .
# 콘솔 > 프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성" → C:\secure\sa.json (절대 커밋/공유 금지)
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure\sa.json"
node migrate-legacy-rankings.mjs backup --out C:\secure\rankings-backup.json
node migrate-legacy-rankings.mjs migrate            # dry-run: 할 일만 출력
node migrate-legacy-rankings.mjs migrate --apply    # 실제 실행
```
- 이미 새 시스템에서 플레이한 사람(같은 전화번호의 `contacts`가 있음)은 `scores/{uid}`로 **병합**(최고점 max, 플레이수 합산)되고,
  나머지는 `legacy_scores/{랜덤ID}`로 **전화번호 없이 복사**됩니다. 대응표는 `legacy_private`(클라이언트 접근 불가)에 저장됩니다.
- **실행 직후** `firestore.rules`에서 `match /rankings/{docId}` 의 `allow read: if true;` 를 `allow read: if false;` 로 바꿔 **게시**하세요.
  (그 전까지 몇십 초간 기존 기록이 두 줄로 보일 수 있음)
- 확인 후 원본 삭제(선택, 백업 확인 후): `node migrate-legacy-rankings.mjs migrate --apply --delete-legacy`
- 마감 전, 시상 전에 한 번 더: `node migrate-legacy-rankings.mjs merge --apply` (이후에 새로 플레이한 기존 참가자 중복 행 정리)
- 끝나면 서비스 계정 키를 콘솔에서 **삭제**하세요.

### 7단계. App Check (reCAPTCHA v3)
1. https://www.google.com/recaptcha/admin 에서 **reCAPTCHA v3** 사이트 등록, 도메인 `ardmos.github.io` → 사이트 키/비밀 키 발급
2. Firebase 콘솔 > **App Check** > 앱 > 웹 앱 선택 > reCAPTCHA v3 > 비밀 키 입력 > 저장
3. `js/firebase-config.js` 의 `APP_CHECK_SITE_KEY` 에 **사이트 키**(공개값) 입력 → `index.html` 의 `firebase-config.js?v7`→`?v8`로 버전 올려 push
   (배지는 CSS로 숨겨져 있고, 키가 설정되면 푸터에 "This site is protected by reCAPTCHA…" 고지가 작게 자동 표시됩니다 — Google 정책상 배지를 숨길 때 필수)
4. App Check > API > Cloud Firestore 의 **지표**에서 "확인된 요청" 비율이 거의 100%가 될 때까지 1일 정도 관찰
5. 그다음 Cloud Firestore **적용(Enforce)**. (Authentication 적용은 선택)
   - 적용 후엔 App Check 없는 요청(콘솔에서 SDK를 직접 붙인 스크립트, REST 직접 호출 등)이 거부됩니다.
   - 로컬 테스트 시 디버그 토큰이 필요합니다(App Check > 디버그 토큰 관리).

### 8단계. 비용/사용량 알림
- 현재 Spark(무료) 요금제라면 과금은 없고 할당량 초과 시 일시 중단됩니다. 콘솔 > **사용량 및 결제**에서 Firestore 읽기/쓰기 추이를 확인하세요.
- Blaze 요금제라면 Google Cloud 콘솔 > **결제 > 예산 및 알림**에서 예산(예: 1,000원/월)과 50%/90%/100% 이메일 알림을 설정하세요.

### 9단계. 행사 후 정리
- 마감 이후 규칙상 쓰기가 자동 차단됩니다. 시상 후 `contacts`(전화번호)는 콘솔에서 내보낸 뒤 **삭제**하고, 백업 JSON도 폐기하세요.

---

## 롤백
- 규칙: 콘솔 규칙 탭의 "이전 버전" 기록에서 직전 버전으로 되돌리기 가능.
- 클라이언트: 병합 커밋을 revert 후 push.
- 마이그레이션은 원본을 지우지 않는 한(`--delete-legacy` 미사용) 언제든 `rankings` read를 다시 `true`로 바꾸면 원상 복구됩니다.

## 남는 한계 (백엔드 없이는 해결 불가)
- 하객 무중단을 위해 **고정 상한(50,000점) 이하의 조작 점수는 규칙으로 막지 못합니다**(세션 경로는 그보다 큰 점수에만 의미가 있음). 정상 최고점 분포를 보고 필요하면 `FALLBACK_CAP()` 을 낮추세요(단, 너무 낮추면 진짜 고득점이 거부되고 대기열에 남습니다). 시상 전 TOP3의 `playCount`, `createdAt`, `bestScoreAt`을 콘솔에서 확인하세요.
- 익명 계정은 브라우저 데이터를 지우면 새로 생기므로 한 사람이 여러 줄을 만들 수 있습니다(App Check가 대량 생성은 억제).
- 마이그레이션 전까지 기존 `rankings`의 전화번호는 계속 공개 상태입니다 → 6단계를 가능한 빨리 진행하세요.
- 저장 대기열은 기기(localStorage)에만 있으므로, 오프라인 상태로 끝낸 뒤 그 기기로 다시 접속하지 않으면 그 점수는 서버에 반영되지 않습니다.
- 전환 기간(3~4-1단계) 동안은 옛 페이지 하객의 기록이 기존 방식(전화번호 포함)으로 저장됩니다.
