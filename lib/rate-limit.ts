export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One task at a time, spaced by at least minIntervalMs.
 *
 * Both upstream APIs want serialising rather than fanning out. A single user
 * will never approach either rate limit on their own, but a form that fires
 * several lookups at once would, and the penalty is a ban rather than a slow
 * page.
 */
export function createSerialiser(minIntervalMs: number) {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStartedAt = 0;

  return function serialise<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = minIntervalMs - (Date.now() - lastStartedAt);
      if (wait > 0) {
        await sleep(wait);
      }
      lastStartedAt = Date.now();
      return task();
    });

    // A rejected task must not poison the queue for everything behind it.
    queue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  };
}
