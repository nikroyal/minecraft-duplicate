let audioCtx = null;
let cachedSampleRate = 0;

export function initAudio() {
  if (audioCtx) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
    }
  } catch (e) {
    console.warn("Web Audio API not supported", e);
  }
}

function getAudioContext() {
  if (!audioCtx) {
    initAudio();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getNoiseBuffer(ctx) {
  if (ctx._cachedNoiseBuffer && cachedSampleRate === ctx.sampleRate) return ctx._cachedNoiseBuffer;
  cachedSampleRate = ctx.sampleRate;
  const bufferSize = Math.floor(ctx.sampleRate * 0.5); // 0.5s noise buffer
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  ctx._cachedNoiseBuffer = buffer;
  return buffer;
}

function safeDisconnect(...nodes) {
  nodes.forEach(node => {
    if (node) {
      try { node.disconnect(); } catch (e) {}
    }
  });
}

export function playMineSound(blockId) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(500, now);
  filter.Q.setValueAtTime(3.0, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  
  noise.start(now);
  noise.stop(now + 0.08);

  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
  
  oscGain.gain.setValueAtTime(0.3, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);

  setTimeout(() => safeDisconnect(noise, filter, gain, osc, oscGain), 120);
}

export function playPlaceSound(blockId) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
  
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(now);
  osc.stop(now + 0.15);

  setTimeout(() => safeDisconnect(osc, gain), 200);
}

export function playFootstepSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(250, now);
  
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  
  noise.start(now);
  noise.stop(now + 0.05);

  setTimeout(() => safeDisconnect(noise, filter, gain), 100);
}

export function playHitSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.setValueAtTime(100, now + 0.05);
  
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(600, now);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(now);
  osc.stop(now + 0.14);

  setTimeout(() => safeDisconnect(osc, filter, gain), 200);
}

let activeHissSource = null;
let activeHissGain = null;
let activeHissFilter = null;

export function playHissSound(duration = 1.5) {
  const ctx = getAudioContext();
  if (!ctx) return;

  stopHissSound();

  const now = ctx.currentTime;
  activeHissSource = ctx.createBufferSource();
  activeHissSource.buffer = getNoiseBuffer(ctx);
  activeHissSource.loop = true;

  activeHissFilter = ctx.createBiquadFilter();
  activeHissFilter.type = "highpass";
  activeHissFilter.frequency.setValueAtTime(2000, now);

  activeHissGain = ctx.createGain();
  activeHissGain.gain.setValueAtTime(0.01, now);
  activeHissGain.gain.linearRampToValueAtTime(0.35, now + duration);

  activeHissSource.connect(activeHissFilter);
  activeHissFilter.connect(activeHissGain);
  activeHissGain.connect(ctx.destination);

  activeHissSource.start(now);
  activeHissSource.stop(now + duration + 0.1);
}

export function stopHissSound() {
  if (!activeHissSource) return;
  const src = activeHissSource;
  const gain = activeHissGain;
  const flt = activeHissFilter;

  activeHissSource = null;
  activeHissGain = null;
  activeHissFilter = null;

  if (gain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(Math.max(0.001, gain.gain.value), now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
    } catch(e) {}
  }

  try { src.stop(audioCtx ? audioCtx.currentTime + 0.05 : 0); } catch (e) {}
  setTimeout(() => {
    safeDisconnect(src, gain, flt);
  }, 70);
}

export function playExplodeSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  stopHissSound();

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(20, now + 0.8);
  
  oscGain.gain.setValueAtTime(0.8, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.8);

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(50, now + 1.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  
  noise.start(now);
  noise.stop(now + 1.2);

  setTimeout(() => safeDisconnect(osc, oscGain, noise, filter, gain), 1300);
}

export function playPigSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.linearRampToValueAtTime(110, now + 0.12);
  
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(320, now);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(now);
  osc.stop(now + 0.15);

  setTimeout(() => safeDisconnect(osc, gain, filter), 200);
}

export function playSheepSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.linearRampToValueAtTime(110, now + 0.4);
  
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 16; 
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.04;
  
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(450, now);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  
  lfo.start(now);
  osc.start(now);
  lfo.stop(now + 0.45);
  osc.stop(now + 0.45);

  setTimeout(() => safeDisconnect(osc, gain, lfo, lfoGain, filter), 500);
}

export function playZombieSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(65, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.7);
  
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(220, now);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(now);
  osc.stop(now + 0.75);

  setTimeout(() => safeDisconnect(osc, gain, filter), 800);
}

export function playAchievementSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = "sine";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.08);
    osc.frequency.setValueAtTime(783.99, now + 0.16);
    osc.frequency.setValueAtTime(1046.50, now + 0.24);
    
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    
    osc.start(now);
    osc.stop(now + 0.6);
    osc.onended = () => {
      safeDisconnect(osc, gain);
    };
  } catch(e){}
}
