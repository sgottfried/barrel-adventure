// Synthesized equivalents of the native game's sounds; no audio assets needed.
(() => {
  let context;
  const tones = {
    launch: [[110, 64, 0.13, 0.32], [170, 230, 0.08, 0.15]],
    land: [[430, 250, 0.12, 0.25]],
    hit: [[150, 72, 0.20, 0.34]],
    fall: [[390, 72, 0.28, 0.24]],
    levelClear: [[523, 523, 0.10, 0.20], [659, 659, 0.10, 0.20], [784, 784, 0.17, 0.24]],
    extraLife: [[784, 784, 0.08, 0.18], [1047, 1047, 0.14, 0.22]],
    gameOver: [[330, 220, 0.16, 0.24], [220, 110, 0.28, 0.28]],
  };
  window.unlockAudio = () => {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!context && Audio) context = new Audio();
      if (context?.state === "suspended") context.resume().catch(() => {});
    } catch { /* Keep the game playable without audio support. */ }
  };
  window.playSound = (effect) => {
    if (!context || context.state !== "running") return;
    let start = context.currentTime;
    for (const [from, to, duration, volume] of tones[effect] || []) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.linearRampToValueAtTime(to, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * 0.65, start + duration * 0.05);
      gain.gain.setValueAtTime(volume * 0.65, start + duration * 0.875);
      gain.gain.linearRampToValueAtTime(0, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      start += duration;
    }
  };
})();
