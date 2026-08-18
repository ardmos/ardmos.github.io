# 지훈 ♥ 서연 모바일 청첩장 (Wedding × Pixel Game)

인트로 → 청첩장 → 미니게임(Cupid Arrow) → 실시간 랭킹으로 이어지는 모바일 청첩장입니다.

## 바로 확인하기
```
cd wedding
python3 -m http.server 8000
```
그 후 스마트폰과 컴퓨터가 같은 네트워크에 있다면 `http://<컴퓨터IP>:8000` 으로 접속해 테스트하세요.
(Firebase를 아직 설정하지 않아도 랭킹은 localStorage로 자동 동작해 바로 테스트 가능합니다.)

## 1. 이미지 에셋 교체
아래 경로에 파일만 넣으면 자동으로 반영됩니다 (없으면 픽셀 스타일 placeholder로 대체되어 깨지지 않습니다).
캔버스는 `image-rendering` 스무딩을 꺼둬서 작은 원본을 확대해도 픽셀이 뭉개지지 않고 또렷하게(blocky) 보입니다 — 그러니 아래 크기 그대로, 혹은 2배(@2x)로 만들어 넣으셔도 좋아요.

| 경로 | 용도 | 권장 픽셀 사이즈 | 비고 |
|---|---|---|---|
| `assets/background.png` | 인트로 배경 하늘 (전체를 덮는 배경) | 750×1000px 내외 (세로형) | 화면을 꽉 채우도록 object-fit:cover로 표시돼요 |
| `assets/title.png` | 상단 타이틀 배너 (없으면 "지훈 ♥ 서연" 텍스트로 대체) | 가로가 긴 형태 (예: 420×140px, 배경 투명) | 화면 상단 중앙에 최대 너비 66%로 표시돼요 |
| `assets/land.png` | 인트로 하단 땅/바닥 | 가로가 긴 형태 (예: 640×140px) | 화면 하단 띠 영역을 가로로 채워요. 없으면 초록 줄무늬로 대체됩니다 |
| `assets/cloud.png` | 구름 (하나의 이미지를 3번 재사용, 좌우로 흘러감) | 190×70px 내외 (배경 투명) | |
| `assets/box.png` | 오른쪽 상단 장식 | 140×140px 내외 (배경 투명) | |
| `assets/toguan.png` | 왼쪽 하단, 땅에 딱 붙어 서는 장식 | 130×180px 내외 (세로형, 배경 투명) | 바닥에 발이 붙도록 이미지 하단에 여백 없이 그려주세요 |
| `assets/groom.png` | 신랑 캐릭터 (터치하면 머리 위에 큰 하트, 바닥에 붙어 서요) | 세로 300~450px (배경 투명 PNG) | |
| `assets/bride.png` | 신부 캐릭터 (터치하면 머리 위에 큰 하트, 바닥에 붙어 서요) | 세로 300~450px (배경 투명 PNG) | |
| `assets/bora.png` | 강아지 보라 (땅에 딱 붙어 걸어다녀요) | 세로 200~300px (배경 투명 PNG) | |
| `assets/heart.png`, `assets/heart2.png` | 터치 시 나오는 하트 파티클 (두 종류가 번갈아 나와요) | 32×32px 내외 (배경 투명) | 신랑/신부를 터치하면 3배 크기로 표시돼요. 이미지가 없으면 자동으로 ❤ 이모지로 대체됩니다 |
| `assets/star.png` | 보라를 5번 연속 터치하면 나오는 스타 파티클 | 32×32px 내외 (배경 투명) | 없으면 ★ 이모지로 대체됩니다 |
| `assets/target.png` | 게임 과녁 | **88×88px** (정사각형, 배경 투명) | 정중앙이 게임 로직상 100점 위치예요. 동심원을 그려서 중심~외곽 순서로 점수가 매겨지는 걸 시각적으로 보여주면 좋아요 |
| `assets/bow.png` | 게임 활 | **40×60px** (세로형, 배경 투명) | **위쪽(화살이 날아가는 방향)을 바라보는 모양**으로 그려주세요 — 시위가 위쪽, 활대가 아래로 휘는 형태 |
| `assets/arrow.png` | 게임 화살 | **10×34px** (세로형, 배경 투명) | 화살촉이 **위쪽**을 향하도록 그려주세요 |
| `assets/gallery/01.jpg` ~ `20.jpg` | 갤러리 사진 (5열 그리드, 한두 장만 살짝 크게) | 정사각형에 가깝게 (예: 600×600px) | 개수·빈도는 `js/invitation.js`의 `GALLERY_COUNT`/`FEATURED_EVERY`에서 수정 |

> target/bow/arrow/heart/star 등은 위 사이즈의 1배로 만드셔도 되고, 더 또렷하게 보이길 원하시면 2배로 만들어서 같은 파일명으로 넣으셔도 자동으로 맞는 크기에 맞춰 그려집니다.

## 2. 문구/정보 수정
`index.html` 안에서 이름, 날짜, 장소, 계좌번호, 연락처 등을 그대로 검색해서 바꾸면 됩니다.
- 날짜/카운트다운은 `js/invitation.js`의 `WEDDING_DATE` 값도 함께 수정하세요.
- 인트로 대화창 문구는 `js/intro.js`의 `DIALOG_LINES` 배열에서 수정합니다.

## 3. Firebase 랭킹 연결
1. https://console.firebase.google.com 에서 프로젝트 생성 → Firestore Database 사용 설정
2. `js/firebase-config.js` 상단 `firebaseConfig` 값을 본인 프로젝트 값으로 교체
3. 같은 파일 상단 주석에 있는 Firestore 보안 규칙 예시를 Firestore > 규칙 탭에 붙여넣기
   - 한 명(휴대폰번호 해시)당 하나의 문서만 생성되고, `bestScore`는 더 높아지는 경우에만 갱신되도록 설계되어 있습니다.
   - 더 강력한 부정 방지가 필요하면 Cloud Functions를 통한 서버측 점수 검증을 추가하는 것을 권장합니다.
4. 설정을 채우면 자동으로 `window.__FIREBASE_READY__ = true`가 되어 실시간 랭킹으로 전환됩니다. 값을 채우지 않으면 계속 로컬 모드로 동작합니다(각자 브라우저 안에서만 랭킹이 쌓이며, 실제 서비스에는 적합하지 않습니다).

## 4. 네이버 지도 연결
오시는 길의 지도는 네이버 지도 API v3(공식 SDK 임베드 방식)를 사용합니다. 클라이언트 아이디를 넣기 전까지는 "MAP" placeholder가 대신 표시돼요.
1. https://console.ncloud.com 에서 무료로 가입 → Maps > Application 등록 (Web 서비스 URL에 배포할 도메인 등록)
2. 발급받은 Client ID를 `index.html` 맨 아래쪽의 아래 스크립트 태그에서 `YOUR_NAVER_MAP_CLIENT_ID` 부분에 넣기
   ```html
   <script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_NAVER_MAP_CLIENT_ID"></script>
   ```
3. 지도 중심 좌표/장소명은 `js/invitation.js`의 `VENUE` 값에서 수정할 수 있습니다 (현재 더메리든 좌표로 설정되어 있어요).

## 5. 배포
정적 파일이라 Firebase Hosting / Netlify / Vercel / Cafe24 등 아무 정적 호스팅에 폴더 전체를 올리면 됩니다.
Firebase Hosting을 함께 쓸 경우:
```
npm install -g firebase-tools
firebase login
firebase init hosting   # public 디렉터리를 이 폴더로 지정
firebase deploy
```

## 6. 파일 구조
```
index.html            전체 마크업
css/style.css          전체 스타일
js/firebase-config.js  Firebase 초기화 + 보안 규칙 예시(주석)
js/ranking.js          플레이어 정보 입력, 점수 등록/조회(Firestore ↔ 로컬 폴백), TOP100 렌더링
js/intro.js            로딩 → 인트로 등장 → 타이핑 대화창 → 보라 이스터에그
js/invitation.js        스크롤 reveal, 갤러리 라이트박스, 아코디언, 계좌 복사, D-day
js/game.js             Cupid Arrow 캔버스 게임
js/app.js              전체 초기화 진입점
assets/                이미지 에셋 (위 표 참고)
```

## 7. 참고: 게임 조작 방식
화살은 항상 화면 하단 중앙에서 수직으로만 발사됩니다. 활을 꾹 누르고 있으면 화살이 아래로 당겨지고, 손을 떼는 순간 발사돼요 — **살짝 눌렀다 떼면 느리게, 꾹 눌러 오래 당길수록 빠르게** 날아갑니다(약 0.65초 이상 누르면 최대 속도). 발사 후에는 스냅으로 순간 가속했다가 살짝 감속하며 순항하는 자연스러운 속도 곡선으로 날아가요.

과녁을 맞히면 화살이 그 자리에 잠깐(약 0.5초) 꽂힌 채 멈춰서 어디에 맞았는지 보여준 뒤 다음 과녁이 등장합니다. **맞힐 때마다 라운드가 즉시 1씩 올라가며** 과녁 이동 속도도 함께 빨라지고, 최소 20라운드까지(사실상 그 이후로도) 계속 어려워집니다(단, 너무 빨라 플레이가 불가능해지지 않도록 최고 속도에는 안전선이 있어요).
