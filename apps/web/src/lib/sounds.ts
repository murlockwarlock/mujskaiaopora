type SoundName = 'message' | 'call';

const patterns: Record<SoundName, number[]> = {
  message: [740],
  call: [440, 554, 659]
};

export function playSound(name: SoundName): void {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;
  const context = new AudioContextConstructor();
  patterns[name].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, context.currentTime + index * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + index * 0.18 + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + index * 0.18);
    oscillator.stop(context.currentTime + index * 0.18 + 0.16);
  });
  window.setTimeout(() => void context.close(), patterns[name].length * 180 + 300);
}
