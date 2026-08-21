/**
 * invitation.js
 * 스크롤 reveal, 갤러리 라이트박스, 오시는길/연락처/계좌 아코디언, 계좌 복사, D-day
 */
const WeddingInvitation = (() => {
  const WEDDING_DATE = new Date('2026-11-01T11:00:00+09:00');
  const VENUE = { lat: 37.3873028, lng: 127.1224062, name: '더메리든' };

  // ---------- 네이버 지도 ----------
  function setupNaverMap(){
    const el = document.getElementById('naverMap');
    if (!el) return;

    if (window.naver && naver.maps){
      const center = new naver.maps.LatLng(VENUE.lat, VENUE.lng);
      const map = new naver.maps.Map('naverMap', {
        center, zoom: 16,
        zoomControl: true,
        zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT }
      });
      new naver.maps.Marker({ position: center, map, title: VENUE.name });
    } else {
      // 네이버 지도 API 클라이언트 아이디가 아직 설정되지 않은 경우의 대체 화면
      el.classList.add('map-fallback');
      el.innerHTML = '<span class="pixel-font">MAP</span>';
    }
  }

  // ---------- 스크롤 reveal ----------
  function setupScrollReveal(){
    const targets = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting){
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    targets.forEach(t => io.observe(t));
  }

  // ---------- 갤러리 (5열 촘촘한 그리드, 한두 장만 살짝 크게) ----------
  const GALLERY_COUNT = 24;
  const FEATURED_EVERY = 9; // 약 2~3장 정도만 크게 보이도록
  let galleryPhotos = [];
  let lightboxIndex = 0;

  function setupGallery(){
    const grid = document.getElementById('galleryGrid');
    galleryPhotos = Array.from({ length: GALLERY_COUNT }, (_, i) => `assets/gallery/photo (${i + 1}).jpg`);

    grid.innerHTML = galleryPhotos.map((src, i) => {
      const featured = (i + 1) % FEATURED_EVERY === 0;
      return `
      <div class="gallery-item${featured ? ' featured' : ''}" data-index="${i}">
        <img data-src="${src}" alt="갤러리 사진 ${i + 1}" decoding="async"
             draggable="false" oncontextmenu="return false;"
             onload="this.classList.add('loaded')"
             onerror="this.parentElement.style.background='var(--c-beige)'; this.remove();">
      </div>
    `;
    }).join('');

    grid.addEventListener('click', (e) => {
      const item = e.target.closest('.gallery-item');
      if (!item) return;
      openLightbox(Number(item.dataset.index));
    });

    setupGalleryLazyLoad(grid);
    setupLightbox();
  }

  /** 네이티브 loading="lazy"는 화면에 거의 닿아야 로딩을 시작해 스크롤 중 늦게 뜨는 느낌을 줌 -
   *  화면에 들어오기 훨씬 전(rootMargin 600px)부터 미리 로딩을 시작해 체감 속도를 개선 */
  function setupGalleryLazyLoad(grid){
    const imgs = grid.querySelectorAll('img[data-src]');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting){
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          io.unobserve(img);
        }
      });
    }, { rootMargin: '600px 0px', threshold: 0.01 });
    imgs.forEach(img => io.observe(img));
  }

  function setupLightbox(){
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    const closeBtn = document.getElementById('lightboxClose');
    const prevBtn = document.getElementById('lightboxPrev');
    const nextBtn = document.getElementById('lightboxNext');
    const stage = document.querySelector('.lightbox-stage');

    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    prevBtn.addEventListener('click', () => showLightbox(lightboxIndex - 1));
    nextBtn.addEventListener('click', () => showLightbox(lightboxIndex + 1));

    let touchStartX = 0;
    stage.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40){
        showLightbox(lightboxIndex + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });

    window.__openLightboxImg = img;
  }

  function openLightbox(index){
    document.getElementById('lightbox').classList.add('open');
    showLightbox(index);
  }
  function closeLightbox(){
    document.getElementById('lightbox').classList.remove('open');
  }
  function showLightbox(index){
    const total = galleryPhotos.length;
    lightboxIndex = (index + total) % total;
    document.getElementById('lightboxImg').src = galleryPhotos[lightboxIndex];
  }

  // ---------- 아코디언 ----------
  function setupAccordions(){
    document.querySelectorAll('.accordion-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = document.getElementById(btn.dataset.target);
        const caret = btn.querySelector('.accordion-caret');
        const isOpen = panel.classList.toggle('open');
        if (caret) caret.textContent = isOpen ? '－' : '＋';
      });
    });
  }

  // ---------- 계좌 복사 ----------
  function setupCopyButtons(){
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.copy;
        try{
          await navigator.clipboard.writeText(text);
        }catch(e){
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        const original = btn.textContent;
        btn.textContent = '복사됨';
        setTimeout(() => { btn.textContent = original; }, 1500);
      });
    });
  }

  // ---------- D-day ----------
  function setupDday(){
    const el = document.getElementById('ddayText');
    const now = new Date();
    const diffMs = WEDDING_DATE - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0){
      el.textContent = `D-${diffDays}`;
    } else if (diffDays === 0){
      el.textContent = 'D-DAY ❤';
    } else {
      el.textContent = 'WE DID IT ❤';
    }
  }

  function start(){
    setupScrollReveal();
    setupGallery();
    setupAccordions();
    setupCopyButtons();
    setupDday();
    setupNaverMap();
  }

  return { start };
})();
