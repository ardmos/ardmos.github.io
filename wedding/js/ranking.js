/**
 * ranking.js
 * 플레이어(닉네임/휴대폰) 정보 관리 + Firestore 랭킹 등록/조회
 * Firebase가 설정되어 있지 않으면 localStorage 기반 로컬 랭킹으로 자동 폴백합니다.
 */
const WeddingRanking = (() => {
  const LS_PLAYER_KEY = 'wedding_player_info';
  const LS_LOCAL_RANKING_KEY = 'wedding_local_rankings';
  const COLLECTION = 'rankings';

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

  // ---------- 점수 제출 ----------
  async function submitScore(score){
    const player = getPlayerInfo();
    if (!player) return null;
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

    // 로컬 폴백
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

  // ---------- 랭킹 조회/렌더 ----------
  async function loadAndRenderRanking(){
    const listEl = document.getElementById('rankingList');
    const myRowEl = document.getElementById('myRankingRow');
    listEl.innerHTML = '<li class="ranking-loading">랭킹 불러오는 중...</li>';
    myRowEl.hidden = true;

    let entries = [];

    if (window.__FIREBASE_READY__){
      try{
        const db = window.__firestoreDB__;
        const snap = await db.collection(COLLECTION)
          .orderBy('bestScore', 'desc')
          .orderBy('bestScoreAt', 'asc')
          .limit(100)
          .get();
        snap.forEach(doc => {
          const d = doc.data();
          entries.push({ id: doc.id, nickname: d.nickname, bestScore: d.bestScore });
        });
      }catch(e){
        console.warn('[wedding] Firestore 랭킹 조회 실패, 로컬 데이터로 대체합니다.', e);
        entries = localEntries();
      }
    } else {
      entries = localEntries();
    }

    renderRanking(entries);
  }

  function localEntries(){
    const map = readLocalRankings();
    return Object.entries(map)
      .map(([id, v]) => ({ id, nickname: v.nickname, bestScore: v.bestScore, bestScoreAt: v.updatedAt }))
      .sort((a, b) => b.bestScore - a.bestScore || a.bestScoreAt - b.bestScoreAt)
      .slice(0, 100);
  }

  function renderRanking(entries){
    const listEl = document.getElementById('rankingList');
    const myRowEl = document.getElementById('myRankingRow');
    const player = getPlayerInfo();

    if (!entries.length){
      listEl.innerHTML = '<li class="ranking-loading">아직 등록된 기록이 없어요. 첫 기록의 주인공이 되어보세요!</li>';
      return;
    }

    listEl.innerHTML = entries.map((e, i) => `
      <li class="${i === 0 ? 'top1' : ''}">
        <span class="col-rank">${i + 1}</span>
        <span class="col-name">${escapeHtml(e.nickname)}</span>
        <span class="col-score">${e.bestScore.toLocaleString()}</span>
      </li>
    `).join('');

    if (player){
      const myIndex = entries.findIndex(e => e.id === player.phoneHash);
      if (myIndex >= 0 && myIndex < 100){
        myRowEl.hidden = true; // 이미 목록 안에 보이므로 별도 표시 생략
      } else if (myIndex === -1){
        // 100위 밖이거나 아직 기록 없음 -> 별도 조회 불필요 (로컬 캐시 없음 시 숨김)
      }
    }
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { getPlayerInfo, ensurePlayerInfo, submitScore, loadAndRenderRanking, isValidKoreanPhone };
})();
