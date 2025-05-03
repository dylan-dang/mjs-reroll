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

function getRandomChineseChar() {
  const start = 0x4E00;
  const end = 0x9FFF;
  const codePoint = Math.floor(Math.random() * (end - start + 1)) + start;
  return String.fromCharCode(codePoint);
}

function getRandomAsciiChar() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return chars[Math.floor(Math.random() * chars.length)];
}

export function getRandomMixedName(minUnits = 7, maxUnits = 14, ratio = 0.6) {
  const targetUnits = Math.floor(Math.random() * (maxUnits - minUnits + 1)) + minUnits;
  let currentUnits = 0;
  let result = '';

  while (currentUnits < targetUnits) {
    // Randomly decide to insert a Chinese char (2 units) or ASCII (1 unit)
    const useChinese = Math.random() < ratio; // adjust ratio if needed
    if (useChinese && currentUnits <= targetUnits - 2) {
      result += getRandomChineseChar();
      currentUnits += 2;
    } else {
      result += getRandomAsciiChar();
      currentUnits += 1;
    }
  }

  return result;
}