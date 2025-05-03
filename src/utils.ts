import type { EventEmitter } from 'stream';
import { verbose } from '../config.json' with { type: 'json' }

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

type Key<K, T> = T extends [never] ? string | symbol : K | keyof T;

export function once<T extends Record<any, any[]>, K extends keyof T>(
  emitter: EventEmitter<T>,
  eventName: Key<K, T>
) {
  return new Promise<T[K][0]>((resolve) => {
    emitter.once(eventName, resolve as any);
  });
}

export function log(...args: Parameters<typeof console['log']>) {
  if (verbose) console.log(...args);
}