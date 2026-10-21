/**
 * firebase-config.js
 * -------------------------------------------------------
 * Firebase 초기화 + (선택) App Check 활성화.
 *
 * 보안 규칙은 이 폴더의 firestore.rules 파일이 원본입니다. Firebase 콘솔 > Firestore > 규칙 탭에
 * 그 내용을 그대로 붙여넣어 게시하세요. 배포 순서와 마이그레이션은 SECURITY.md 참고.
 *
 * 요약:
 *   - scores/{uid}       공개 랭킹(전화번호 없음). 익명 인증 uid 본인만 쓰기, 삭제 불가.
 *                        필드 화이트리스트/타입/닉네임 1~10자/점수 상한(게임 경과 시간 기반)/
 *                        서버 시각 마감(2026-11-01 11:00 KST)/연속 쓰기 간격 제한.
 *   - contacts/{uid}     경품 연락용 전화번호. 본인 쓰기 전용, 클라이언트 읽기 불가.
 *   - rankings/{hash}    기존(레거시) 기록. 읽기 전용(쓰기 전면 차단). 마이그레이션 후 읽기도 차단.
 *   - legacy_scores/{id} 마이그레이션으로 만든 레거시 사본(전화번호 제거). 읽기 전용.
 *
 * 복합 인덱스 (bestScore 내림차순, bestScoreAt 오름차순): rankings, scores, legacy_scores 각각.
 *
 * 참고: 백엔드 없이는 "그럴듯한 범위 안의 조작 점수"까지 완전히 막을 수는 없습니다.
 */

const firebaseConfig = {
  apiKey: "AIzaSyDgz7J1HjCr5ppu5S1aDMNl90At1AEqVrE",
  authDomain: "my-wedding-invitation-efd31.firebaseapp.com",
  projectId: "my-wedding-invitation-efd31",
  storageBucket: "my-wedding-invitation-efd31.firebasestorage.app",
  messagingSenderId: "55110431204",
  appId: "1:55110431204:web:e036cd73ca856e25fd17f1"
};

// reCAPTCHA v3 사이트 키 (공개값). 예: '6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
const APP_CHECK_SITE_KEY = '';

// 설정 값이 채워져 있는지 확인.
// 점수는 서버(Firestore)가 유일한 Source of Truth이므로, __FIREBASE_READY__가 false인 동안
// ranking.js/game.js는 점수를 로컬로 대체하지 않고 "확인 불가/실패" 상태를 그대로 표시합니다.
window.__FIREBASE_READY__ = false;
window.__firestoreDB__ = null;

try{
  const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_');
  if (isConfigured && window.firebase) {
    firebase.initializeApp(firebaseConfig);
    // App Check(reCAPTCHA v3): 콘솔에서 사이트 키를 발급받아 APP_CHECK_SITE_KEY에 넣으면 활성화됩니다.
    // 비워 두면 건너뜁니다. 콘솔에서 "적용(Enforce)"은 SECURITY.md 순서대로 마지막에 켜세요.
    if (APP_CHECK_SITE_KEY && firebase.appCheck){
      try{
        firebase.appCheck().activate(APP_CHECK_SITE_KEY, true);
      }catch(e){
        console.warn('[wedding] App Check 활성화 실패', e);
      }
    }
    window.__firestoreDB__ = firebase.firestore();
    window.__FIREBASE_READY__ = true;
    console.info('[wedding] Firebase 연결됨 - 서버 랭킹 사용');
  } else {
    console.warn('[wedding] Firebase 미설정 - 점수 기능은 "확인 불가" 상태로 표시됩니다 (로컬 폴백 없음).');
  }
}catch(e){
  console.warn('[wedding] Firebase 초기화 실패 - 점수 기능은 "확인 불가" 상태로 표시됩니다 (로컬 폴백 없음).', e);
  window.__FIREBASE_READY__ = false;
}
