import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ffmpegTools } from './video';

// ffmpeg itself (design/chat.md 27), where this computer has it: the server's Docker image does.
// Without it these are skipped; the queue and what is written are tested with a fake in chat.test.ts.

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const dir = mkdtempSync(join(tmpdir(), 'scrawl-video-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(!hasFfmpeg)('ffmpeg', () => {
  it('makes an H.264 copy of an HEVC video, upright and with its sound, and its first picture', async () => {
    const flat = join(dir, 'flat.mp4');
    const hevc = join(dir, 'hevc.mp4');
    // A second of a phone's portrait video: HEVC with sound, turned a quarter as a phone writes it.
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1', '-c:v', 'libx265', '-tag:v', 'hvc1', '-c:a', 'aac', flat], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-v', 'error', '-i', flat, '-c', 'copy', '-metadata:s:v:0', 'rotate=90', hevc]);
    const tools = (await ffmpegTools())!;
    const found = await tools.probe(hevc);
    expect(found).toMatchObject({ codec: 'hevc', width: 360, height: 640, audio: 'aac', hdr: false });
    expect(found.duration).toBeCloseTo(1, 0);

    const copy = join(dir, 'copy.mp4');
    await tools.convert(hevc, copy, found);
    expect(await tools.probe(copy)).toMatchObject({ codec: 'h264', width: 360, height: 640, audio: 'aac' });

    const picture = join(dir, 'first.webp');
    await tools.poster(hevc, picture, 0.5, found);
    expect(readFileSync(picture).subarray(8, 12).toString()).toBe('WEBP');
    expect(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', picture]).toString().trim()).toBe('360,640');
  });
});
