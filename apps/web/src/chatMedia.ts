// What the app works out of a file before it goes in a message (design/chat.md, 4 and 11.5): a
// photo's or a video's size and a small picture of it, a recording's or a video's length. The
// server does none of it. And the recorder of a voice message, with how loud it is as it goes.

/** What a file is known by before it is sent. */
export interface Measured {
  width?: number;
  height?: number;
  duration?: number;
  /** A small picture of a photo or a video, at most 1280 pixels on its long side. */
  thumb?: Blob;
}

// Sharp on a phone's screen, where one photo is the message's whole width.
const THUMB = 1280;

/** A picture drawn small, as WebP, or JPEG where the browser does not write WebP (Safari). */
async function small(source: CanvasImageSource, width: number, height: number): Promise<Blob | undefined> {
  const scale = Math.min(1, THUMB / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  const as = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  const webp = await as('image/webp');
  if (webp?.type === 'image/webp') return webp;
  return (await as('image/jpeg')) ?? undefined;
}

/** Measures a file: a photo, a video or a recording; anything else is sent as it is. */
export async function measure(file: Blob): Promise<Measured> {
  try {
    if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
      const bitmap = await createImageBitmap(file);
      const thumb = Math.max(bitmap.width, bitmap.height) > THUMB ? await small(bitmap, bitmap.width, bitmap.height) : undefined;
      const measured = { width: bitmap.width, height: bitmap.height, ...(thumb && { thumb }) };
      bitmap.close();
      return measured;
    }
    if (file.type.startsWith('video/')) return await videoOf(file);
    if (file.type.startsWith('audio/')) return { duration: await lengthOf(file) };
  } catch {
    // Not read: it goes without its size and picture.
  }
  return {};
}

/**
 * A video's size and length, as soon as they are known, and its picture at half a second. An
 * iPhone gives no picture of a video off the page that has not played: it is put on the page,
 * unseen, and played muted for a moment. Without a picture it goes with its size and length.
 */
function videoOf(file: Blob): Promise<Measured> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.append(video);
  return new Promise<Measured>((resolve) => {
    let known: Measured = {};
    let finished = false;
    const done = (measured: Measured) => {
      if (finished) return;
      finished = true;
      video.pause();
      video.remove();
      URL.revokeObjectURL(url);
      resolve(measured);
    };
    video.onloadedmetadata = () => {
      known = {
        ...(video.videoWidth && { width: video.videoWidth, height: video.videoHeight }),
        ...(Number.isFinite(video.duration) && { duration: video.duration }),
      };
      window.setTimeout(() => done(known), 3000);
      video.currentTime = Math.min(0.5, video.duration / 2 || 0);
      void video.play().then(
        () => video.pause(),
        () => undefined,
      );
    };
    video.onseeked = async () => {
      if (finished) return;
      const thumb = video.videoWidth ? await small(video, video.videoWidth, video.videoHeight) : undefined;
      done({ ...known, ...(thumb && { thumb }) });
    };
    video.onerror = () => done(known);
    window.setTimeout(() => done(known), 8000);
    video.src = url;
  });
}

function lengthOf(file: Blob): Promise<number | undefined> {
  const url = URL.createObjectURL(file);
  const audio = new Audio();
  return new Promise((resolve) => {
    const done = (seconds: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(seconds !== undefined && Number.isFinite(seconds) ? seconds : undefined);
    };
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(undefined);
    window.setTimeout(() => done(undefined), 5000);
    audio.preload = 'metadata';
    audio.src = url;
  });
}

/** A recording's length, in words: 0:14, 12:03. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** A file's size in words: 182 KB, 4.2 MB. */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** What kind of file it is, for its row: PDF, ZIP, PNG; from its name, else its type. */
export function kindText(name: string, type: string): string {
  const extension = /\.([a-z0-9]{1,6})$/i.exec(name)?.[1];
  if (extension) return extension.toUpperCase();
  return type.split('/')[1]?.toUpperCase() ?? '';
}

/** The longest a voice message records. */
export const MAX_RECORDING_S = 15 * 60;

/** A voice message being recorded: how loud it is as it goes, and its recording when it stops. */
export class Recording {
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private stream: MediaStream;
  private context: AudioContext;
  private analyser: AnalyserNode;
  readonly started = Date.now();
  private ended: Promise<Blob>;

  private constructor(stream: MediaStream) {
    this.stream = stream;
    // As notes record: Opus in WebM where the browser writes it, else its own (MP4 on Safari).
    const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    this.recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    this.recorder.addEventListener('dataavailable', (event) => event.data.size > 0 && this.chunks.push(event.data));
    this.ended = new Promise((resolve) =>
      this.recorder.addEventListener('stop', () => {
        for (const track of stream.getTracks()) track.stop();
        void this.context.close().catch(() => undefined);
        resolve(new Blob(this.chunks, { type: (this.recorder.mimeType || 'audio/webm').split(';')[0] }));
      }),
    );
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.context.createMediaStreamSource(stream).connect(this.analyser);
    this.recorder.start(250);
  }

  /** Starts recording from the microphone; null when it may not be used. */
  static async start(): Promise<Recording | null> {
    try {
      return new Recording(await navigator.mediaDevices.getUserMedia({ audio: true }));
    } catch {
      return null;
    }
  }

  /** How loud it is now, 0 to 1. */
  level(): number {
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) sum += ((value - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / data.length) * 3);
  }

  seconds(): number {
    return (Date.now() - this.started) / 1000;
  }

  /** Stops it, with its recording. */
  stop(): Promise<Blob> {
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    return this.ended;
  }
}
