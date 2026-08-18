/**
 * firebase-config.js
 * -------------------------------------------------------
 * 본인의 Firebase 프로젝트 설정 값으로 아래 firebaseConfig 를 교체하세요.
 * Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 (SDK 설정 및 구성)에서 확인 가능합니다.
 *
 * Firestore 보안 규칙 예시 (Firestore > 규칙 탭에 붙여넣기):
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /rankings/{docId} {
 *       // 누구나 랭킹을 읽을 수 있음 (단, 클라이언트 쿼리에서 phoneNumber 필드는 노출하지 않도록 처리)
 *       allow read: if true;
 *
 *       // 새 랭킹 문서는 생성 가능, 단 최소 필드 형식 검증
 *       allow create: if request.resource.data.keys().hasAll(['nickname','phoneHash','bestScore'])
 *                     && request.resource.data.nickname is string
 *                     && request.resource.data.nickname.size() <= 10
 *                     && request.resource.data.bestScore is int;
 *
 *       // 기존 문서는 bestScore가 "더 높아지는 경우"에만 갱신 가능 (임의 하향 조작 방지)
 *       allow update: if request.resource.data.bestScore is int
 *                     && request.resource.data.bestScore >= resource.data.bestScore
 *                     && request.resource.data.phoneHash == resource.data.phoneHash;
 *
 *       allow delete: if false;
 *     }
 *   }
 * }
 *
 * 위 규칙은 예시이며, 실제 운영 전 Firebase 문서를 참고해 더 엄격하게 다듬는 것을 권장합니다.
 * (완전한 부정 방지를 위해서는 Cloud Functions를 통한 서버측 검증이 이상적입니다.)
 */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
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
