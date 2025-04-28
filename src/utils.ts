export function* generateVariants(email: string) {
  const [local, domain] = email.split('@');
  const n = local.length;
  const total = 1 << (n - 1); // 2^(n-1)

  for (let mask = 0; mask < total; mask++) {
    let variant = '';
    for (let i = 0; i < n; i++) {
      variant += local[i];
      if (i < n - 1 && mask & (1 << i)) {
        variant += '.';
      }
    }
    yield `${variant}@${domain}`;
  }
}

export async function pool<T, R>(
  tasks: Iterable<T>,
  workerFn: (task: T) => Promise<R>,
  concurrency: number = 4
): Promise<R[]> {
  const results: R[] = [];
  const taskIterator = tasks[Symbol.iterator]();

  const workers = Array.from({ length: concurrency }, async () => {
    let task = taskIterator.next();
    while (!task.done) {
      try {
        results.push(await workerFn(task.value));
      } catch (err) {
        throw err;
      }
      task = taskIterator.next();
    }
  });

  await Promise.all(workers);
  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function* drop<T>(
  iter: Iterable<T>,
  count: number
): IterableIterator<T> {
  let skipped = 0;
  for (const item of iter) {
    if (skipped < count) {
      skipped++;
      continue;
    }
    yield item;
  }
}
