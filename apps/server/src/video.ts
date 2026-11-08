import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Blobs } from './blobs';

// A video in a message plays everywhere (design/chat.md 27). One whose picture is not H.264, as an
// iPhone's HEVC, which Windows draws only with an extension Microsoft sells, gets an H.264 copy;
// one sent without its size, length or first picture gets them. ffmpeg does it, one video at a
// time, with two cores at most, so that the server's other work goes on.

/** What ffprobe says of a video. */
export interface Probe {
  /** What its picture is coded in: `hevc`, `h264`; empty without a picture. */
  codec: string;
  /** As it is shown, turned as it is turned. */
  width?: number;
  height?: number;
  duration?: number;
  /** What its sound is coded in; null without sound. */
  audio: string | null;
  /** HDR, which a copy in SDR would show faded unless it is mapped. */
  hdr: boolean;
}

/** What reads and makes videos: ffmpeg's tools, or a test's. */
export interface VideoTools {
  probe(file: string): Promise<Probe>;
  /** Writes `out`: an H.264 and AAC MP4 of `file`, at most 1920 on its long side, that plays as it comes. */
  convert(file: string, out: string, probe: Probe): Promise<void>;
  /** Writes `out`: the picture at `at` seconds as WebP, at most 1280 on its long side. */
  poster(file: string, out: string, at: number, probe: Probe): Promise<void>;
}

/** What was found and made of a video. */
export interface VideoDone {
  state: 'same' | 'ready' | 'failed';
  codec: string | null;
  play: string | null;
  width?: number;
  height?: number;
  duration?: number;
  thumb?: string;
}

/** A video waiting: its content, and whether a message that has it lacks a first picture. */
export interface VideoWaiting {
  hash: string;
  poster: boolean;
}

const CONVERT_MS = 30 * 60_000;
const PROBE_MS = 60_000;
const POSTER_MS = 2 * 60_000;

export class Videos {
  private running = false;
  private again = false;
  private idle: Promise<void> = Promise.resolve();

  constructor(
    private readonly blobs: Blobs,
    private readonly tools: VideoTools,
    /** The next video waiting, leaving out those already looked at in this round. */
    private readonly next: (skip: Set<string>) => VideoWaiting | undefined,
    private readonly done: (hash: string, result: VideoDone) => void,
  ) {}

  /** Looks at the videos waiting, one at a time, until none is left; resolves when it stops. */
  kick(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.idle;
    }
    this.running = true;
    this.idle = this.run()
      .catch((error: unknown) => console.error(`Videos stopped being looked at until the next one comes: ${String(error)}`))
      .finally(() => (this.running = false));
    return this.idle;
  }

  private async run() {
    const tried = new Set<string>();
    for (;;) {
      const video = this.next(tried);
      if (!video) {
        if (!this.again) return;
        this.again = false;
        tried.clear();
        continue;
      }
      tried.add(video.hash);
      const result = await this.look(video);
      try {
        this.done(video.hash, result);
      } catch (error) {
        console.error(`A video (${video.hash}) was looked at, but not written: ${String(error)}`);
      }
    }
  }

  private async look(video: VideoWaiting): Promise<VideoDone> {
    const file = this.blobs.pathOf(video.hash);
    const made: string[] = [];
    const temp = () => {
      const path = join(this.blobs.tmp, `video-${randomBytes(12).toString('hex')}`);
      made.push(path);
      return path;
    };
    let probe: Probe | undefined;
    try {
      probe = await this.tools.probe(file);
      const measured = {
        codec: probe.codec || null,
        ...(probe.width && probe.height && { width: probe.width, height: probe.height }),
        ...(probe.duration !== undefined && { duration: probe.duration }),
      };
      if (!probe.codec) return { state: 'same', play: null, ...measured };
      let thumb: string | undefined;
      if (video.poster) {
        // A video without its first picture still plays: the picture is not worth failing it for.
        const out = temp();
        thumb = await this.tools
          .poster(file, out, Math.min(0.5, (probe.duration ?? 1) / 2), probe)
          .then(() => this.blobs.keepFile(out))
          .catch((error: unknown) => (console.error(`A video's first picture was not made: ${String(error)}`), undefined));
      }
      if (probe.codec === 'h264') return { state: 'same', play: null, ...measured, ...(thumb && { thumb }) };
      const out = temp();
      await this.tools.convert(file, out, probe);
      return { state: 'ready', play: await this.blobs.keepFile(out), ...measured, ...(thumb && { thumb }) };
    } catch (error) {
      console.error(`A video (${video.hash}) was not converted: ${String(error)}`);
      return { state: 'failed', codec: probe?.codec || null, play: null };
    } finally {
      for (const path of made) rmSync(path, { force: true });
    }
  }
}

/** ffmpeg's tools, when this computer has them; null when it has not, said once. */
export async function ffmpegTools(): Promise<VideoTools | null> {
  try {
    await run('ffprobe', ['-version'], 10_000);
    await run('ffmpeg', ['-version'], 10_000);
  } catch {
    console.log('ffmpeg is not installed: videos are kept as they are sent, and one that a computer cannot play stays so (design/chat.md 27).');
    return null;
  }
  return { probe, convert, poster };
}

/** Runs a tool with its arguments as a list, never through a shell; stopped after `ms`. */
function run(command: string, args: string[], ms: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: ms, killSignal: 'SIGKILL' });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err = (err + chunk.toString()).slice(-2000)));
    child.on('error', reject);
    child.on('close', (code, signal) => (code === 0 ? resolve(out) : reject(new Error(`${command} ended with ${signal ?? code}: ${err.trim()}`))));
  });
}

interface FfStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  color_transfer?: string;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
}

async function probe(file: string): Promise<Probe> {
  const found = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], PROBE_MS)) as {
    streams?: FfStream[];
    format?: { duration?: string };
  };
  const video = found.streams?.find((stream) => stream.codec_type === 'video');
  const audio = found.streams?.find((stream) => stream.codec_type === 'audio');
  const rotation = Number(video?.side_data_list?.find((data) => data.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0);
  const turned = Math.abs(rotation) % 180 === 90;
  const duration = Number(found.format?.duration);
  return {
    codec: video?.codec_name ?? '',
    ...(video?.width && video.height && { width: turned ? video.height : video.width, height: turned ? video.width : video.height }),
    ...(Number.isFinite(duration) && duration > 0 && { duration }),
    audio: audio?.codec_name ?? null,
    hdr: video?.color_transfer === 'smpte2084' || video?.color_transfer === 'arib-std-b67',
  };
}

/** HDR mapped to SDR, as a phone's camera video would look faded otherwise. */
const TONEMAP = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';
const fit = (long: number) => `scale=w='min(${long},iw)':h='min(${long},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;

async function convert(file: string, out: string, found: Probe): Promise<void> {
  const picture = [...(found.hdr ? [TONEMAP] : []), fit(1920), 'format=yuv420p'].join(',');
  const sound = found.audio === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k'];
  await run(
    'ffmpeg',
    // Two threads for reading the video too, as well as for writing the copy.
    ['-nostdin', '-v', 'error', '-y', '-threads', '2', '-i', file, '-map', '0:v:0', '-map', '0:a:0?', '-vf', picture, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', ...sound, '-movflags', '+faststart', '-threads', '2', '-filter_threads', '2', '-f', 'mp4', out],
    CONVERT_MS,
  );
}

async function poster(file: string, out: string, at: number, found: Probe): Promise<void> {
  const picture = [...(found.hdr ? [TONEMAP] : []), fit(1280)].join(',');
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-threads', '2', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', picture, '-c:v', 'libwebp', '-quality', '82', '-f', 'webp', out], POSTER_MS);
}
