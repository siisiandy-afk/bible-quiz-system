// Audio Engine using Web Audio API procedural synthesis

let audioCtx = null;

export function initAudio() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function enableAudio() {
  initAudio();
  if (!audioCtx) return;

  // Play a silent note to unlock audio on iOS/Chrome
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

export function playElectricBell(name) {
  initAudio();
  if (!audioCtx || !name) return;

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash += name.charCodeAt(i);
  }
  const baseFreq = 500 + (hash % 300);

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);

  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.type = 'square';
  lfo.frequency.value = 18;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);

  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(baseFreq * 1.45, audioCtx.currentTime);

  osc.connect(gain);
  osc2.connect(gain2);
  gain.connect(audioCtx.destination);
  gain2.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  const duration = 1.2;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  gain2.gain.setValueAtTime(0, now);
  gain2.gain.linearRampToValueAtTime(0.2, now + 0.05);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration / 2);

  osc.start(now);
  osc2.start(now);
  lfo.start(now);

  osc.stop(now + duration);
  osc2.stop(now + duration);
  lfo.stop(now + duration);
}

export function playTimeUpSound() {
  initAudio();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 1);
  gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 1);
}

export function playDisconnectSound() {
  initAudio();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(300, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.5);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
}
