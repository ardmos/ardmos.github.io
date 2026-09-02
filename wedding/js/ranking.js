/**
 * ranking.js
 * 플레이어(닉네임/휴대폰) 정보는 기존처럼 localStorage에 저장/조회합니다.
 * 점수는 Firestore(서버)가 유일한 Source of Truth입니다 - 점수를 로컬에 저장하거나
 * 서버 조회 실패 시 로컬 값으로 대체하는 로직은 존재하지 않습니다.
 * 서버 조회/제출 실패 시에는 null을 반환하며, 호출부는 이를 "확인 불가/실패" 상태로 표시해야 합니다.
 */
const WeddingRanking = (() => {
  const LS_PLAYER_KEY = 'wedding_player_info';
  const COLLECTION = 'rankings';
  const RANKING_DEADLINE = new Date('2026-11-01T11:00:00+09:00');
  const RANKING_LIMIT = 15;

  let rankingUnsubscribe = null;
  let rankingObserver = null;

  // ---------- 유틸 ----------
  function simpleHash(str){
    let h = 0;
    for (let i = 0; i < str.length; i++){
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return 'p' + Math.abs(h).toString(36);
  }

  function normalizePhone(v){
    return v.replace(/[^0-9]/g, '');
  }

  function isValidKoreanPhone(v){
    const digits = normalizePhone(v);
    return /^01[0-9]{8,9}$/.test(digits);
  }

  function formatPhoneInput(v){
    const d = normalizePhone(v).slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0,3)}-${d.slice(3)}`;
    return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  }

  function isRankingClosed(){
    return Date.now() >= RANKING_DEADLINE.getTime();
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function rankingQuery(db){
    return db.collection(COLLECTION)
      .orderBy('bestScore', 'desc')
      .orderBy('bestScoreAt', 'asc')
      .limit(RANKING_LIMIT);
  }

  function entriesFromSnapshot(snap){
    const entries = [];
    snap.forEach(doc => {
      const d = doc.data();
      entries.push({
        id: doc.id,
        nickname: d.nickname,
        bestScore: d.bestScore,
        bestScoreAt: d.bestScoreAt
      });
    });
    return entries;
  }

  // ---------- 플레이어 정보 ----------
  function getPlayerInfo(){
    try{
      const raw = localStorage.getItem(LS_PLAYER_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }

  function savePlayerInfo(nickname, phone){
    const digits = normalizePhone(phone);
    const info = { nickname, phoneDigits: digits, phoneHash: simpleHash(digits) };
    localStorage.setItem(LS_PLAYER_KEY, JSON.stringify(info));
    return info;
  }

  // ---------- 모달 ----------
  function openPlayerModal(onDone){
    const overlay = document.getElementById('playerModal');
    const nicknameInput = document.getElementById('nicknameInput');
    const phoneInput = document.getElementById('phoneInput');
    const submitBtn = document.getElementById('playerSubmitBtn');
    const errorEl = document.getElementById('playerFormError');

    overlay.hidden = false;
    nicknameInput.value = '';
    phoneInput.value = '';
    errorEl.hidden = true;
    setTimeout(() => nicknameInput.focus(), 50);

    phoneInput.oninput = () => {
      phoneInput.value = formatPhoneInput(phoneInput.value);
    };

    submitBtn.onclick = () => {
      const nickname = nicknameInput.value.trim();
      const phone = phoneInput.value.trim();

      if (!nickname){
        showError('닉네임을 입력해주세요.');
        return;
      }
      if (nickname.length > 10){
        showError('닉네임은 최대 10글자까지 가능해요.');
        return;
      }
      if (!isValidKoreanPhone(phone)){
        showError('올바른 휴대폰 번호를 입력해주세요.');
        return;
      }
      savePlayerInfo(nickname, phone);
      overlay.hidden = true;
      onDone && onDone();
    };

    function showError(msg){
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }
  }

  /**
   * 플레이어 정보가 있으면 바로 콜백(onReady(info, false)), 없으면 모달을 띄운 뒤
   * 콜백(onReady(info, true))을 호출합니다. 두 번째 인자는 "이번에 방금 정보를
   * 새로 입력했는지"를 나타내며, 최초 진입 튜토리얼을 띄울지 판단하는 데 쓰입니다.
   */
  function ensurePlayerInfo(onReady){
    const info = getPlayerInfo();
    if (info) { onReady(info, false); return; }
    openPlayerModal(() => onReady(getPlayerInfo(), true));
  }

  // ---------- 점수 조회 (서버가 유일한 Source of Truth) ----------
  // 점수는 절대 localStorage에 저장/조회하지 않습니다. 서버(Firestore) 응답만 신뢰하며,
  // 서버 조회에 실패하면 로컬 값으로 대체하지 않고 실패(null)를 그대로 반환합니다.
  // 호출부(ranking.js 내부 / game.js)는 null을 "확인 불가" 상태로 처리해야 합니다.
  async function getExistingBestScore(player){
    if (!player) return null;
    if (!window.__FIREBASE_READY__) return null; // 서버 미준비 -> 로컬 폴백 금지

    try{
      const doc = await window.__firestoreDB__.collection(COLLECTION).doc(player.phoneHash).get();
      return doc.exists ? doc.data().bestScore : 0;
    }catch(e){
      console.warn('[wedding] 기존 점수 조회 실패', e);
      return null; // 실패 -> 로컬 값 대신 "확인 불가" 상태
    }
  }

  // ---------- 점수 제출 ----------
  // 반환값: 성공 시 서버가 판단한 최신 bestScore(숫자), 실패/서버 미준비 시 null.
  // null인 경우 로컬 값으로 절대 대체하지 않으며, 호출부(game.js)가 "확인 불가/실패" 상태를 표시해야 합니다.
  async function submitScore(score){
    const player = getPlayerInfo();
    if (!player) return null;

    if (isRankingClosed()){
      return getExistingBestScore(player);
    }

    if (!window.__FIREBASE_READY__) return null; // 서버 미준비 -> 로컬 저장하지 않고 실패 반환

    const { nickname, phoneDigits, phoneHash } = player;
    const now = Date.now();
    const db = window.__firestoreDB__;
    const ref = db.collection(COLLECTION).doc(phoneHash);

    try{
      const result = await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        if (!doc.exists){
          const data = {
            nickname, phoneNumber: phoneDigits,
            bestScore: score, lastScore: score, playCount: 1,
            bestScoreAt: now, createdAt: now, updatedAt: now
          };
          tx.set(ref, data);
          return data;
        }
        const existing = doc.data();
        const isNewBest = score > existing.bestScore;
        const data = {
          nickname, phoneNumber: phoneDigits,
          bestScore: isNewBest ? score : existing.bestScore,
          lastScore: score,
          playCount: (existing.playCount || 0) + 1,
          bestScoreAt: isNewBest ? now : existing.bestScoreAt,
          createdAt: existing.createdAt || now,
          updatedAt: now
        };
        tx.set(ref, data, { merge: true });
        return data;
      });
      return result.bestScore;
    }catch(e){
      console.warn('[wedding] Firestore 점수 등록 실패', e);
      return null; // 실패 -> 로컬 저장 없이 실패를 그대로 알림
    }
  }

  // ---------- 순위 계산 (100위 밖) ----------
  // 서버 조회 실패/미준비 시 null 반환 (로컬 계산으로 대체하지 않음)
  async function computeRank(bestScore, bestScoreAt, phoneHash){
    if (!window.__FIREBASE_READY__) return null;
    try{
      const db = window.__firestoreDB__;
      const [higherSnap, tieSnap] = await Promise.all([
        db.collection(COLLECTION).where('bestScore', '>', bestScore).get(),
        db.collection(COLLECTION).where('bestScore', '==', bestScore).where('bestScoreAt', '<', bestScoreAt).get()
      ]);
      return higherSnap.size + tieSnap.size + 1;
    }catch(e){
      console.warn('[wedding] Firestore 순위 계산 실패', e);
      return null;
    }
  }

  // 서버 조회 실패/미준비 시 null 반환 (로컬 기록으로 대체하지 않음)
  async function getMyRecord(player){
    if (!player) return null;
    if (!window.__FIREBASE_READY__) return null;

    try{
      const doc = await window.__firestoreDB__.collection(COLLECTION).doc(player.phoneHash).get();
      if (!doc.exists) return null;
      const d = doc.data();
      return {
        nickname: d.nickname,
        bestScore: d.bestScore,
        bestScoreAt: d.bestScoreAt
      };
    }catch(e){
      console.warn('[wedding] 내 기록 조회 실패', e);
      return null;
    }
  }

  // ---------- 랭킹 렌더 ----------
  function renderRankingError(){
    const listEl = document.getElementById('rankingList');
    const myRowEl = document.getElementById('myRankingRow');
    const retryBtn = document.getElementById('rankingRetryBtn');
    if (listEl){
      listEl.innerHTML = '<li class="ranking-loading ranking-error">랭킹을 불러오지 못했습니다. 네트워크 상태를 확인해주세요.</li>';
    }
    if (myRowEl) myRowEl.hidden = true;
    if (retryBtn) retryBtn.hidden = false;
  }

  function renderRankingList(entries, player){
    const listEl = document.getElementById('rankingList');
    const retryBtn = document.getElementById('rankingRetryBtn');
    if (retryBtn) retryBtn.hidden = true;
    if (!listEl) return;

    if (!entries.length){
      listEl.innerHTML = '<li class="ranking-loading">아직 등록된 기록이 없어요. 첫 기록의 주인공이 되어보세요!</li>';
      return;
    }

    const myHash = player ? player.phoneHash : null;

    listEl.innerHTML = entries.map((e, i) => {
      const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      const meClass = (myHash && e.id === myHash) ? 'is-me' : '';
      const classAttr = [rankClass, meClass].filter(Boolean).join(' ');
      return `
      <li class="${classAttr}">
        <span class="col-rank">${i + 1}</span>
        <span class="col-name">${escapeHtml(e.nickname)}</span>
        <span class="col-score">${e.bestScore.toLocaleString()}</span>
      </li>
    `;
    }).join('');
  }

  async function renderMyRankingRow(player, entries){
    const myRowEl = document.getElementById('myRankingRow');
    if (!myRowEl) return;

    if (!player){
      myRowEl.hidden = true;
      return;
    }

    const myIndex = entries.findIndex(e => e.id === player.phoneHash);
    if (myIndex >= 0 && myIndex < RANKING_LIMIT){
      myRowEl.hidden = true;
      return;
    }

    const myRecord = await getMyRecord(player);
    if (!myRecord){
      myRowEl.hidden = true;
      return;
    }

    const rank = await computeRank(myRecord.bestScore, myRecord.bestScoreAt, player.phoneHash);
    if (!rank){
      myRowEl.hidden = true;
      return;
    }

    myRowEl.innerHTML = `
      <span class="col-rank">${rank}</span>
      <span class="col-name">${escapeHtml(myRecord.nickname)} (나)</span>
      <span class="col-score">${myRecord.bestScore.toLocaleString()}</span>
    `;
    myRowEl.hidden = false;
  }

  async function applyEntries(entries){
    const player = getPlayerInfo();
    renderRankingList(entries, player);
    await renderMyRankingRow(player, entries);
  }

  function updateRankingNote(){
    const noteEl = document.getElementById('rankingNote');
    if (!noteEl) return;

    const base = 'TOP3 세 분께는 소정의 축하 선물이 준비되어 있습니다! <br>결혼식 중 현장에서 선물 증정 이벤트가 있을 예정이니 꼭 참여해주세요 :)';
    if (isRankingClosed()){
      noteEl.innerHTML = `${base}<br><strong>게임 랭킹 등록이 마감되었습니다.</strong> 아래는 최종 순위이며, 게임은 계속 즐기실 수 있어요!`;
    } else {
      noteEl.innerHTML = `${base}<br>게임 랭킹 기록은 예식 당일 오전 11시에 마감됩니다. 그때까지 마음껏 즐겨주세요!`;
    }
  }

  function showRankingLoading(){
    const listEl = document.getElementById('rankingList');
    const myRowEl = document.getElementById('myRankingRow');
    if (listEl) listEl.innerHTML = '<li class="ranking-loading">랭킹 불러오는 중...</li>';
    if (myRowEl) myRowEl.hidden = true;
  }

  // ---------- 큐피드(참여자) 총 인원수 ----------
  // 랭킹 TOP15와 별개로, rankings 컬렉션 전체 문서 수(=지금까지 게임에 참여해 점수를 등록한 총 인원)를
  // Firestore 집계 쿼리(count())로 가볍게 조회합니다. 조회 실패/서버 미준비 시에는 어색한 숫자
  // 대신 문구 자체를 숨깁니다(로컬 값으로 대체하지 않음).
  async function getTotalPlayerCount(){
    if (!window.__FIREBASE_READY__) return null;
    try{
      const snap = await window.__firestoreDB__.collection(COLLECTION).count().get();
      return snap.data().count;
    }catch(e){
      console.warn('[wedding] 큐피드 참여자 수 조회 실패', e);
      return null;
    }
  }

  async function renderCupidCount(){
    const noteEl = document.getElementById('cupidCountNote');
    const valEl = document.getElementById('cupidCountVal');
    if (!noteEl || !valEl) return;

    const total = await getTotalPlayerCount();
    if (total === null){
      noteEl.hidden = true;
      return;
    }
    valEl.textContent = total.toLocaleString();
    noteEl.hidden = false;
  }

  // ---------- 랭킹 조회 (일회성) ----------
  // 서버 조회 실패/미준비 시 로컬 데이터로 대체하지 않고 에러 상태를 표시합니다.
  async function loadAndRenderRanking(){
    showRankingLoading();
    updateRankingNote();
    renderCupidCount();

    if (!window.__FIREBASE_READY__){
      renderRankingError();
      return;
    }

    try{
      const snap = await rankingQuery(window.__firestoreDB__).get();
      await applyEntries(entriesFromSnapshot(snap));
    }catch(e){
      console.warn('[wedding] Firestore 랭킹 조회 실패', e);
      renderRankingError();
    }
  }

  // ---------- 실시간 구독 ----------
  function stopRankingListener(){
    if (rankingUnsubscribe){
      rankingUnsubscribe();
      rankingUnsubscribe = null;
    }
  }

  function startRankingListener(){
    stopRankingListener();
    showRankingLoading();
    updateRankingNote();
    renderCupidCount();

    if (!window.__FIREBASE_READY__){
      renderRankingError();
      return;
    }

    try{
      rankingUnsubscribe = rankingQuery(window.__firestoreDB__).onSnapshot(
        (snap) => {
          applyEntries(entriesFromSnapshot(snap));
        },
        (e) => {
          console.warn('[wedding] Firestore 실시간 랭킹 실패', e);
          renderRankingError();
        }
      );
    }catch(e){
      console.warn('[wedding] Firestore 리스너 시작 실패', e);
      renderRankingError();
    }
  }

  /** 랭킹 다시 시도 버튼에서 호출 */
  function retryRanking(){
    startRankingListener();
  }

  function setupRankingObserver(){
    const section = document.getElementById('ranking');
    if (!section || rankingObserver) return;

    rankingObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting){
          startRankingListener();
        } else {
          stopRankingListener();
        }
      });
    }, { threshold: 0.1 });

    rankingObserver.observe(section);
  }

  function setupRetryButton(){
    const btn = document.getElementById('rankingRetryBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      btn.hidden = true;
      retryRanking();
    });
  }

  function init(){
    updateRankingNote();
    setupRankingObserver();
    setupRetryButton();
  }

  return {
    getPlayerInfo,
    ensurePlayerInfo,
    submitScore,
    getExistingBestScore,
    loadAndRenderRanking,
    isRankingClosed,
    isValidKoreanPhone,
    init
  };
})();
