/** Records the canvas to a downloadable .webm via MediaRecorder. */
export class Recorder {
  recording = false;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(private canvas: HTMLCanvasElement) {}

  private pickMime(): string {
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  }

  start() {
    const stream = this.canvas.captureStream(60);
    this.chunks = [];
    this.rec = new MediaRecorder(stream, {
      mimeType: this.pickMime(),
      videoBitsPerSecond: 12_000_000,
    });
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `capclu-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    // Timeslice flushes chunks periodically — without it, short/headless
    // recordings can yield an empty container.
    this.rec.start(100);
    this.recording = true;
  }

  stop() {
    this.rec?.stop();
    this.recording = false;
  }

  toggle() {
    if (this.recording) this.stop();
    else this.start();
  }
}
