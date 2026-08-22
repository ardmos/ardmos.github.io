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

// 설정 값이 채워져 있는지 확인 -> 미설정 시 로컬 스토리지 랭킹으로 자동 폴백
window.__FIREBASE_READY__ = false;
window.__firestoreDB__ = null;

try{
  const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_');
  if (isConfigured && window.firebase) {
    firebase.initializeApp(firebaseConfig);
    window.__firestoreDB__ = firebase.firestore();
    window.__FIREBASE_READY__ = true;
    console.info('[wedding] Firebase 연결됨 - 실시간 랭킹 사용');
  } else {
    console.info('[wedding] Firebase 미설정 - localStorage 랭킹(로컬 테스트 모드)으로 동작합니다.');
  }
}catch(e){
  console.warn('[wedding] Firebase 초기화 실패, 로컬 랭킹으로 폴백합니다.', e);
  window.__FIREBASE_READY__ = false;
}
