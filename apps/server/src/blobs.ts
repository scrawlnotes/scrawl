import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, type ReadStream } from 'node:fs';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// The content of every file of every space, each in a file named by its SHA-256 digest: the
// same content is kept once, whichever space, path or version has it.

/** A file sent was larger than the server takes. */
export class TooLarge extends Error {
  constructor() {
    super('The file is larger than this server takes');
    this.name = 'TooLarge';
  }
}

/** What came in, kept aside until it is known whether it is written. */
export interface Taken {
  temp: string;
  hash: string;
  size: number;
}

export class Blobs {
  private readonly tmp: string;

  constructor(private readonly dir: string) {
    this.tmp = join(dir, '..', 'tmp');
    mkdirSync(dir, { recursive: true });
    mkdirSync(this.tmp, { recursive: true });
  }

  pathOf(hash: string): string {
    return join(this.dir, hash.slice(0, 2), hash);
  }

  /** Takes what is sent to a file aside, its digest counted as it comes; never more than `max` bytes. */
  async take(body: ReadableStream<Uint8Array> | null, max: number): Promise<Taken> {
    const temp = join(this.tmp, randomBytes(12).toString('hex'));
    const digest = createHash('sha256');
    let size = 0;
    const count = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        size += chunk.length;
        if (size > max) return done(new TooLarge());
        digest.update(chunk);
        done(null, chunk);
      },
    });
    try {
      const source = body ? Readable.fromWeb(body as import('node:stream/web').ReadableStream<Uint8Array>) : Readable.from([]);
      await pipeline(source, count, createWriteStream(temp));
    } catch (error) {
      rmSync(temp, { force: true });
      throw error;
    }
    return { temp, hash: digest.digest('hex'), size };
  }

  /** Puts what was taken in its place; the same content there already stays as it is. */
  keep(taken: Taken) {
    const target = this.pathOf(taken.hash);
    if (existsSync(target)) {
      rmSync(taken.temp, { force: true });
      return;
    }
    mkdirSync(join(this.dir, taken.hash.slice(0, 2)), { recursive: true });
    renameSync(taken.temp, target);
  }

  open(hash: string): ReadStream {
    return createReadStream(this.pathOf(hash));
  }

  sizeOf(hash: string): number {
    return statSync(this.pathOf(hash)).size;
  }
}
