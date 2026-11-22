// Web Audio synthesized sounds — no audio files, no network.
let ctx = null;
let muted = false;
let alarmNodes = null;

export function ensureAudio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
}
export function toggleMute() { muted = !muted; if (muted) stopAlarm(); return muted; }
export function isMuted() { return muted; }

function tone(freq, dur, type, vol, slideTo) {
  if (muted || !ensureAudio()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol || 0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, vol, freq) {
  if (muted || !ensureAudio()) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 800;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t);
}
export const sfx = {
  step() { noiseBurst(0.05, 0.03, 500); },
  stepLoud() { noiseBurst(0.07, 0.07, 700); },
  pickup() { tone(660, 0.12, "sine", 0.12); setTimeout(() => tone(990, 0.14, "sine", 0.12), 70); },
  door() { noiseBurst(0.18, 0.1, 300); tone(120, 0.15, "square", 0.05, 70); },
  locked() { tone(140, 0.1, "square", 0.09); setTimeout(() => tone(110, 0.12, "square", 0.09), 110); },
  hack() { tone(440, 0.08, "square", 0.07); setTimeout(() => tone(560, 0.08, "square", 0.07), 90); setTimeout(() => tone(720, 0.1, "square", 0.07), 180); setTimeout(() => tone(980, 0.16, "sine", 0.1), 280); },
  throwRock() { noiseBurst(0.12, 0.06, 1200); },
  rockLand() { noiseBurst(0.2, 0.14, 400); tone(90, 0.15, "sine", 0.1, 50); },
  suspicious() { tone(330, 0.25, "triangle", 0.12, 440); },
  alert() { tone(220, 0.3, "sawtooth", 0.12, 440); setTimeout(() => tone(440, 0.3, "sawtooth", 0.1, 220), 160); },
  hurt() { tone(160, 0.25, "sawtooth", 0.14, 60); },
  success() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, "sine", 0.12), i * 110)); },
  fail() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, "triangle", 0.11), i * 140)); },
  click() { tone(700, 0.06, "sine", 0.08); },
};
export function startAlarm() {
  if (muted || !ensureAudio() || alarmNodes) return;
  const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 520;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 1.6;
  const lg = ctx.createGain(); lg.gain.value = 160;
  lfo.connect(lg); lg.connect(o.frequency);
  const g = ctx.createGain(); g.gain.value = 0.045;
  o.connect(g); g.connect(ctx.destination);
  o.start(); lfo.start();
  alarmNodes = { o, lfo, g };
}
export function stopAlarm() {
  if (!alarmNodes) return;
  try { alarmNodes.o.stop(); alarmNodes.lfo.stop(); } catch (e) {}
  alarmNodes = null;
}
