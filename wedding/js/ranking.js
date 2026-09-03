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
  // 전체 참가자를 다 보여주기 위한 쿼리 상한선(안전마진). 실제 참가자는 200명 내외로
  // 예상되지만, 혹시 모를 초과 상황에 대비해 넉넉하게 잡아둠. 더 이상 "상위 N명만
  // 보여준다"는 의미의 제한이 아니라, 문서를 무한정 가져오지 않기 위한 안전장치임.
  const RANKING_QUERY_LIMIT = 300;

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
      .limit(RANKING_QUERY_LIMIT);
  }

  function entriesFromSnapshot(snap){
    const entries = [];
    snap.forEach(doc => {
      const d = doc.data();
      entries.push({
        id: doc.id,
        nickname: d.nickname,
        bestScore: d.bestScore,
        bestScoreAt: d.bestScoreAt,
        playCount: d.playCount || 0
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

  // ---------- 랭킹 렌더 ----------
  // 예전에는 상위 15명만 가져왔기 때문에 내가 그 밖에 있으면 순위 계산을 위해
  // Firestore에 별도로 2번(higher count, tie count) 쿼리를 더 날려야 했습니다.
  // 이제는 rankingQuery()가 참가자 전원(RANKING_QUERY_LIMIT 이내)을 한 번에 받아오므로,
  // 이미 받아온 entries 배열 안에서 내 위치를 찾기만 하면 되고, 추가 서버 조회는
  // 필요 없습니다 (아래 renderMyRankingRow 참고).
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

  /**
   * 리스트(.ranking-scroll) 바깥에 항상 고정으로 보이는 "내 순위" 요약 행.
   * 이제 rankingQuery()가 참가자 전원을 받아오므로, 별도 서버 조회 없이 이미
   * 받아온 entries 배열에서 내 위치를 찾기만 하면 됩니다. 상위 몇 등인지와
   * 무관하게(1등이어도) 항상 표시해서, 리스트를 아무리 스크롤해도 내 순위가
   * 계속 눈에 보이도록 합니다.
   */
  function renderMyRankingRow(player, entries){
    const myRowEl = document.getElementById('myRankingRow');
    if (!myRowEl) return;

    if (!player){
      myRowEl.hidden = true;
      return;
    }

    const myIndex = entries.findIndex(e => e.id === player.phoneHash);
    if (myIndex < 0){
      // 아직 점수를 등록하지 않았거나(플레이 전) 조회에 포함되지 않은 경우
      myRowEl.hidden = true;
      return;
    }

    const myEntry = entries[myIndex];
    myRowEl.innerHTML = `
      <span class="col-rank">${myIndex + 1}</span>
      <span class="col-name">${escapeHtml(myEntry.nickname)} (나)</span>
      <span class="col-score">${myEntry.bestScore.toLocaleString()}</span>
    `;
    myRowEl.hidden = false;
  }

  function applyEntries(entries){
    const player = getPlayerInfo();
    renderRankingList(entries, player);
    renderMyRankingRow(player, entries);
    renderCupidCount(entries);
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

  // ---------- 큐피드(누적 플레이 횟수) ----------
  // "지금까지 다녀간 큐피드 수"는 더 이상 참가자 수(문서 개수)가 아니라, 모든
  // 참가자의 playCount(각자 플레이한 횟수)를 합산한 값입니다 - 예: 한 명이 150번,
  // 다른 한 명이 20번 플레이했다면 총 170번. rankingQuery()가 이제 참가자 전원을
  // 한 번에 가져오기 때문에, 그 entries에 이미 담긴 playCount만 더하면 되고
  // 별도의 Firestore 조회는 필요 없습니다(예전엔 컬렉션 전체를 한 번 더 읽었음).
  function renderCupidCount(entries){
    const noteEl = document.getElementById('cupidCountNote');
    const valEl = document.getElementById('cupidCountVal');
    if (!noteEl || !valEl) return;

    if (!entries){
      noteEl.hidden = true;
      return;
    }
    const total = entries.reduce((sum, e) => sum + (e.playCount || 0), 0);
    valEl.textContent = total.toLocaleString();
    noteEl.hidden = false;
  }

  // ---------- 랭킹 조회 (일회성) ----------
  // 서버 조회 실패/미준비 시 로컬 데이터로 대체하지 않고 에러 상태를 표시합니다.
  async function loadAndRenderRanking(){
    showRankingLoading();
    updateRankingNote();
    renderCupidCount(null);

    if (!window.__FIREBASE_READY__){
      renderRankingError();
      return;
    }

    try{
      const snap = await rankingQuery(window.__firestoreDB__).get();
      applyEntries(entriesFromSnapshot(snap));
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
    renderCupidCount(null);

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
