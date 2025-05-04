import assert from "node:assert";
import { z } from "zod";
import { yo_service_url } from "../../external/config.json";

const [passport] = yo_service_url;

async function send(path: string, payload: unknown) {
  const req = await fetch(new URL(path, passport), {
    headers: { "Content-Type": "application/json;charset=utf-8" },
    body: JSON.stringify(payload),
    method: "POST",
  });
  if (!req.ok) {
    throw new Error(
      `Request to passport ${path} responded with code ${req.status}: ${req.statusText}`,
    );
  }
  return await req.json();
}

export async function requestAuthCode(email: string) {
  const res = await send("account/auth_request", {
    account: email,
    lang: "en",
  });
  assert(
    res.result === 0,
    `Auth request failed!, recieved ${JSON.stringify(res)}`,
  );
}

const authSubmitResultSchema = z.object({
  result: z.literal(0),
  isNew: z.union([z.literal(0), z.literal(1)]),
  uid: z.string(),
  token: z.string(),
  yostar_uid: z.string(),
  yostar_username: z.string(),
  yostar_token: z.string(),
});

export async function submitAuthCode(email: string, code: string) {
  const res = await send("account/auth_submit", {
    account: email,
    code,
  });
  const { success, data } = authSubmitResultSchema.safeParse(res);
  if (!success) {
    throw new Error(`submit auth code failed, recieved ${JSON.stringify(res)}`);
  }
  return data;
}

const loginResultSchema = z.object({
  result: z.literal(0),
  accessToken: z.string(),
  birth: z.string().nullable().optional(),
  yostar_uid: z.string(),
  yostar_username: z.string(),
  transcode: z.string(),
  current_timestamp_ms: z.number(),
  check7until: z.number(),
  migrated: z.boolean(),
  show_migrate_page: z.boolean(),
  channelId: z.string(),
  kr_kmc_status: z.number(),
  uid: z.string(),
  token: z.string(),
});

export async function login(uid: string, token: string) {
  const res = await send("user/login", {
    uid,
    token,
    web_lang: "en",
    deviceId: `web|${uid}`,
  });

  const { success, data } = loginResultSchema.safeParse(res);
  if (!success) {
    throw new Error(`login failed, recieved ${JSON.stringify(res)}`);
  }
  return data;
}
