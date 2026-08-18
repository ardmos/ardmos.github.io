/**
 * app.js
 * 전체 모듈 초기화 진입점
 */
document.addEventListener('DOMContentLoaded', () => {
  WeddingIntro.start();
  WeddingInvitation.start();
  WeddingGame.start();
  WeddingRanking.loadAndRenderRanking();
});
