/**
 * sound.js
 * 인트로/미니게임용 8비트 느낌 효과음 - 별도 음원 파일 없이 Web Audio API로 즉석 생성합니다.
 * (브라우저 자동재생 정책 때문에 반드시 사용자의 첫 터치/클릭 이후에만 소리가 납니다 -
 *  각 사운드 트리거 지점에서 unlock()을 함께 호출하도록 되어 있어 별도 설정이 필요 없습니다.)
 */
const WeddingSound = (() => {
  let ctx = null;
  let unlocked = false;

  // ---------- 큐피드 화살 게임 전용 배경음악 ----------
  // 이 경로에 실제 음원 파일(mp3/ogg/wav 등)을 넣으면 게임 중에 자동으로 재생됩니다.
  // 파일이 없으면 배경음악 없이 조용히 진행됩니다.
  const BGM_ASSET_PATH = 'assets/bgm.mp3';
  const BGM_FILE_VOLUME = 0.35;      // 직접 넣은 음원 파일의 재생 볼륨
  const BGM_MUTE_STORAGE_KEY = 'wedding_bgm_muted';

  let bgmDesired = false;   // 게임 로직상 재생되어야 하는 상태인지 (startBgm~stopBgm 사이)
  let bgmActive = false;    // 음소거까지 반영해 실제로 소리가 나고 있는 상태인지
  let muted = false;
  try{ muted = localStorage.getItem(BGM_MUTE_STORAGE_KEY) === '1'; }catch(e){ /* 저장소 접근 불가 시 기본값(꺼짐 아님) 유지 */ }

  let bgmFileCheckPromise = null;
  let bgmAudioEl = null;
  let bgmGeneration = 0;

  /** assets/bgm.* 파일이 실제로 재생 가능한지 한 번만 확인해서 결과를 재사용 */
  function checkBgmFile(){
    if (bgmFileCheckPromise) return bgmFileCheckPromise;
    bgmFileCheckPromise = new Promise((resolve) => {
      try{
        const audio = new Audio(BGM_ASSET_PATH);
        audio.preload = 'auto';
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          audio.removeEventListener('canplaythrough', onOk);
          audio.removeEventListener('error', onErr);
          resolve(result);
        };
        const onOk = () => finish(audio);
        const onErr = () => finish(null);
        audio.addEventListener('canplaythrough', onOk, { once: true });
        audio.addEventListener('error', onErr, { once: true });
        audio.load();
      }catch(e){ resolve(null); }
    });
    return bgmFileCheckPromise;
  }

  /** 실제 재생을 시작 - assets/bgm.* 파일이 있을 때만 재생, 없으면 조용히 아무것도 하지 않음 */
  async function beginPlayback(){
    bgmGeneration++;
    const gen = bgmGeneration;
    const fileAudio = await checkBgmFile();
    if (gen !== bgmGeneration || !bgmActive) return; // 대기하는 동안 상태가 바뀌었으면 취소
    if (!fileAudio) return;

    bgmAudioEl = fileAudio;
    fileAudio.loop = true;
    fileAudio.volume = BGM_FILE_VOLUME;
    try{ fileAudio.currentTime = 0; }catch(e){ /* 무시 */ }
    fileAudio.play().catch(() => { /* 자동재생 정책으로 실패해도 조용히 무시 */ });
  }

  function endPlayback(){
    bgmGeneration++; // 대기 중이던 비동기 재생 시도를 무효화
    if (bgmAudioEl) bgmAudioEl.pause();
  }

  /** bgmDesired(게임 재생 여부)와 muted(사용자 설정)를 함께 반영해 최종 재생 상태를 맞춤 */
  function applyBgmState(){
    const shouldPlay = bgmDesired && !muted;
    if (shouldPlay && !bgmActive){
      bgmActive = true;
      beginPlayback();
    } else if (!shouldPlay && bgmActive){
      bgmActive = false;
      endPlayback();
    }
  }

  /** 게임 시작 시 호출 */
  function startBgm(){
    bgmDesired = true;
    applyBgmState();
  }

  /** 게임 종료(게임오버) 시 호출 */
  function stopBgm(){
    bgmDesired = false;
    applyBgmState();
  }

  function setMuted(v){
    muted = !!v;
    try{ localStorage.setItem(BGM_MUTE_STORAGE_KEY, muted ? '1' : '0'); }catch(e){ /* 무시 */ }
    applyBgmState();
  }

  function toggleMuted(){
    setMuted(!muted);
    return muted;
  }

  function isMuted(){ return muted; }

  function getCtx(){
    if (!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  }

  function unlock(){
    if (unlocked) return;
    const c = getCtx();
    if (!c) return;
    unlocked = true;
    if (c.state === 'suspended') c.resume().catch(() => {});
    checkBgmFile(); // 사용자의 첫 터치 시점에 미리 파일 유무를 확인해둬서, 이후 재생 시 지연 없이 바로 재생되도록 함
  }

  /** 짧은 8비트 톤(비프) 하나 재생 */
  function beep({ freq = 440, duration = 0.09, type = 'square', volume = 0.16, slideTo = null, delay = 0 } = {}){
    const c = getCtx();
    if (!c) return;
    try{
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo !== null){
        osc.frequency.linearRampToValueAtTime(slideTo, t0 + duration);
      }
      gain.gain.setValueAtTime(volume, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.03);
    }catch(e){ /* 오디오 재생 실패는 조용히 무시 (게임 진행에 영향 없음) */ }
  }

  return {
    unlock,
    startBgm,
    stopBgm,
    toggleMuted,
    isMuted,

   /** 신랑/신부 터치 */
   tap(){
    beep({ freq: 540, duration: 0.08, type: 'square', volume: 0.15, slideTo: 640 });
  },

  /** 🐶 보라 터치 - 통통 튀는 듯한 3연음 + triangle 파형으로 신랑/신부 tap()과는 확실히 다른 귀여운 톤 */
  tapBora(){
    beep({ freq: 620, duration: 0.05, type: 'triangle', volume: 0.18, slideTo: 820 });
    beep({ freq: 900, duration: 0.05, type: 'triangle', volume: 0.18, slideTo: 1100, delay: 0.06 });
    beep({ freq: 1250, duration: 0.1, type: 'triangle', volume: 0.16, slideTo: 950, delay: 0.12 });
  },

    /** 활을 누르고 당기기 시작 */
    draw(){
      beep({ freq: 180, duration: 0.16, type: 'sawtooth', volume: 0.07, slideTo: 260 });
    },

    /** 화살 발사(손을 뗌) */
    fire(){
      beep({ freq: 520, duration: 0.09, type: 'square', volume: 0.17, slideTo: 1000 });
    },

    /** 과녁 명중 (perfect일수록 화려하게) */
    hit(perfect){
      if (perfect){
        beep({ freq: 660, duration: 0.09, volume: 0.18 });
        beep({ freq: 880, duration: 0.11, volume: 0.18, delay: 0.08 });
        beep({ freq: 1175, duration: 0.16, volume: 0.18, delay: 0.16 });
      } else {
        beep({ freq: 520, duration: 0.09, volume: 0.16 });
        beep({ freq: 780, duration: 0.12, volume: 0.16, delay: 0.08 });
      }
    },

    /** 완전 정중앙(불스아이) 명중 - 가장 화려한 4음 상승 팡파르 */
    bullseye(){
      beep({ freq: 660, duration: 0.08, volume: 0.19 });
      beep({ freq: 880, duration: 0.09, volume: 0.19, delay: 0.07 });
      beep({ freq: 1175, duration: 0.1, volume: 0.19, delay: 0.14 });
      beep({ freq: 1568, duration: 0.22, volume: 0.19, delay: 0.21 });
    },

    /** 빗나가거나 놓쳐서 목숨이 줄어들 때 */
    miss(){
      beep({ freq: 220, duration: 0.22, type: 'sawtooth', volume: 0.16, slideTo: 90 });
    },

    /** 게임 오버 */
    gameOver(){
      beep({ freq: 420, duration: 0.16, type: 'square', volume: 0.16 });
      beep({ freq: 340, duration: 0.16, type: 'square', volume: 0.16, delay: 0.16 });
      beep({ freq: 220, duration: 0.34, type: 'square', volume: 0.16, delay: 0.32 });
    }
  };
})();
