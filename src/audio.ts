export type AudioMode = "demo" | "file" | "mic";

export interface AudioData {
  bass: number; // 0..1
  mid: number; // 0..1
  treble: number; // 0..1
  beat: number; // 0..1, spikes on a detected kick then decays
}

/**
 * Wraps a Web Audio AnalyserNode and turns the raw FFT into smoothed
 * bass/mid/treble bands plus a simple beat pulse. Falls back to a synthetic
 * "demo" signal so the visuals are alive before any audio is loaded.
 */
export class AudioEngine {
  mode: AudioMode = "demo";

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freq: Uint8Array = new Uint8Array(0);

  private audioEl: HTMLAudioElement | null = null;
  private elSource: MediaElementAudioSourceNode | null = null;
  private currentSource: AudioNode | null = null;

  // smoothing / beat state
  private sBass = 0;
  private sMid = 0;
  private sTreble = 0;
  private beatVal = 0;
  // onset (beat) detection state
  private prevLow = 0;
  private fluxAvg = 0;
  private lastFlux = 0;
  private beatCooldown = 0;

  get isPlaying(): boolean {
    return !!this.audioEl && !this.audioEl.paused;
  }

  private ensureCtx() {
    if (this.ctx) return;
    const Ctx: typeof AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55; // snappier so attacks survive
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -20; // more headroom -> louds don't peg to 255
    this.freq = new Uint8Array(this.analyser.frequencyBinCount); // 512
  }

  /** Disconnect any prior source and route a new one into the analyser. */
  private route(node: AudioNode, toSpeakers: boolean) {
    if (this.currentSource) {
      try {
        this.currentSource.disconnect();
      } catch {
        /* noop */
      }
    }
    node.connect(this.analyser!);
    if (toSpeakers) node.connect(this.ctx!.destination);
    this.currentSource = node;
  }

  async loadFile(file: File) {
    this.ensureCtx();
    await this.ctx!.resume();
    // A media element can only back one MediaElementSource for its lifetime,
    // so create the element + source once and just swap the src afterwards.
    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.loop = true;
      this.elSource = this.ctx!.createMediaElementSource(this.audioEl);
    }
    this.audioEl.src = URL.createObjectURL(file);
    this.route(this.elSource!, true);
    await this.audioEl.play();
    this.mode = "file";
  }

  async useMic() {
    this.ensureCtx();
    await this.ctx!.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mic = this.ctx!.createMediaStreamSource(stream);
    // mic is NOT routed to speakers (that would feed back)
    this.route(mic, false);
    this.audioEl?.pause();
    this.mode = "mic";
  }

  playPause() {
    if (!this.audioEl) return;
    if (this.audioEl.paused) this.audioEl.play();
    else this.audioEl.pause();
  }

  setDemo() {
    this.audioEl?.pause();
    if (this.currentSource) {
      try {
        this.currentSource.disconnect();
      } catch {
        /* noop */
      }
      this.currentSource = null;
    }
    this.mode = "demo";
  }

  /** Called once per frame. `time` is seconds since start. */
  update(time: number): AudioData {
    if (this.mode === "demo" || !this.analyser) {
      return this.demoData(time);
    }

    this.analyser.getByteFrequencyData(this.freq);
    const bins = this.freq.length; // 512 -> ~43 Hz per bin at 44.1 kHz
    const bass = avgRange(this.freq, 0, 8) / 255; // ~0-350 Hz
    const mid = avgRange(this.freq, 8, 80) / 255; // ~350 Hz - 3.5 kHz
    const treble = avgRange(this.freq, 80, bins) / 255; // ~3.5 kHz +

    const k = 0.3;
    this.sBass += (bass - this.sBass) * k;
    this.sMid += (mid - this.sMid) * k;
    this.sTreble += (treble - this.sTreble) * k;

    // Beat via positive spectral flux in the low band: a kick produces a sharp
    // rise in low-frequency energy. This fires on the *attack* rather than the
    // absolute level (which stays pinned high on bass-heavy tracks).
    const low = avgRange(this.freq, 1, 10) / 255;
    const flux = Math.max(0, low - this.prevLow);
    this.prevLow = low;
    this.lastFlux = flux;
    this.fluxAvg += (flux - this.fluxAvg) * 0.1;
    if (this.beatCooldown > 0) this.beatCooldown--;
    if (this.beatCooldown === 0 && flux > 0.04 && flux > this.fluxAvg * 1.6) {
      this.beatVal = 1.0;
      this.beatCooldown = 7; // debounce ~120ms @60fps
    } else {
      this.beatVal *= 0.86;
    }

    return {
      bass: this.sBass,
      mid: this.sMid,
      treble: this.sTreble,
      beat: this.beatVal,
    };
  }

  /** Diagnostics for automated validation (exposed on window.__capclu). */
  debugSnapshot() {
    let freqSum = 0;
    if (this.analyser) {
      const tmp = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(tmp);
      for (let i = 0; i < tmp.length; i++) freqSum += tmp[i];
    }
    return {
      mode: this.mode,
      isPlaying: this.isPlaying,
      ctxState: this.ctx?.state ?? "none",
      freqSum,
      flux: this.lastFlux,
      fluxAvg: this.fluxAvg,
    };
  }

  private demoData(time: number): AudioData {
    const bass = 0.45 + 0.35 * Math.sin(time * 1.7) * Math.sin(time * 0.5);
    const mid = 0.4 + 0.3 * Math.sin(time * 2.3 + 1.0);
    const treble = 0.35 + 0.3 * Math.sin(time * 3.7 + 2.0);
    // ~2 synthetic beats per second
    const phase = (time * 2.0) % 1.0;
    const beat = Math.max(0, 1.0 - phase * 4.0);
    return {
      bass: clamp01(bass),
      mid: clamp01(mid),
      treble: clamp01(treble),
      beat,
    };
  }
}

function avgRange(a: Uint8Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += a[i];
  return sum / Math.max(1, end - start);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
