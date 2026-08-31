/**
 * firebase-config.js
 * -------------------------------------------------------
 * 본인의 Firebase 프로젝트 설정 값으로 아래 firebaseConfig 를 교체하세요.
 * Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 (SDK 설정 및 구성)에서 확인 가능합니다.
 *
 * Firestore 보안 규칙 (Firestore > 규칙 탭에 붙여넣기):
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /rankings/{docId} {
 *       allow read: if true;
 *       allow create: if request.resource.data.keys().hasAll(['nickname','phoneNumber','bestScore'])
 *                     && request.resource.data.nickname is string
 *                     && request.resource.data.nickname.size() <= 10
 *                     && request.resource.data.nickname.size() >= 1
 *                     && request.resource.data.phoneNumber is string
 *                     && request.resource.data.bestScore is int
 *                     && request.resource.data.bestScore >= 0;
 *       allow update: if request.resource.data.bestScore is int
 *                     && request.resource.data.bestScore >= resource.data.bestScore
 *                     && request.resource.data.phoneNumber == resource.data.phoneNumber;
 *       allow delete: if false;
 *     }
 *   }
 * }
 *
 * 복합 인덱스 (Firestore > 색인 탭, 또는 첫 쿼리 실패 시 콘솔 링크):
 *   컬렉션: rankings
 *   필드: bestScore 내림차순, bestScoreAt 오름차순
 *
 * 완전한 부정 방지(점수·마감 시각)를 위해서는 Cloud Functions 서버 검증을 권장합니다.
 */

const firebaseConfig = {
  apiKey: "AIzaSyDgz7J1HjCr5ppu5S1aDMNl90At1AEqVrE",
  authDomain: "my-wedding-invitation-efd31.firebaseapp.com",
  projectId: "my-wedding-invitation-efd31",
  storageBucket: "my-wedding-invitation-efd31.firebasestorage.app",
  messagingSenderId: "55110431204",
  appId: "1:55110431204:web:e036cd73ca856e25fd17f1"
};

// 설정 값이 채워져 있는지 확인.
// 점수는 서버(Firestore)가 유일한 Source of Truth이므로, __FIREBASE_READY__가 false인 동안
// ranking.js/game.js는 점수를 로컬로 대체하지 않고 "확인 불가/실패" 상태를 그대로 표시합니다.
window.__FIREBASE_READY__ = false;
window.__firestoreDB__ = null;

try{
  const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_');
  if (isConfigured && window.firebase) {
    firebase.initializeApp(firebaseConfig);
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
