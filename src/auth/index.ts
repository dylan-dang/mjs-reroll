import * as auth from "./passport";
import assert from "node:assert";
import { sleep } from "bun";
import type { gmail_v1 } from "googleapis";
import { db } from "../db";
import { accounts } from "../db/schema";
import { eq } from "drizzle-orm";

export async function getCodeFromEmail(gmail: gmail_v1.Gmail, email: string) {
  const res = await gmail.users.messages.list({
    userId: "me",
    includeSpamTrash: true,
    q: `from: do-not-reply@passport.yo-star.com to:(${email})`,
    maxResults: 1,
  });
  if (!res.data.messages) return null;

  const lastMessageId = res.data.messages[0].id;
  if (!lastMessageId) return null;

  const lastMessage = await gmail.users.messages.get({
    userId: "me",
    id: lastMessageId,
  });

  assert(lastMessage.headers.date, "date couldn't be found email");
  const dateRecieved = new Date(lastMessage.headers.date);
  if (Date.now() - dateRecieved.getTime() > 30 * 60 * 1000) return null; // outdated code

  assert(lastMessage.data.snippet, "email snippet not found!");

  const numbers = lastMessage.data.snippet.match(/\d+/);
  assert(numbers, "code could not be found in email");

  return numbers[0];
}

export async function pollForCode(
  gmail: gmail_v1.Gmail,
  email: string,
  interval = 10000,
  maxRetries = 10,
) {
  for (let retries = 0; retries < maxRetries; retries++) {
    const code = await getCodeFromEmail(gmail, email);
    if (code) return code;
    await sleep(interval);
  }
  throw new Error(
    `polling for ${email} code exceeded maxRetries=${maxRetries}}`,
  );
}

export async function performOTP(gmail: gmail_v1.Gmail, email: string) {
  await auth.requestAuthCode(email);
  await sleep(5000);
  const code = await pollForCode(gmail, email);
  const loginInfo = await auth.submitAuthCode(email, code);
  const { uid, token } = loginInfo;
  await db.insert(accounts).values({ email, uid, token });
  return loginInfo;
}

export async function login(gmail: gmail_v1.Gmail, email: string) {
  const result = await db
    .select({ uid: accounts.uid, token: accounts.token })
    .from(accounts)
    .where(eq(accounts.email, email))
    .get();
  const { uid, token } = result ?? (await performOTP(gmail, email));
  return auth.login(uid, token);
}
