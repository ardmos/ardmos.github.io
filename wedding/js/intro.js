/**
 * intro.js
 * 로딩 화면 -> 픽셀 게임 인트로 등장 -> 타이핑 대화창 -> 보라/신랑/신부 터치 이스터에그
 */
const WeddingIntro = (() => {
  const DIALOG_LINES = [
    '우리의 새로운 모험이 시작됩니다.',
    '두 사람이 함께 모험을 시작하는 날,',
    '우리의 모험에 초대합니다. ❤'
  ];

  const COMBO_EVERY = 5;      // 보라를 이만큼 연속으로 누르면 스타 등장
  const BORA_FRAME_MS = 450;  // 보라 걷기 스프라이트 전환 간격

  const LOADING_CELLS = 10;
  const LOADING_MS = 1200;

  function runLoading(){
    return new Promise((resolve) => {
      const bar = document.getElementById('loadingBar');
      const screen = document.getElementById('loading-screen');
      const stepMs = LOADING_MS / LOADING_CELLS;

      bar.innerHTML = Array.from({ length: LOADING_CELLS }, (_, i) =>
        `<span class="loading-cell" data-i="${i}"></span>`
      ).join('');

      for (let i = 0; i < LOADING_CELLS; i++){
        setTimeout(() => {
          const cell = bar.querySelector(`[data-i="${i}"]`);
          if (cell) cell.classList.add('filled');
        }, Math.round(i * stepMs));
      }

      setTimeout(() => {
        screen.classList.add('hide');
        setTimeout(resolve, 500);
      }, LOADING_MS);
    });
  }

  function typeDialog(){
    const el = document.getElementById('dialogText');
    let lineIndex = 0;
    let charIndex = 0;

    function typeNext(){
      const line = DIALOG_LINES[lineIndex];
      if (charIndex <= line.length){
        el.textContent = line.slice(0, charIndex);
        charIndex++;
        setTimeout(typeNext, 55);
      } else {
        setTimeout(() => {
          lineIndex = (lineIndex + 1) % DIALOG_LINES.length;
          charIndex = 0;
          setTimeout(typeNext, 250);
        }, 1800);
      }
    }
    typeNext();
  }

  /**
   * 파티클 하나 생성: assets/{type}.png (heart / heart2 / star) 사용,
   * 이미지가 없으면 자동으로 이모지로 대체됩니다. big=true면 3배 크게 + 수직 상승 + 불투명 유지.
   */
  function spawnParticle(layer, x, y, type, dx, dy, delay, big){
    setTimeout(() => {
      const sizeClass = big ? ' mini-particle--big' : '';
      const img = document.createElement('img');
      img.className = 'mini-particle' + sizeClass;
      img.src = `assets/${type}.png`;
      img.alt = '';
      img.style.left = x + 'px';
      img.style.top = y + 'px';
      img.style.setProperty('--dx', dx + 'px');
      img.style.setProperty('--dy', dy + 'px');
      img.onerror = () => {
        img.remove();
        const fallback = document.createElement('span');
        fallback.className = 'mini-particle mini-particle--fallback' + sizeClass;
        fallback.textContent = type === 'star' ? '★' : '❤';
        fallback.style.left = x + 'px';
        fallback.style.top = y + 'px';
        fallback.style.setProperty('--dx', dx + 'px');
        fallback.style.setProperty('--dy', dy + 'px');
        layer.appendChild(fallback);
        setTimeout(() => fallback.remove(), 950);
      };
      layer.appendChild(img);
      setTimeout(() => img.remove(), 950);
    }, delay);
  }

  function localCenter(el, layerParent){
    const rect = el.getBoundingClientRect();
    const parentRect = layerParent.getBoundingClientRect();
    return {
      x: rect.left - parentRect.left + rect.width / 2,
      y: rect.top - parentRect.top
    };
  }

  /** 보라를 화면 밖(왼쪽 -35% ~ 오른쪽 130%)까지 JS로 직접 이동시키고,
   *  화면 밖에 있는 짧은 순간 transition 없이 즉시 방향을 반전시킵니다.
   *  (CSS 키프레임 타이밍에 의존하지 않아서 반전 과정이 절대 보이지 않습니다) */
  /**
   * 왼쪽->오른쪽(기본 이미지)과 오른쪽->왼쪽(좌우 반전 이미지),
   * 서로 다른 두 개의 CSS 애니메이션을 번갈아 실행합니다.
   * 각 애니메이션은 오직 left(위치)만 움직이고, transform(방향)은
   * 해당 구간이 시작되기 전에 한 번 고정값으로 세팅될 뿐 애니메이션 도중에는 절대
   * 바뀌지 않습니다 - 그래서 "도는 모습"이 원천적으로 존재할 수 없습니다.
   * 두 애니메이션 모두 화면 밖(-35% ~ 130%)에서 시작해서 화면 밖에서 끝납니다.
   */
  function setupBoraWalk(){
    const bora = document.getElementById('bora');
    // 반전(scaleX)은 오직 이 leaf 엘리먼트(img)에만 적용합니다.
    // #bora는 오직 left(위치)만 담당하고, #boraVisual은 오직 bounce(translateY)만 담당하므로
    // 이 세 레이어(위치 / 점프 / 반전)가 서로의 transform을 절대 덮어쓰지 않습니다.
    const sprite = document.getElementById('boraSprite');
    const MOVE_MS = 7400;

    function startRight(){
      bora.style.left = '-35%';
      sprite.style.transform = 'scaleX(1)';   // 기본(오른쪽을 보는) 이미지
      bora.style.animation = 'none';
      void bora.offsetWidth; // 강제 리플로우로 애니메이션 재시작 보장
      bora.style.animation = `boraGoRight ${MOVE_MS}ms linear forwards`;
    }

    function startLeft(){
      bora.style.left = '130%';
      sprite.style.transform = 'scaleX(-1)';  // 좌우 반전된 이미지
      bora.style.animation = 'none';
      void bora.offsetWidth;
      bora.style.animation = `boraGoLeft ${MOVE_MS}ms linear forwards`;
    }

    bora.addEventListener('animationend', (e) => {
      if (e.target !== bora) return;
      if (e.animationName === 'boraGoRight') startLeft();
      else if (e.animationName === 'boraGoLeft') startRight();
    });

    startRight();

    return {
      /** 탭-점프 동안 애니메이션을 그 자리에서 일시정지 */
      pause(){ bora.style.animationPlayState = 'paused'; },
      /** 멈췄던 지점부터 이어서 재생 */
      resume(){ bora.style.animationPlayState = 'running'; }
    };
  }

  function setupBoraEasterEgg(boraWalker){
    const bora = document.getElementById('bora');
    const boraVisual = document.getElementById('boraVisual');
    const particleLayer = document.getElementById('introParticles');
    const foundMsg = document.getElementById('boraFound');
    let animating = false;
    let tapCount = 0;

    bora.addEventListener('click', () => {
      if (animating) return;
      WeddingSound.unlock();
      WeddingSound.tap();
      animating = true;
      tapCount++;

      const { x: localX, y: localY } = localCenter(bora, bora.parentElement);

      // 걷기를 잠시 멈추고 제자리에서 점프
      boraWalker.pause();
      boraVisual.classList.add('bounce');

      // 하트 / 하트2 번갈아 파티클
      for (let i = 0; i < 5; i++){
        const type = i % 2 === 0 ? 'heart' : 'heart2';
        spawnParticle(
          particleLayer,
          localX + (Math.random() * 20 - 10),
          localY + 10,
          type,
          Math.random() * 40 - 20,
          -(40 + Math.random() * 20),
          i * 50
        );
      }

      // 많이 누르면(COMBO_EVERY회마다) 스타 파티클 추가
      if (tapCount % COMBO_EVERY === 0){
        for (let i = 0; i < 4; i++){
          spawnParticle(
            particleLayer,
            localX + (Math.random() * 34 - 17),
            localY,
            'star',
            Math.random() * 50 - 25,
            -(55 + Math.random() * 20),
            i * 60
          );
        }
      }

      // 발견 메시지 - 파티클이 올라가는 경로와 겹치지 않도록 충분히 위쪽에 표시
      foundMsg.style.left = localX + 'px';
      foundMsg.style.top = (localY - 90) + 'px';
      foundMsg.classList.add('show');
      setTimeout(() => foundMsg.classList.remove('show'), 900);

      setTimeout(() => {
        boraVisual.classList.remove('bounce');
        boraWalker.resume();
        animating = false;
      }, 600);
    });
  }

  /** 신랑 / 신부 터치 시 머리 위에 큰 하트 (3배 크기, 수직으로만 상승, 계속 불투명) */
  function setupCoupleHeartTap(){
    const particleLayer = document.getElementById('introParticles');
    const startOffsetX = { groom: 0, bride: -14 }; // 신부는 시작 위치를 살짝 왼쪽으로

    ['groom', 'bride'].forEach((who) => {
      const el = document.querySelector(`.char--${who}`);
      if (!el) return;
      el.addEventListener('click', () => {
        WeddingSound.unlock();
        WeddingSound.tap();
        const { x: localX, y: localY } = localCenter(el, el.parentElement);
        const type = Math.random() < 0.5 ? 'heart' : 'heart2';
        spawnParticle(
          particleLayer,
          localX + startOffsetX[who],
          localY,
          type,
          0, // 수평 이동 없이 수직으로만 상승
          -(60 + Math.random() * 20),
          0,
          true
        );
      });
    });
  }

  /** 보라 걷기 스프라이트 애니메이션: bora1.png / bora2.png 번갈아 표시 */
  function setupBoraSprite(){
    const boraVisual = document.getElementById('boraVisual');
    let frame = 1;

    setInterval(() => {
      const img = document.getElementById('boraSprite');
      if (!img || boraVisual.classList.contains('img-fallback')) return;

      frame = frame === 1 ? 2 : 1;
      const nextSrc = `assets/bora${frame}.png`;

      // 이미지가 실제로 로드되는지 먼저 확인한 뒤 교체 (없는 프레임으로 바꾸다 깨지는 것 방지)
      const test = new Image();
      test.onload = () => { img.src = nextSrc; };
      test.onerror = () => { /* 해당 프레임이 없으면 현재 모습 유지 */ };
      test.src = nextSrc;
    }, BORA_FRAME_MS);
  }

  function setupScrollHint(){
    const btn = document.getElementById('scrollHint');
    btn.addEventListener('click', () => {
      document.getElementById('greeting').scrollIntoView({ behavior: 'smooth' });
    });
  }

  async function start(){
    await runLoading();
    typeDialog();
    const boraWalker = setupBoraWalk();
    setupBoraEasterEgg(boraWalker);
    setupCoupleHeartTap();
    setupBoraSprite();
    setupScrollHint();
  }

  return { start };
})();
