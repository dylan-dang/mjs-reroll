import { verbosity } from "../config.json" with { type: "json" };
import { sleep } from "bun";

export function* generateVariants(email: string) {
  const [local, domain] = email.split("@");
  const n = local.length;
  const total = 1 << (n - 1); // 2^(n-1)

  for (let mask = 0; mask < total; mask++) {
    let variant = "";
    for (let i = 0; i < n; i++) {
      variant += local[i];
      if (i < n - 1 && mask & (1 << i)) {
        variant += ".";
      }
    }
    yield `${variant}@${domain}`;
  }
}

export async function pool<T, R>(
  tasks: Iterable<T>,
  workerFn: (task: T) => Promise<R>,
  concurrency = 4,
  stagger = 0,
): Promise<R[]> {
  const results: R[] = [];
  const taskIterator = tasks[Symbol.iterator]();

  const workers = Array.from({ length: concurrency }, async (_, i) => {
    await sleep(stagger * 1000 * i);

    let task = taskIterator.next();
    while (!task.done) {
      results.push(await workerFn(task.value));
      task = taskIterator.next();
    }
  });

  await Promise.all(workers);
  return results;
}

export function log(...args: Parameters<(typeof console)["log"]>) {
  if (verbosity) console.log(...args);
}

function getRandomChineseChar() {
  const start = 0x4e00;
  const end = 0x9fff;
  const codePoint = Math.floor(Math.random() * (end - start + 1)) + start;
  return String.fromCharCode(codePoint);
}

function getRandomAsciiChar() {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return chars[Math.floor(Math.random() * chars.length)];
}

export function getRandomMixedName(minUnits = 7, maxUnits = 14, ratio = 0.6) {
  const targetUnits =
    Math.floor(Math.random() * (maxUnits - minUnits + 1)) + minUnits;
  let currentUnits = 0;
  let result = "";

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
