/**
 * sound.js
 * 인트로/미니게임용 8비트 느낌 효과음 - 별도 음원 파일 없이 Web Audio API로 즉석 생성합니다.
 * (브라우저 자동재생 정책 때문에 반드시 사용자의 첫 터치/클릭 이후에만 소리가 납니다 -
 *  각 사운드 트리거 지점에서 unlock()을 함께 호출하도록 되어 있어 별도 설정이 필요 없습니다.)
 */
const WeddingSound = (() => {
  let ctx = null;
  let unlocked = false;

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

   /** 신랑/신부 터치 */
   tap(){
    beep({ freq: 540, duration: 0.08, type: 'square', volume: 0.15, slideTo: 640 });
  },

  /** 🐶 보라 터치 (새로 추가) */
  tapBora(){
    // 톤을 살짝 높이고 연속된 2개 음으로 귀엽게 표현
    beep({ freq: 700, duration: 0.06, type: 'square', volume: 0.16, slideTo: 880 });
    beep({ freq: 1050, duration: 0.09, type: 'square', volume: 0.16, delay: 0.05 });
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
