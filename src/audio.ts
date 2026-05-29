export type AudioMode = "demo" | "file" | "mic" | "system";

export interface AudioData {
  bass: number; // 0..1
  mid: number; // 0..1
  treble: number; // 0..1
  beat: number; // 0..1, spikes on a detected kick then decays
  bigBeat: number; // 0..1, fires on strong/periodic beats
  energy: number; // 0..1, slow overall level (drives flow pace / mood)
  tilt: number; // 0..1, spectral brightness (bass-heavy -> bright), slow
  pace: number; // 0..1, tempo-ish: faster beats -> higher (drives motion speed)
  accent: number; // 0..1, strength of the latest onset (snappy) -> direct beat hit
  aggression: number; // 0..1, medium-smoothed intensity -> turbulence / "angry"
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
  private freq = new Uint8Array(0);

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
  private beatCounter = 0;
  private bigBeatVal = 0;
  private energyS = 0;
  private tiltS = 0.5;
  // tempo / pace
  private lastBeatT = 0;
  private beatIntervalS = 0.5;
  private paceS = 0.4;
  // beat strength + intensity tracking
  private accentVal = 0;
  private aggrS = 0;

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
    this.analyser.maxDecibels = -25;
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

  /**
   * Capture whatever is playing on the device via the screen-share API.
   * The user picks a screen/tab and must enable "share audio". We keep only
   * the audio track (the video track is stopped immediately).
   */
  async useSystemAudio() {
    this.ensureCtx();
    await this.ctx!.resume();
    const md = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
    };
    const stream = await md.getDisplayMedia({ video: true, audio: true });
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("no_audio_track");
    }
    stream.getVideoTracks().forEach((t) => t.stop()); // we only need the audio
    const src = this.ctx!.createMediaStreamSource(stream);
    this.route(src, false); // already audible on the device; don't echo
    this.audioEl?.pause();
    this.mode = "system";
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
    const bass = avgRange(this.freq, 0, 7) / 255; // ~0-300 Hz
    const mid = avgRange(this.freq, 7, 56) / 255; // ~300 Hz - 2.4 kHz
    // treble focuses on the lively part of the high end and gets a small boost
    const treble = Math.min(1, (avgRange(this.freq, 56, 220) / 255) * 1.4);

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
    let fired = false;
    if (this.beatCooldown === 0 && flux > 0.04 && flux > this.fluxAvg * 1.6) {
      this.beatVal = 1.0;
      this.beatCooldown = 7; // debounce ~120ms @60fps
      fired = true;
    } else {
      this.beatVal *= 0.86;
    }

    // bigBeat: a strong onset, or every 4th beat -> drives structural events
    if (fired) {
      this.beatCounter++;
      if (flux > this.fluxAvg * 3 || this.beatCounter % 4 === 0) {
        this.bigBeatVal = 1.0;
      }
    } else {
      this.bigBeatVal *= 0.92;
    }

    // accent: how hard the latest onset hit. Sharpness (relative to the song's
    // own average) is scaled by ABSOLUTE low-band loudness, so a soft lofi kick
    // stays gentle while a punchy EDM kick hits hard. Snappy (decays fast).
    if (fired) {
      const sharp = clamp01(flux / (this.fluxAvg * 3 + 0.05));
      const loud = clamp01(low * 1.6);
      this.accentVal = Math.max(this.accentVal, sharp * (0.3 + 0.7 * loud));
    } else {
      this.accentVal *= 0.85;
    }

    // tempo / pace: shorter gaps between detected beats -> higher pace
    if (fired) {
      const gap = time - this.lastBeatT;
      if (gap > 0.12 && gap < 2.0) {
        this.beatIntervalS += (gap - this.beatIntervalS) * 0.3;
      }
      this.lastBeatT = time;
    }
    const paceTarget = clamp01((0.85 - this.beatIntervalS) / (0.85 - 0.28));
    this.paceS += (paceTarget - this.paceS) * 0.02;

    // slow song-character signals
    const e = (this.sBass + this.sMid + this.sTreble) / 3;
    this.energyS += (e - this.energyS) * 0.02;
    const tilt = this.sTreble / (this.sBass + this.sTreble + 0.001);
    this.tiltS += (tilt - this.tiltS) * 0.02;

    // aggression = the song's overall intensity / genre character: energy +
    // tempo + brightness, with a wider range so a calm lofi track reads low and
    // an upbeat EDM track reads high. (accent handles the per-beat hit on top.)
    const aggrInst = clamp01(
      (this.energyS * 0.45 + this.paceS * 0.35 + this.sTreble * 0.2) * 1.3
    );
    this.aggrS += (aggrInst - this.aggrS) * 0.04;

    return {
      bass: this.sBass,
      mid: this.sMid,
      treble: this.sTreble,
      beat: this.beatVal,
      bigBeat: this.bigBeatVal,
      energy: this.energyS,
      tilt: this.tiltS,
      pace: this.paceS,
      accent: this.accentVal,
      aggression: this.aggrS,
    };
  }

  /** Diagnostics for automated validation (exposed on window.__aether). */
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
    // a big beat every ~2.7s
    const bigPhase = (time / 2.7) % 1.0;
    const bigBeat = Math.max(0, 1.0 - bigPhase * 10.0);
    const energy = clamp01((bass + mid + treble) / 3);
    const tilt = 0.5 + 0.4 * Math.sin(time * 0.07); // slow drift in demo
    const pace = clamp01(0.45 + 0.3 * Math.sin(time * 0.08));
    const aggression = clamp01(0.25 + energy * 0.6);
    return {
      bass: clamp01(bass),
      mid: clamp01(mid),
      treble: clamp01(treble),
      beat,
      bigBeat,
      energy,
      tilt,
      pace,
      accent: beat, // the synthetic beat spike doubles as accent in demo
      aggression,
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
