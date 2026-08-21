/**
 * game.js
 * Cupid Arrow - 세로형 타이밍 미니게임
 * - 화살은 항상 화면 하단 중앙(고정 x)에서 수직으로만 발사됩니다.
 * - 과녁은 상단에서 좌우로 등속 이동하며, 화면 밖으로 완전히 지나가면 사라집니다.
 * - 화살이 과녁의 y라인에 도달하는 "순간" 과녁의 x위치와 고정 발사선의 거리로 점수가 결정됩니다.
 *   => 플레이어는 화살의 궤적이 아니라 "언제 쏠지 / 얼마나 오래 당길지"로 승부합니다.
 */
const WeddingGame = (() => {
  // 이미지 에셋 경로 (여기만 바꾸면 전체 교체됨)
  const IMAGE_PATHS = {
    target: 'assets/target.png',
    bow: 'assets/bow.png',
    arrow: 'assets/arrow.png',
    back1: 'assets/back1.jpg',
    back2: 'assets/back2.jpg',
    back3: 'assets/back3.jpg'
  };

  // 라운드가 올라갈수록 1 -> 2 -> 3 -> 1 -> 2 -> 3... 순서로 순환되는 시간대 배경
  const BACKGROUND_COUNT = 3;
  // 배경 이미지가 아직 없거나 로드 실패했을 때 대신 쓰는 하늘 그라데이션(시간대별)
  const FALLBACK_SKY = {
    1: ['#AEE0F4', '#EAF6FB'], // 낮
    2: ['#F4B36E', '#FCE0B8'], // 노을
    3: ['#8C79AE', '#D8C6E8']  // 해지기 직전
  };
  // 배경 시간대에 맞춰 구름 색도 함께 바뀜
  const CLOUD_COLORS = {
    1: 'rgba(255,255,255,0.85)', // 낮 - 흰 구름
    2: 'rgba(255,213,158,0.85)', // 노을 - 노란빛 도는 구름
    3: 'rgba(210,181,224,0.82)'  // 해지기 직전 - 보랏빛 도는 구름
  };

  const RINGS = [
    { radius: 3,  score: 200, label: 'BULLSEYE' },
    { radius: 10, score: 100, label: 'PERFECT' },
    { radius: 18, score: 80,  label: 'GREAT' },
    { radius: 26, score: 60,  label: 'NICE' },
    { radius: 33, score: 40,  label: 'GOOD' },
    { radius: 40, score: 20,  label: 'OK' }
  ];
  const OUTER_RADIUS = RINGS[RINGS.length - 1].radius;

  // 발사 파워(꾹 누른 시간)에 따른 화살 속도 범위
  const MIN_ARROW_SPEED = 340;   // 살짝 눌렀다 뗐을 때
  const MAX_ARROW_SPEED = 720;   // 꾹 눌러 최대로 당겼을 때
  const MAX_CHARGE_MS = 650;     // 이 이상 누르고 있으면 최대 파워로 취급
  const PULL_VISUAL_MS = 480;    // 당기는 모습이 최대로 보이기까지 걸리는 시간(연출용)
  const PULL_MAX_PX = 22;        // 최대로 당겨졌을 때 아래로 내려가는 픽셀

  // 발사 직후 가속(스냅) -> 이후 살짝 감속하며 순항하는 자연스러운 비행 곡선
  const ACCEL_PHASE_MS = 90;
  const DECEL_TAIL_MS = 260;

  const BASE_TARGET_SPEED = 55;   // px/sec (round 1)
  const TARGET_SPEED_STEP = 13;   // 라운드당 증가량
  const ABS_MAX_TARGET_SPEED = 430; // 아무리 라운드가 올라가도 이 이상은 넘지 않음(플레이 가능선 유지)
  const STICK_DELAY = 550;        // 명중 후 화살이 과녁에 꽂힌 채 보여지는 시간(ms)
  const RESPAWN_DELAY = 420;      // 완전히 놓쳤을 때 다음 과녁이 나오기까지(ms)
  const ARROW_STOP_Y_OFFSET = -8; // 화살촉이 과녁 실제 타격 위치보다 살짝 위에서 멈추도록

  let canvas, ctx, W, H, dpr;
  let images = {};
  let state = 'idle'; // idle | playing | gameover
  let score = 0, lives = 3, round = 1;
  let bgRound = 1;   // 현재 표시할 배경 시간대 (1~3 순환)
  let bgCounter = 0; // 새 과녁이 등장할 때마다(맞히든 놓치든) 1씩 증가 - round와 무관하게 배경만 계속 순환시킴
  let target = null, arrow = null;
  let charging = false, chargeStartTs = 0;
  let lastTs = 0;
  let bestScoreCache = 0;
  let resolving = false;
  let respawnTimer = null;
  let stickTimer = null;
  let rafId = null;

  function loadImages(){
    Object.entries(IMAGE_PATHS).forEach(([key, src]) => {
      const img = new Image();
      img.onload = () => { images[key] = { el: img, ok: true }; };
      img.onerror = () => { images[key] = { el: null, ok: false }; };
      img.src = src;
    });
  }

  function setupCanvas(){
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 200));
  }

  function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // width/height를 다시 지정하면 캔버스 상태가 초기화되므로 매번 다시 설정
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false; // 픽셀아트 에셋이 흐려지지 않도록 (nearest-neighbor)
  }

  function bowX(){ return W / 2; }
  function bowY(){ return H - 46; }
  function targetY(){ return Math.max(70, H * 0.17); }

  /** 라운드가 올라갈수록 1 -> 2 -> 3 -> 1 -> 2 -> 3 ... 순서로 순환되는 배경 시간대 */
  function currentBackIndex(){
    return ((bgRound - 1) % BACKGROUND_COUNT) + 1;
  }

  // ---------- 이징 함수 ----------
  function easeOutQuad(t){ return 1 - (1 - t) * (1 - t); }
  function easeInOutQuad(t){ return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /** 발사 후 경과 시간(ms)에 따라 현재 순간 속도를 계산 - 스냅 가속 후 살짝 감속하며 순항 */
  function currentArrowSpeed(arrow){
    const elapsed = arrow.elapsedMs;
    if (elapsed < ACCEL_PHASE_MS){
      const t = elapsed / ACCEL_PHASE_MS;
      return arrow.peakSpeed * (0.55 + 0.45 * easeOutQuad(t));
    }
    const t2 = Math.min((elapsed - ACCEL_PHASE_MS) / DECEL_TAIL_MS, 1);
    return arrow.peakSpeed * (1 - 0.15 * easeInOutQuad(t2));
  }

  // ---------- 입력 : 꾹 눌렀다가 떼는 순간 발사 (누른 시간 = 파워) ----------
  function setupInput(){
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (state !== 'playing' || arrow || !target || resolving) return;
      WeddingSound.unlock();
      WeddingSound.draw();
      charging = true;
      chargeStartTs = performance.now();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    }, { passive: false });

    canvas.addEventListener('pointerup', (e) => {
      e.preventDefault();
      if (!charging) return;
      charging = false;
      const heldMs = performance.now() - chargeStartTs;
      WeddingSound.fire();
      fireArrow(heldMs);
    }, { passive: false });

    canvas.addEventListener('pointercancel', () => { charging = false; });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  function fireArrow(heldMs){
    if (state !== 'playing' || arrow || !target || resolving) return;
    const t = Math.min(heldMs / MAX_CHARGE_MS, 1);
    const peakSpeed = MIN_ARROW_SPEED + t * (MAX_ARROW_SPEED - MIN_ARROW_SPEED);
    arrow = { x: bowX(), y: bowY(), peakSpeed, elapsedMs: 0, stuck: false };
  }

  // ---------- 스폰 / 라운드 ----------
  // 과녁은 항상 오른쪽 화면 밖에서 시작해 왼쪽 끝까지 갔다가, 다시 오른쪽 끝으로 돌아옵니다.
  // 이 왕복이 끝날 때까지(오른쪽으로 완전히 돌아올 때까지) 못 맞히면 실패 처리됩니다.
  function targetSpeedForRound(r){
    return Math.min(BASE_TARGET_SPEED + (r - 1) * TARGET_SPEED_STEP, ABS_MAX_TARGET_SPEED);
  }

  /** 새 과녁이 등장할 때마다(명중해서 나오든, 끝까지 못 맞혀서 나오든) 배경을 다음 시간대로 넘김 */
  function spawnTarget(){
    bgCounter++;
    bgRound = bgCounter;
    target = {
      x: W + OUTER_RADIUS,
      phase: 'out', // 'out' = 왼쪽으로 이동 중, 'back' = 오른쪽으로 복귀 중
      speed: targetSpeedForRound(round)
    };
  }

  function scheduleRespawn(){
    target = null;
    clearTimeout(respawnTimer);
    respawnTimer = setTimeout(() => {
      if (state === 'playing') spawnTarget();
    }, RESPAWN_DELAY);
  }

  // ---------- 판정 ----------
  function resolveArrival(offset, screenX, screenY){
    const ring = RINGS.find(r => offset <= r.radius);

    if (!ring){
      // 완전히 빗나감 - 과녁은 그대로 계속 이동, 화살만 사라짐 (다시 조준 가능)
      loseLife();
      arrow = null;
      return;
    }

    // 명중 - 화살을 과녁의 중간 높이쯤(중심보다 살짝 아래)에 고정하고 잠깐 멈춰서 보여줌
    arrow.stuck = true;
    arrow.y = targetY() + ARROW_STOP_Y_OFFSET;
    resolving = true;

    // 같은 링 안에서도 정중앙에 가까울수록 0~19점 정수 보너스 (링 간 최소 간격 20점을 절대 넘지 않아
    // 링 순위 자체는 항상 그대로 유지되면서, 동점자를 정밀하게 갈라줌)
    const precision = 1 - (offset / ring.radius);
    const bonus = Math.min(19, Math.floor(precision * 20));
    const points = ring.score + bonus;

    score += points;
    const isBullseye = ring.label === 'BULLSEYE';
    const isPerfect = ring.label === 'PERFECT';
    const celebrate = isBullseye || isPerfect;
    if (isBullseye) WeddingSound.bullseye();
    else WeddingSound.hit(isPerfect);

    // 등급 이름은 윗줄, 실제 획득 점수는 아랫줄에 중앙 정렬로 병기 (예: "PERFECT" / "+119")
    showPopup(W / 2, H / 2, ring.label, ring.label.toLowerCase(), `+${points}`);
    // 파티클은 실제로 맞은 위치(과녁)에서 넓게 튀도록
    showHitParticles(screenX, screenY, celebrate, isBullseye);
    round++; // 맞힐 때마다 라운드 즉시 상승 (상한 없이 계속 어려워짐)
    updateHud();

    clearTimeout(stickTimer);
    stickTimer = setTimeout(() => {
      arrow = null;
      target = null;
      resolving = false;
      if (state === 'playing') spawnTarget();
    }, STICK_DELAY);
  }

  function loseLife(){
    lives--;
    updateHud();
    WeddingSound.miss();
    // MISS 텍스트도 화면 정중앙에 크게 표시
    showPopup(W / 2, H / 2, 'MISS', 'miss');
    triggerMissEffect();
    if (lives <= 0){
      endGame();
    }
  }

  function missPassed(){
    // 과녁이 오른쪽으로 완전히 돌아올 때까지 못 맞힌 경우 (라운드는 유지, 목숨만 감소)
    loseLife();
    if (state === 'playing') scheduleRespawn();
  }

  // ---------- 팝업 / 이펙트 ----------
  function showPopup(x, y, text, tier, subText){
    const layer = document.getElementById('gamePopupLayer');
    const el = document.createElement('div');
    el.className = 'score-popup tier-' + tier;
    if (subText){
      const labelEl = document.createElement('span');
      labelEl.className = 'popup-label';
      labelEl.textContent = text;
      const scoreEl = document.createElement('span');
      scoreEl.className = 'popup-score';
      scoreEl.textContent = subText;
      el.append(labelEl, scoreEl);
    } else {
      el.textContent = text;
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function showHitParticles(x, y, celebrate, bullseye){
    const layer = document.getElementById('gamePopupLayer');
    const count = bullseye ? 18 : (celebrate ? 14 : 9);
    for (let i = 0; i < count; i++){
      const p = document.createElement('span');
      p.className = 'hit-spark' + (celebrate ? ' perfect' : '') + (bullseye ? ' bullseye' : '');
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = bullseye ? (55 + Math.random() * 80) : (celebrate ? (40 + Math.random() * 65) : (32 + Math.random() * 45));
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      layer.appendChild(p);
      setTimeout(() => p.remove(), 620);
    }
  }

  function triggerMissEffect(){
    const screen = document.getElementById('gameScreen');
    screen.classList.remove('shake');
    void screen.offsetWidth; // 리플로우를 강제해 애니메이션 재시작
    screen.classList.add('shake');

    const flash = document.getElementById('missFlash');
    flash.classList.remove('show');
    void flash.offsetWidth;
    flash.classList.add('show');

    const livesEl = document.getElementById('gameLives');
    livesEl.classList.remove('pulse');
    void livesEl.offsetWidth;
    livesEl.classList.add('pulse');
  }

  /** 이전 판에서 남은 실패 연출 클래스를 제거 (재시작 시 애니메이션이 다시 재생되는 버그 방지) */
  function clearEffectClasses(){
    document.getElementById('gameScreen').classList.remove('shake');
    document.getElementById('missFlash').classList.remove('show');
    document.getElementById('gameLives').classList.remove('pulse');
  }

  // ---------- HUD ----------
  function updateHud(){
    for (let i = 0; i < 3; i++){
      const heart = document.querySelector(`.heart-icon[data-heart="${i}"]`);
      if (heart) heart.classList.toggle('lost', i >= lives);
    }
    document.getElementById('gameRound').textContent = `ROUND ${round}`;
    document.getElementById('gameScore').textContent = score.toLocaleString();
  }

  // ---------- 루프 ----------
  function loop(ts){
    if (state !== 'playing') return;
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
    lastTs = ts;

    update(dt);
    draw();

    rafId = requestAnimationFrame(loop);
  }

  function update(dt){
    if (resolving) return; // 명중 연출 중에는 모든 움직임 정지

    if (target){
      target.x += (target.phase === 'out' ? -1 : 1) * target.speed * dt;

      if (target.phase === 'out' && target.x + OUTER_RADIUS < 0){
        target.phase = 'back'; // 왼쪽 끝까지 도달 -> 이제 오른쪽으로 복귀
      } else if (target.phase === 'back' && target.x - OUTER_RADIUS > W){
        missPassed(); // 오른쪽으로 완전히 돌아올 때까지 못 맞힘 -> 실패
      }
    }

    if (arrow && !arrow.stuck){
      const prevArrowY = arrow.y;
      arrow.elapsedMs += dt * 1000;
      const speed = currentArrowSpeed(arrow);
      arrow.y -= speed * dt;

      const threshold = targetY() + ARROW_STOP_Y_OFFSET;
      if (target && arrow.y <= threshold){
        // 프레임의 '끝' 시점 과녁 위치가 아니라, 화살이 기준선을 실제로 넘은
        // '그 정확한 순간'의 과녁 위치를 보간해서 사용 (라운드가 빨라질수록
        // 프레임당 과녁 이동량이 커져서 생기던 판정 오차를 줄여줌)
        const totalMove = prevArrowY - arrow.y;
        const f = totalMove > 0 ? Math.min(Math.max((prevArrowY - threshold) / totalMove, 0), 1) : 1;
        const targetDir = target.phase === 'out' ? -1 : 1;
        const targetDeltaThisFrame = targetDir * target.speed * dt;
        const targetXAtCross = target.x - targetDeltaThisFrame * (1 - f);

        const offset = Math.abs(arrow.x - targetXAtCross);
        resolveArrival(offset, targetXAtCross, targetY());
      } else if (arrow.y < -20){
        arrow = null;
      }
    }
  }

  // ---------- 렌더 ----------
  function draw(){
    const bgIndex = currentBackIndex();
    drawBackground(bgIndex);
    drawClouds(bgIndex);
    if (target) drawTarget(target.x, targetY());
    drawBow();

    if (charging){
      const heldMs = performance.now() - chargeStartTs;
      const pullT = Math.min(heldMs / PULL_VISUAL_MS, 1);
      drawArrow(bowX(), bowY() - 6 + pullT * PULL_MAX_PX);
    }
    if (arrow) drawArrow(arrow.x, arrow.y);
  }

  /** 시간대별 배경 이미지를 화면 전체를 꽉 채우도록(cover) 그림. 이미지가 없으면 같은 시간대의 그라데이션으로 대체 */
  function drawBackground(index){
    const img = images['back' + index];
    if (img && img.ok){
      const el = img.el;
      const scale = Math.max(W / el.width, H / el.height);
      const dw = el.width * scale;
      const dh = el.height * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      ctx.drawImage(el, dx, dy, dw, dh);
      return;
    }
    const colors = FALLBACK_SKY[index] || FALLBACK_SKY[1];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawClouds(bgIndex){
    ctx.fillStyle = CLOUD_COLORS[bgIndex] || CLOUD_COLORS[1];
    const t = performance.now() / 1000;
    [[0.15, 40, 30], [0.55, 30, 60], [0.8, 46, 20]].forEach(([xr, size, offset]) => {
      const x = ((t * 12 + offset * 8) % (W + size * 2)) - size;
      const y = H * xr * 0.25 + 14;
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.5, size * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawTarget(x, y){
    if (images.target && images.target.ok){
      const size = OUTER_RADIUS * 2.2;
      ctx.drawImage(images.target.el, x - size / 2, y - size / 2, size, size);
      return;
    }
    // 기존 배치 그대로 복원 (PERFECT~OK 5개 링) - RINGS[0]은 불스아이라 여기선 제외
    const colors = ['#B94D66', '#fff', '#E7B84C', '#fff', '#7FB88A'];
    for (let i = RINGS.length - 1; i >= 1; i--){
      ctx.beginPath();
      ctx.fillStyle = colors[(i - 1) % colors.length];
      ctx.arc(x, y, RINGS[i].radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(62,47,42,0.5)';
      ctx.stroke();
    }
    // 정중앙 불스아이 - 검은색 점 (작게, 판정도 좁게)
    ctx.beginPath();
    ctx.fillStyle = '#1a1a1a';
    ctx.arc(x, y, RINGS[0].radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBow(){
    const x = bowX(), y = bowY();
    if (images.bow && images.bow.ok){
      // 화살(31×258)과 같은 축척으로 맞춘 크기 - 실제 에셋 비율(396×139, 가로로 긴 형태) 유지
      // 이미 화살이 나가는 방향에 맞게 그려진 이미지라 회전 없음
      const w = 127, h = 45;
      ctx.drawImage(images.bow.el, x - w / 2, y - h / 2, w, h);
      return;
    }
    // 활 방향: 시위는 위쪽(발사 방향)에 수평으로, 활대는 아래로 휘어지도록 회전
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(-10, 0, 26, -Math.PI / 2.6, Math.PI / 2.6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(62,47,42,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, -25);
    ctx.lineTo(-10, 25);
    ctx.stroke();
    ctx.restore();
  }

  function drawArrow(x, y){
    if (images.arrow && images.arrow.ok){
      // 실제 에셋 비율(31×258, 화살촉 기준 아래로 긴 형태)에 맞춰 표시
      // 화살촉(이미지 상단)을 y 위치에 맞추고, 화살대는 그 아래로 길게 이어지도록 그림
      const w = 10, h = 83;
      ctx.drawImage(images.arrow.el, x - w / 2, y, w, h);
      return;
    }
    ctx.strokeStyle = '#3E2F2A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 28);
    ctx.stroke();
    ctx.fillStyle = '#D8637F';
    ctx.beginPath();
    ctx.moveTo(x, y - 34);
    ctx.lineTo(x - 5, y - 24);
    ctx.lineTo(x + 5, y - 24);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- 게임 흐름 ----------
  function startGame(){
    score = 0; lives = 3; round = 1; bgRound = 1; bgCounter = 0;
    target = null; arrow = null; charging = false; resolving = false; lastTs = 0;
    clearTimeout(respawnTimer); clearTimeout(stickTimer);
    state = 'playing';

    document.getElementById('gameIntroPanel').hidden = true;
    document.getElementById('gameOverScreen').hidden = true;
    clearEffectClasses(); // 화면을 다시 보이기 전에 이전 판의 흔들림/플래시/펄스 잔여 클래스 제거
    document.getElementById('gameScreen').hidden = false;
    document.getElementById('gamePopupLayer').innerHTML = '';

    resizeCanvas();
    updateHud();
    spawnTarget();
    rafId = requestAnimationFrame(loop);
  }

  async function endGame(){
    state = 'gameover';
    charging = false;
    resolving = false;
    clearTimeout(respawnTimer);
    clearTimeout(stickTimer);
    cancelAnimationFrame(rafId);
    WeddingSound.gameOver();

    document.getElementById('gameScreen').hidden = true;
    document.getElementById('gameOverScreen').hidden = false;
    document.getElementById('finalScoreVal').textContent = score.toLocaleString();
    document.getElementById('bestScoreVal').textContent = Math.max(score, bestScoreCache).toLocaleString();

    const updatedBest = await WeddingRanking.submitScore(score);
    if (updatedBest !== null){
      bestScoreCache = updatedBest;
      document.getElementById('bestScoreVal').textContent = bestScoreCache.toLocaleString();
    }
  }

  function setupButtons(){
    document.getElementById('gameStartBtn').addEventListener('click', () => {
      WeddingSound.unlock();
      WeddingRanking.ensurePlayerInfo(() => startGame());
    });
    document.getElementById('playAgainBtn').addEventListener('click', () => startGame());
    document.getElementById('viewRankingBtn').addEventListener('click', () => {
      document.getElementById('ranking').scrollIntoView({ behavior: 'smooth' });
      WeddingRanking.loadAndRenderRanking();
    });
  }

  function start(){
    setupCanvas();
    setupInput();
    setupButtons();
    loadImages();
  }

  return { start };
})();
