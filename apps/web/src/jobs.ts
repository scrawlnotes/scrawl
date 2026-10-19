// Jobs run a few at a time, the most wanted first and then in the order they came; one asked for
// while it waits can go to the front. The app reads its spaces with it as it opens, folder by
// folder (design/opening.md, section 5).

interface Job {
  key: string;
  priority: number;
  order: number;
  run: () => Promise<void>;
}

export class JobQueue {
  private waiting: Job[] = [];
  private running = 0;
  private order = 0;
  private emptied: (() => void)[] = [];

  constructor(private readonly atOnce: number) {}

  /** Adds a job: one with a lower priority runs sooner. One that throws is passed over. */
  add(key: string, priority: number, run: () => Promise<void>) {
    this.waiting.push({ key, priority, order: this.order++, run });
    this.pump();
  }

  /** A job waiting under `key` goes as soon as one of this priority would. Whether one was waiting. */
  hurry(key: string, priority: number): boolean {
    const job = this.waiting.find((each) => each.key === key);
    if (!job) return false;
    job.priority = Math.min(job.priority, priority);
    return true;
  }

  /** Settles once no job waits and none runs. */
  idle(): Promise<void> {
    if (this.running === 0 && this.waiting.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.emptied.push(resolve));
  }

  private pump() {
    while (this.running < this.atOnce && this.waiting.length > 0) {
      let next = 0;
      for (let i = 1; i < this.waiting.length; i++) {
        const job = this.waiting[i]!;
        const best = this.waiting[next]!;
        if (job.priority < best.priority || (job.priority === best.priority && job.order < best.order)) next = i;
      }
      const [job] = this.waiting.splice(next, 1);
      this.running++;
      void job!
        .run()
        .catch(() => undefined)
        .finally(() => {
          this.running--;
          this.pump();
          if (this.running === 0 && this.waiting.length === 0) for (const resolve of this.emptied.splice(0)) resolve();
        });
    }
  }
}
