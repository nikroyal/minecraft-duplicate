let audioCtx = null;

export function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

let noiseBuffer = null;
function getNoiseBuffer(ctx) {
  if (noiseBuffer) return noiseBuffer;
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return noiseBuffer;
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
}

let activeHissSource = null;
let activeHissGain = null;

export function playHissSound(duration = 1.5) {
  const ctx = getAudioContext();
  if (!ctx) return;

  stopHissSound();

  const now = ctx.currentTime;
  activeHissSource = ctx.createBufferSource();
  activeHissSource.buffer = getNoiseBuffer(ctx);
  activeHissSource.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(2000, now);

  activeHissGain = ctx.createGain();
  activeHissGain.gain.setValueAtTime(0.01, now);
  activeHissGain.gain.linearRampToValueAtTime(0.35, now + duration);

  activeHissSource.connect(filter);
  filter.connect(activeHissGain);
  activeHissGain.connect(ctx.destination);

  activeHissSource.start(now);
}

export function stopHissSound() {
  if (activeHissSource) {
    try {
      activeHissSource.stop();
    } catch (e) {}
    activeHissSource = null;
  }
  activeHissGain = null;
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
}
