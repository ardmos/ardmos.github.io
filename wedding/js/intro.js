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

  function runLoading(){
    return new Promise((resolve) => {
      const fill = document.getElementById('loadingBarFill');
      const screen = document.getElementById('loading-screen');
      requestAnimationFrame(() => { fill.style.width = '100%'; });

      setTimeout(() => {
        screen.classList.add('hide');
        setTimeout(resolve, 500);
      }, 1200);
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

  function setupBoraEasterEgg(){
    const bora = document.getElementById('bora');
    const boraVisual = document.getElementById('boraVisual');
    const particleLayer = document.getElementById('introParticles');
    const foundMsg = document.getElementById('boraFound');
    let animating = false;
    let tapCount = 0;

    bora.addEventListener('click', () => {
      if (animating) return;
      animating = true;
      tapCount++;

      const { x: localX, y: localY } = localCenter(bora, bora.parentElement);

      // 걷기를 잠시 멈추고 제자리에서 점프
      bora.classList.add('jump');
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
        bora.classList.remove('jump');
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
    setupBoraEasterEgg();
    setupCoupleHeartTap();
    setupBoraSprite();
    setupScrollHint();
  }

  return { start };
})();
