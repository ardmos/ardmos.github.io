/**
 * ranking.js
 * 플레이어(닉네임/휴대폰) 정보는 기존처럼 localStorage에 저장/조회합니다.
 * 점수는 Firestore(서버)가 유일한 Source of Truth입니다 - 점수를 로컬에 저장하거나
 * 서버 조회 실패 시 로컬 값으로 대체하는 로직은 존재하지 않습니다.
 * 서버 조회/제출 실패 시에는 null을 반환하며, 호출부는 이를 "확인 불가/실패" 상태로 표시해야 합니다.
 */
const WeddingRanking = (() => {
  const LS_PLAYER_KEY = 'wedding_player_info';
  // 새 공개 랭킹: scores/{익명 uid} (전화번호 없음, 본인만 쓰기)
  const COLLECTION = 'scores';
  // 기존(레거시) 랭킹: rankings/{phoneHash} - 읽기 전용으로 계속 표시. 마이그레이션 후에는
  // 전화번호를 뺀 사본이 legacy_scores/{랜덤ID} 로 옮겨지고 rankings 읽기는 막힙니다.
  const LEGACY_COLLECTION = 'rankings';
  const LEGACY_COPY_COLLECTION = 'legacy_scores';
  // 경품 연락용 연락처 (쓰기 전용, 누구도 클라이언트에서 읽을 수 없음)
  const CONTACTS_COLLECTION = 'contacts';
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

  function toScore(v){
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function toMillis(v){
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    const n = Number(v);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  }

  function rankingQuery(db, collection){
    return db.collection(collection)
      .orderBy('bestScore', 'desc')
      .orderBy('bestScoreAt', 'asc')
      .limit(RANKING_QUERY_LIMIT);
  }

  function entriesFromSnapshot(snap, source){
    const entries = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      const bestScore = toScore(d.bestScore);
      // 새 컬렉션은 게임 시작 시 0점 문서가 먼저 생기므로 0점은 표시하지 않음
      if (source === COLLECTION && bestScore <= 0) return;
      entries.push({
        id: doc.id,
        source,
        nickname: String(d.nickname == null ? '' : d.nickname).slice(0, 10),
        bestScore,
        bestScoreAt: toMillis(d.bestScoreAt),
        playCount: Math.max(0, Math.floor(Number(d.playCount) || 0))
      });
    });
    return entries;
  }

  // 새 scores + 레거시(rankings / legacy_scores)를 합쳐 점수 내림차순, 동점은 먼저 달성한 순
  function mergeEntries(lists){
    const player = getPlayerInfo();
    const uid = currentUid();
    let all = [].concat(...lists.map(l => l || []));
    // 내 새 기록과 내 레거시 기록(같은 phoneHash)이 둘 다 있으면 높은 쪽 하나만 남김
    const mineNew = all.find(e => e.source === COLLECTION && uid && e.id === uid);
    const mineLegacy = all.find(e => e.source === LEGACY_COLLECTION && player && e.id === player.phoneHash);
    if (mineNew && mineLegacy){
      const keep = mineNew.bestScore >= mineLegacy.bestScore ? mineNew : mineLegacy;
      const drop = keep === mineNew ? mineLegacy : mineNew;
      keep.playCount += drop.playCount;
      all = all.filter(e => e !== drop);
    }
    all.sort((a, b) => (b.bestScore - a.bestScore) || (a.bestScoreAt - b.bestScoreAt));
    return all.slice(0, RANKING_QUERY_LIMIT);
  }

  function isMine(e, player){
    const uid = currentUid();
    if (e.source === COLLECTION) return !!uid && e.id === uid;
    if (e.source === LEGACY_COLLECTION) return !!player && e.id === player.phoneHash;
    return false;
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

  // ---------- Firebase 익명 인증 ----------
  // 새 랭킹(scores/{uid})은 익명 인증 uid를 문서 ID로 써서 "자기 문서만" 쓸 수 있게 합니다.
  let authPromise = null;
  function ensureAuth(){
    if (!window.__FIREBASE_READY__ || !window.firebase || !firebase.auth) return Promise.resolve(null);
    if (authPromise) return authPromise;
    const auth = firebase.auth();
    authPromise = new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged((user) => {
        if (user){ unsub(); resolve(user); }
      });
      auth.signInAnonymously().catch((e) => {
        console.warn('[wedding] 익명 로그인 실패', e);
        unsub(); authPromise = null; resolve(null);
      });
    });
    return authPromise;
  }
  function currentUid(){
    try { return (window.firebase && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : null; }
    catch(e){ return null; }
  }
  function serverTs(){ return firebase.firestore.FieldValue.serverTimestamp(); }

  // ---------- 레거시(기존 rankings) 내 기록 조회 ----------
  // 마이그레이션 전에는 rankings/{phoneHash}를 읽을 수 있고, 이후엔 읽기가 막혀 null이 됩니다.
  async function getLegacyBest(player){
    if (!player || !player.phoneHash || !window.__FIREBASE_READY__) return 0;
    try{
      const doc = await window.__firestoreDB__.collection(LEGACY_COLLECTION).doc(player.phoneHash).get();
      return doc.exists ? toScore(doc.data().bestScore) : 0;
    }catch(e){ return 0; }
  }

  // ---------- 서버 기록 조회 (서버가 유일한 Source of Truth) ----------
  async function getExistingBestScore(player){
    if (!player) return null;
    if (!window.__FIREBASE_READY__) return null;
    try{
      const user = await ensureAuth();
      if (!user) return null;
      const [doc, legacyBest] = await Promise.all([
        window.__firestoreDB__.collection(COLLECTION).doc(user.uid).get(),
        getLegacyBest(player)
      ]);
      const best = doc.exists ? toScore(doc.data().bestScore) : 0;
      return Math.max(best, legacyBest);
    }catch(e){
      console.warn('[wedding] 기존 점수 조회 실패', e);
      return null;
    }
  }

  // ---------- 게임 세션 시작 ----------
  // 게임 시작 시 서버 시각(sessionStartedAt)을 찍어 두고, 제출 시 보안 규칙이
  // "경과 시간 대비 가능한 최대 점수"를 검사합니다. 게임 UX를 막지 않도록 백그라운드로 실행.
  let sessionPromise = null;
  function beginSession(){
    sessionPromise = (async () => {
      const player = getPlayerInfo();
      if (!player || isRankingClosed() || !window.__FIREBASE_READY__) return false;
      try{
        const user = await ensureAuth();
        if (!user) return false;
        const db = window.__firestoreDB__;
        const ref = db.collection(COLLECTION).doc(user.uid);
        const nickname = String(player.nickname || '').slice(0, 10);
        // 경품 연락용 연락처는 공개 랭킹과 분리된 "쓰기 전용" 컬렉션에 저장
        if (player.phoneDigits){
          db.collection(CONTACTS_COLLECTION).doc(user.uid).set({
            nickname, phoneNumber: player.phoneDigits, updatedAt: serverTs()
          }).catch((e) => console.warn('[wedding] 연락처 저장 실패', e));
        }
        const startTx = () => db.runTransaction(async (tx) => {
          const doc = await tx.get(ref);
          if (!doc.exists){
            tx.set(ref, {
              nickname, bestScore: 0, lastScore: 0, playCount: 0,
              bestScoreAt: serverTs(), createdAt: serverTs(), updatedAt: serverTs(),
              sessionStartedAt: serverTs()
            });
          } else {
            tx.update(ref, { nickname, sessionStartedAt: serverTs(), updatedAt: serverTs() });
          }
        });
        try{
          await startTx();
        }catch(e){
          // 규칙의 연속 쓰기 간격(1초) 제한에 걸렸을 수 있으므로 한 번만 잠시 후 재시도
          await new Promise(r => setTimeout(r, 1200));
          await startTx();
        }
        return true;
      }catch(e){
        console.warn('[wedding] 게임 세션 시작 기록 실패', e);
        return false;
      }
    })();
    return sessionPromise;
  }

  // ---------- 점수 제출 ----------
  // 반환값: 서버 기준 최신 bestScore(레거시 기록 포함 최댓값), 실패/서버 미준비 시 null.
  async function submitScore(score){
    const player = getPlayerInfo();
    if (!player) return null;
    if (isRankingClosed()) return getExistingBestScore(player);
    if (!window.__FIREBASE_READY__) return null;

    const ok = sessionPromise ? await sessionPromise : await beginSession();
    sessionPromise = null;
    if (!ok) return null;

    const user = await ensureAuth();
    if (!user) return null;
    const db = window.__firestoreDB__;
    const ref = db.collection(COLLECTION).doc(user.uid);
    const s = toScore(score);

    try{
      const best = await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        if (!doc.exists) throw new Error('session-missing');
        const existing = doc.data();
        const prevBest = toScore(existing.bestScore);
        const isNewBest = s > prevBest;
        const update = {
          lastScore: s,
          bestScore: isNewBest ? s : prevBest,
          playCount: (Number(existing.playCount) || 0) + 1,
          updatedAt: serverTs(),
          sessionStartedAt: null
        };
        if (isNewBest) update.bestScoreAt = serverTs();
        tx.update(ref, update);
        return update.bestScore;
      });
      const legacyBest = await getLegacyBest(player);
      return Math.max(best, legacyBest);
    }catch(e){
      console.warn('[wedding] Firestore 점수 기록 실패', e);
      return null;
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

    listEl.innerHTML = entries.map((e, i) => {
      const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      const meClass = isMine(e, player) ? 'is-me' : '';
      const classAttr = [rankClass, meClass].filter(Boolean).join(' ');
      return `
      <li class="${classAttr}">
        <span class="col-rank">${i + 1}</span>
        <span class="col-name">${escapeHtml(e.nickname)}</span>
        <span class="col-score">${(Number(e.bestScore) || 0).toLocaleString()}</span>
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

    const myIndex = entries.findIndex(e => isMine(e, player));
    if (myIndex < 0){
      // 아직 점수를 등록하지 않았거나(플레이 전) 조회에 포함되지 않은 경우
      myRowEl.hidden = true;
      return;
    }

    const myEntry = entries[myIndex];
    myRowEl.innerHTML = `
      <span class="col-rank">${myIndex + 1}</span>
      <span class="col-name">${escapeHtml(myEntry.nickname)} (나)</span>
      <span class="col-score">${(Number(myEntry.bestScore) || 0).toLocaleString()}</span>
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

    const base = '게임을 즐겨주신 TOP3 세 분과, 현장에서 추첨하여 무작위 순위의 한 분께 <br>소정의 축하 선물이 준비되어 있습니다! <br>결혼식 중 현장에서 선물 증정 이벤트가 있을 예정이니 꼭 참여해주세요 :)';
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
    const total = entries.reduce((sum, e) => sum + (Number(e.playCount) || 0), 0);
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
      await ensureAuth();
      const db = window.__firestoreDB__;
      const fetchList = (col, required) => rankingQuery(db, col).get()
        .then(snap => entriesFromSnapshot(snap, col))
        .catch(e => { if (required) throw e; return []; }); // 레거시는 권한 없음이어도 무시
      const lists = await Promise.all([
        fetchList(COLLECTION, true),
        fetchList(LEGACY_COLLECTION, false),
        fetchList(LEGACY_COPY_COLLECTION, false)
      ]);
      applyEntries(mergeEntries(lists));
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
      const db = window.__firestoreDB__;
      const lists = {};
      const unsubs = [];
      let stopped = false;
      const cols = [
        { name: COLLECTION, required: true },
        { name: LEGACY_COLLECTION, required: false },
        { name: LEGACY_COPY_COLLECTION, required: false }
      ];
      const render = () => {
        if (lists[COLLECTION] === undefined) return; // 메인 컬렉션 첫 응답 전엔 대기
        applyEntries(mergeEntries(cols.map(c => lists[c.name])));
      };
      rankingUnsubscribe = () => { stopped = true; unsubs.forEach(u => u()); };
      ensureAuth().then(() => {
        if (stopped) return;
        cols.forEach(c => {
          unsubs.push(rankingQuery(db, c.name).onSnapshot(
            (snap) => { lists[c.name] = entriesFromSnapshot(snap, c.name); render(); },
            (e) => {
              if (c.required){
                console.warn('[wedding] Firestore 실시간 랭킹 오류', e);
                renderRankingError();
              } else {
                lists[c.name] = []; render(); // 레거시 읽기 차단(마이그레이션 후)은 정상
              }
            }
          ));
        });
      });
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
    beginSession,
    getExistingBestScore,
    loadAndRenderRanking,
    isRankingClosed,
    isValidKoreanPhone,
    init
  };
})();
