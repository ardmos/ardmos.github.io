/**
 * ranking.js
 * 플레이어(닉네임/휴대폰) 정보 관리 + Firestore 랭킹 등록/조회
 * Firebase가 설정되어 있지 않으면 localStorage 기반 로컬 랭킹으로 자동 폴백합니다.
 */
const WeddingRanking = (() => {
  const LS_PLAYER_KEY = 'wedding_player_info';
  const LS_LOCAL_RANKING_KEY = 'wedding_local_rankings';
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

  /** 플레이어 정보가 있으면 바로 콜백, 없으면 모달을 띄운 뒤 콜백 */
  function ensurePlayerInfo(onReady){
    const info = getPlayerInfo();
    if (info) { onReady(info); return; }
    openPlayerModal(() => onReady(getPlayerInfo()));
  }

  // ---------- 로컬 폴백 저장소 ----------
  function readLocalRankings(){
    try{
      const raw = localStorage.getItem(LS_LOCAL_RANKING_KEY);
      return raw ? JSON.parse(raw) : {};
    }catch(e){ return {}; }
  }

  function writeLocalRankings(map){
    localStorage.setItem(LS_LOCAL_RANKING_KEY, JSON.stringify(map));
  }

  function localEntries(limit = RANKING_LIMIT){
    const map = readLocalRankings();
    return Object.entries(map)
      .map(([id, v]) => ({
        id,
        nickname: v.nickname,
        bestScore: v.bestScore,
        bestScoreAt: v.bestScoreAt || v.updatedAt
      }))
      .sort((a, b) => b.bestScore - a.bestScore || a.bestScoreAt - b.bestScoreAt)
      .slice(0, limit);
  }

  function allLocalEntriesSorted(){
    const map = readLocalRankings();
    return Object.entries(map)
      .map(([id, v]) => ({
        id,
        nickname: v.nickname,
        bestScore: v.bestScore,
        bestScoreAt: v.bestScoreAt || v.updatedAt
      }))
      .sort((a, b) => b.bestScore - a.bestScore || a.bestScoreAt - b.bestScoreAt);
  }

  async function getExistingBestScore(player){
    if (!player) return null;
    const { phoneHash } = player;

    if (window.__FIREBASE_READY__){
      try{
        const doc = await window.__firestoreDB__.collection(COLLECTION).doc(phoneHash).get();
        if (doc.exists) return doc.data().bestScore;
      }catch(e){
        console.warn('[wedding] 기존 점수 조회 실패', e);
      }
    }

    const local = readLocalRankings()[phoneHash];
    return local ? local.bestScore : null;
  }

  // ---------- 점수 제출 ----------
  async function submitScore(score){
    const player = getPlayerInfo();
    if (!player) return null;

    if (isRankingClosed()){
      return getExistingBestScore(player);
    }

    const { nickname, phoneDigits, phoneHash } = player;
    const now = Date.now();

    if (window.__FIREBASE_READY__){
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
        console.warn('[wedding] Firestore 점수 등록 실패, 로컬 저장으로 대체합니다.', e);
      }
    }

    const map = readLocalRankings();
    const existing = map[phoneHash];
    if (!existing){
      map[phoneHash] = { nickname, bestScore: score, lastScore: score, playCount: 1, bestScoreAt: now, updatedAt: now };
    } else {
      const isNewBest = score > existing.bestScore;
      map[phoneHash] = {
        nickname,
        bestScore: isNewBest ? score : existing.bestScore,
        lastScore: score,
        playCount: (existing.playCount || 0) + 1,
        bestScoreAt: isNewBest ? now : existing.bestScoreAt,
        updatedAt: now
      };
    }
    writeLocalRankings(map);
    return map[phoneHash].bestScore;
  }

  // ---------- 순위 계산 (100위 밖) ----------
  async function computeRank(bestScore, bestScoreAt, phoneHash){
    if (window.__FIREBASE_READY__){
      try{
        const db = window.__firestoreDB__;
        const [higherSnap, tieSnap] = await Promise.all([
          db.collection(COLLECTION).where('bestScore', '>', bestScore).get(),
          db.collection(COLLECTION).where('bestScore', '==', bestScore).where('bestScoreAt', '<', bestScoreAt).get()
        ]);
        return higherSnap.size + tieSnap.size + 1;
      }catch(e){
        console.warn('[wedding] Firestore 순위 계산 실패, 로컬 방식으로 대체합니다.', e);
      }
    }

    const all = allLocalEntriesSorted();
    const idx = all.findIndex(e => e.id === phoneHash);
    return idx >= 0 ? idx + 1 : null;
  }

  async function getMyRecord(player){
    if (!player) return null;

    if (window.__FIREBASE_READY__){
      try{
        const doc = await window.__firestoreDB__.collection(COLLECTION).doc(player.phoneHash).get();
        if (doc.exists){
          const d = doc.data();
          return {
            nickname: d.nickname,
            bestScore: d.bestScore,
            bestScoreAt: d.bestScoreAt
          };
        }
      }catch(e){
        console.warn('[wedding] 내 기록 조회 실패', e);
      }
    }

    const local = readLocalRankings()[player.phoneHash];
    if (!local) return null;
    return {
      nickname: local.nickname,
      bestScore: local.bestScore,
      bestScoreAt: local.bestScoreAt || local.updatedAt
    };
  }

  // ---------- 랭킹 렌더 ----------
  function renderRankingList(entries, player){
    const listEl = document.getElementById('rankingList');
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

  // ---------- 랭킹 조회 (일회성) ----------
  async function loadAndRenderRanking(){
    showRankingLoading();
    updateRankingNote();

    let entries = [];

    if (window.__FIREBASE_READY__){
      try{
        const snap = await rankingQuery(window.__firestoreDB__).get();
        entries = entriesFromSnapshot(snap);
      }catch(e){
        console.warn('[wedding] Firestore 랭킹 조회 실패, 로컬 데이터로 대체합니다.', e);
        entries = localEntries();
      }
    } else {
      entries = localEntries();
    }

    await applyEntries(entries);
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

    if (window.__FIREBASE_READY__){
      try{
        rankingUnsubscribe = rankingQuery(window.__firestoreDB__).onSnapshot(
          (snap) => {
            applyEntries(entriesFromSnapshot(snap));
          },
          (e) => {
            console.warn('[wedding] Firestore 실시간 랭킹 실패, 로컬 데이터로 대체합니다.', e);
            applyEntries(localEntries());
          }
        );
        return;
      }catch(e){
        console.warn('[wedding] Firestore 리스너 시작 실패', e);
      }
    }

    loadAndRenderRanking();
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

  function init(){
    updateRankingNote();
    setupRankingObserver();
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
