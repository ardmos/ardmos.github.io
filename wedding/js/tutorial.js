/**
 * tutorial.js
 * -------------------------------------------------------
 * 최초 게임 실행 튜토리얼 + 결과 화면에서 "게임방법"으로 다시보기.
 *
 * 이 모듈은 오직 "화면 연출"만 담당하며, 실제 게임 상태(score/lives/round/
 * target/arrow/랭킹/서버통신/유저정보)는 절대 읽거나 쓰지 않습니다.
 * - 과녁/활/화살/배경을 그릴 때는 game.js가 노출한 tutorialPrepareCanvas /
 *   tutorialDrawFrame 만 사용합니다 (실제 게임 루프와 완전히 분리).
 * - 하트가 줄어드는 연출은 실제 lives 값과 무관하게 heart-icon의 CSS 클래스만
 *   토글했다가, 튜토리얼이 끝나면 원래 상태로 되돌립니다.
 *
 * 표시 범위: 튜토리얼 오버레이(검은 반투명 배경 + 스포트라이트 + 안내문구)는
 * 전체 화면이 아니라 #gameScreen(게임 콘솔 프레임) 안에만 그려집니다.
 * #gameScreen이 overflow:hidden이라 오버레이를 그 안에 두면 프레임 밖으로는
 * 아무것도 삐져나가지 않습니다. 그래서 모든 좌표 계산은 "뷰포트 기준"이 아니라
 * "#gameScreen 기준 로컬 좌표"로 합니다.
 *
 * 진입 모드 2가지:
 *   'first'  - 방금 유저 정보입력을 "새로" 마친 직후(진짜 최초 실행)에만 진입.
 *              이미 정보가 저장돼 있던 재방문 유저는 이 모드로 진입하지 않음
 *              (game.js가 WeddingRanking.ensurePlayerInfo의 isFirstTime 값으로 분기).
 *              종료(완료/스킵) 후 실제 게임 시작.
 *   'replay' - 결과 화면의 [게임방법] 버튼. 종료 후 결과 화면으로 복귀,
 *              새 게임을 시작하지 않고 점수/랭킹도 그대로 유지.
 */
const WeddingTutorial = (() => {
  // Step 순서/문구/연출 종류 - 나중에 여기만 수정하면 튜토리얼 내용을 바꿀 수 있음
  const STEPS = [
    { demo: 'aim',         text: '화면을 꾹 눌러 화살을 당겨보세요!<br>손을 떼면 화살이 발사돼요.' },
    { demo: 'targetSwing', text: '움직이는 과녁을 노려보세요!<br>타이밍에 맞춰 화살을 쏴보세요!' },
    { demo: 'hearts',      text: '화살이 빗나가면 하트가 하나 줄어요!<br>하트 3개를 모두 잃으면 게임 오버예요!' },
    { demo: 'roundtrip',   text: '과녁은 한 번 왕복하면 사라져요!<br>사라지기 전에 꼭 맞혀보세요!' }
  ];

  let overlay, spotlightEl, textEl, stepCountEl, fingerEl, skipBtn;
  let listenersReady = false;
  let stepIndex = 0;
  let mode = 'first'; // 'first' | 'replay'
  let onFinishCb = null;
  let demoRafId = null;
  let demoStartTs = 0;
  let metrics = null; // tutorialPrepareCanvas()의 결과 캐시

  function cacheDom(){
    overlay = document.getElementById('tutorialOverlay');
    spotlightEl = document.getElementById('tutorialSpotlight');
    fingerEl = document.getElementById('tutorialFinger');
    skipBtn = document.getElementById('tutorialSkipBtn');
    textEl = document.getElementById('tutorialText');
    stepCountEl = document.getElementById('tutorialStepCount');
  }

  /** rect: #gameScreen 기준 로컬 좌표({left, top, width, height}) */
  function setSpotlightRect(rect, radius){
    if (!spotlightEl) return;
    spotlightEl.style.left = rect.left + 'px';
    spotlightEl.style.top = rect.top + 'px';
    spotlightEl.style.width = Math.max(rect.width, 0) + 'px';
    spotlightEl.style.height = Math.max(rect.height, 0) + 'px';
    spotlightEl.style.borderRadius = (radius != null ? radius + 'px' : '16px');
  }

  // ---------- 데모(연출) 정지 및 원상복구 ----------
  function stopDemo(){
    if (demoRafId){ cancelAnimationFrame(demoRafId); demoRafId = null; }
    if (fingerEl) fingerEl.hidden = true;
    // 하트 데모에서 토글했던 시각 클래스만 원복 (실제 lives 값은 애초에 건드리지 않았음)
    const livesEl = document.getElementById('gameLives');
    if (livesEl){
      livesEl.classList.remove('pulse');
      livesEl.querySelectorAll('.heart-icon').forEach(h => h.classList.remove('lost'));
    }
  }

  // ---------- Step 1: 활 당기기 / 발사 ----------
  function runAimDemo(canvasOffset){
    const PULL_MS = 1300, FLY_MS = 420, PAUSE_MS = 500;
    const CYCLE = PULL_MS + FLY_MS + PAUSE_MS;

    function frame(ts){
      const t = (ts - demoStartTs) % CYCLE;
      let pullT = null, arrowY = null;

      if (t < PULL_MS){
        pullT = t / PULL_MS;
        if (fingerEl){
          fingerEl.hidden = false;
          fingerEl.classList.toggle('pressed', pullT > 0.12);
          fingerEl.style.left = (canvasOffset.x + metrics.bowX) + 'px';
          fingerEl.style.top = (canvasOffset.y + metrics.bowY - 14 + pullT * 20) + 'px';
        }
      } else if (t < PULL_MS + FLY_MS){
        if (fingerEl) fingerEl.hidden = true;
        const ft = (t - PULL_MS) / FLY_MS;
        arrowY = metrics.bowY - 6 - ft * (metrics.H + 40);
      } else {
        if (fingerEl) fingerEl.hidden = true;
      }

      WeddingGame.tutorialDrawFrame({ pullT, arrowY, bgIndex: 1 });
      demoRafId = requestAnimationFrame(frame);
    }
    demoRafId = requestAnimationFrame(frame);
  }

  // ---------- Step 2 / Step 4: 과녁 이동 ----------
  function runTargetDemo(canvasOffset, roundtripMode){
    const SWING_CYCLE = 2600;
    const MARGIN = 40, RT_OUT = 1450, RT_BACK = 1450, RT_GONE = 650;
    const RT_CYCLE = RT_OUT + RT_BACK + RT_GONE;

    function easeInOut(t){ return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function frame(ts){
      const t = ts - demoStartTs;
      const W = metrics.W;
      let targetXRatio;

      if (!roundtripMode){
        // Step 2: 계속 좌우로 왕복하는 과녁 (움직이는 과녁이라는 개념 자체를 보여줌)
        const p = (t % SWING_CYCLE) / SWING_CYCLE;
        targetXRatio = 0.14 + (Math.sin(p * Math.PI * 2) * 0.5 + 0.5) * 0.72;
      } else {
        // Step 4: 오른쪽 등장 -> 왼쪽 이동 -> 오른쪽 복귀 -> 사라짐, 반복
        const local = t % RT_CYCLE;
        if (local < RT_OUT){
          const p = easeInOut(local / RT_OUT);
          targetXRatio = (1 + MARGIN / W) - p * (1 + 2 * MARGIN / W);
        } else if (local < RT_OUT + RT_BACK){
          const p = easeInOut((local - RT_OUT) / RT_BACK);
          targetXRatio = (-MARGIN / W) + p * (1 + 2 * MARGIN / W);
        } else {
          targetXRatio = null; // 왕복 완료 -> 사라진 상태
        }
      }

      const targetX = targetXRatio != null ? targetXRatio * W : null;
      WeddingGame.tutorialDrawFrame({ targetX, bgIndex: 1 });

      if (targetX != null){
        const localX = canvasOffset.x + targetX;
        const localY = canvasOffset.y + metrics.targetY;
        setSpotlightRect({ left: localX - 46, top: localY - 46, width: 92, height: 92 }, 999);
      } else {
        setSpotlightRect({ left: canvasOffset.x + W / 2, top: canvasOffset.y + metrics.targetY, width: 0, height: 0 });
      }

      demoRafId = requestAnimationFrame(frame);
    }
    demoRafId = requestAnimationFrame(frame);
  }

  // ---------- Step 3: 하트 감소 연출 (실제 lives 값과 무관, 시각 클래스만 토글) ----------
  function runHeartsDemo(livesEl){
    const CYCLE = 1900, LOSE_AT = 500, RESTORE_AT = 1500;
    function frame(ts){
      const t = (ts - demoStartTs) % CYCLE;
      const heart = livesEl.querySelector('.heart-icon[data-heart="2"]');
      if (heart){
        const shouldBeLost = (t >= LOSE_AT && t < RESTORE_AT);
        if (shouldBeLost && !heart.classList.contains('lost')){
          heart.classList.add('lost');
          livesEl.classList.remove('pulse');
          void livesEl.offsetWidth; // 리플로우 강제 -> pulse 애니메이션 재시작
          livesEl.classList.add('pulse');
        } else if (!shouldBeLost){
          heart.classList.remove('lost');
        }
      }
      demoRafId = requestAnimationFrame(frame);
    }
    demoRafId = requestAnimationFrame(frame);
  }

  // ---------- Step 진행 ----------
  function startStepDemo(step){
    demoStartTs = performance.now();

    // 모든 좌표는 #gameScreen 기준 로컬 좌표로 변환해서 사용 (뷰포트 좌표 X)
    const gameScreenRect = document.getElementById('gameScreen').getBoundingClientRect();
    const canvasRect = document.getElementById('gameCanvas').getBoundingClientRect();
    const canvasOffset = { x: canvasRect.left - gameScreenRect.left, y: canvasRect.top - gameScreenRect.top };

    if (step.demo === 'aim'){
      metrics = WeddingGame.tutorialPrepareCanvas();
      setSpotlightRect({
        left: canvasOffset.x + metrics.bowX - 62,
        top: canvasOffset.y + metrics.bowY - 56,
        width: 124, height: 100
      }, 22);
      runAimDemo(canvasOffset);
    } else if (step.demo === 'targetSwing'){
      metrics = WeddingGame.tutorialPrepareCanvas();
      runTargetDemo(canvasOffset, false);
    } else if (step.demo === 'roundtrip'){
      metrics = WeddingGame.tutorialPrepareCanvas();
      runTargetDemo(canvasOffset, true);
    } else if (step.demo === 'hearts'){
      const livesEl = document.getElementById('gameLives');
      const rect = livesEl.getBoundingClientRect();
      setSpotlightRect({
        left: (rect.left - gameScreenRect.left) - 10,
        top: (rect.top - gameScreenRect.top) - 8,
        width: rect.width + 20, height: rect.height + 16
      }, 14);
      runHeartsDemo(livesEl);
    }
  }

  function renderStep(){
    stopDemo();
    const step = STEPS[stepIndex];
    textEl.innerHTML = step.text;
    stepCountEl.textContent = `${stepIndex + 1} / ${STEPS.length}`;
    startStepDemo(step);
  }

  function goNext(){
    stepIndex++;
    if (stepIndex >= STEPS.length) finish();
    else renderStep();
  }

  function finish(){
    stopDemo();
    overlay.hidden = true;

    if (mode === 'replay'){
      // 게임을 새로 시작하지 않고 결과 화면(점수/랭킹)으로 그대로 복귀
      document.getElementById('gameScreen').hidden = true;
      document.getElementById('gameOverScreen').hidden = false;
    }

    const cb = onFinishCb;
    onFinishCb = null;
    if (cb) cb();
  }

  function setupListeners(){
    overlay.addEventListener('click', (e) => {
      if (e.target.closest('#tutorialSkipBtn')) return;
      goNext();
    });
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      finish();
    });
  }

  /**
   * @param {'first'|'replay'} startMode
   * @param {Function} onFinish 튜토리얼 종료(완료 또는 스킵) 후 호출할 콜백
   */
  function start(startMode, onFinish){
    if (!overlay) cacheDom();
    if (!listenersReady){ setupListeners(); listenersReady = true; }

    mode = startMode;
    onFinishCb = onFinish || null;
    stepIndex = 0;

    if (mode === 'first'){
      document.getElementById('gameIntroPanel').hidden = true;
      document.getElementById('gameScreen').hidden = false;
    } else {
      document.getElementById('gameOverScreen').hidden = true;
      document.getElementById('gameScreen').hidden = false;
    }

    // #gameScreen 기준 좌표를 쓰므로, 페이지가 스크롤 중이어도 좌표가 어긋나지 않음
    const minigame = document.getElementById('minigame');
    if (minigame) minigame.scrollIntoView({ behavior: 'smooth', block: 'center' });

    overlay.hidden = false;
    renderStep();
  }

  return { start };
})();
