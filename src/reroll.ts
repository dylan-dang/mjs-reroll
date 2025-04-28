import * as auth from './passport';
import assert from 'assert';
import { sleep } from './utils';
import type { gmail_v1 } from 'googleapis';
import { z } from 'zod';
import { NetAgent } from './api';
import { createHmac } from 'crypto';

const loginCacheSchema = z.record(
  z.object({
    uid: z.string(),
    token: z.string(),
  })
);
const loginsCacheFile = Bun.file('.cache/logins.json');
const logins = loginCacheSchema.parse(
  (await loginsCacheFile.exists()) ? await loginsCacheFile.json() : {}
);

async function getCodeFromEmail(gmail: gmail_v1.Gmail, email: string) {
  const res = await gmail.users.messages.list({
    userId: 'me',
    includeSpamTrash: true,
    q: `from: do-not-reply@passport.yo-star.com to:(${email})`,
    maxResults: 1,
  });
  if (!res.data.messages) return null;

  const lastMessageId = res.data.messages[0].id;
  if (!lastMessageId) return null;

  const lastMessage = await gmail.users.messages.get({
    userId: 'me',
    id: lastMessageId,
  });

  assert(lastMessage.headers.date);
  const dateRecieved = new Date(lastMessage.headers.date);
  if (Date.now() - dateRecieved.getTime() > 30 * 60 * 1000) return null; // outdated code

  assert(lastMessage.data.snippet);

  const numbers = lastMessage.data.snippet.match(/\d+/);
  assert(numbers);

  return numbers[0];
}

async function pollForCode(
  gmail: gmail_v1.Gmail,
  email: string,
  interval: number = 10000,
  maxRetries: number = 10
) {
  for (let retries = 0; retries < maxRetries; retries++) {
    const code = await getCodeFromEmail(gmail, email);
    if (code) return code;
    await sleep(interval);
  }
  throw new Error(
    `polling for ${email} code exceeded maxRetries=${maxRetries}}`
  );
}

async function performOTP(gmail: gmail_v1.Gmail, email: string) {
  await auth.requestAuthCode(email);
  await sleep(5000);
  const code = await pollForCode(gmail, email);
  return await auth.submitAuthCode(email, code);
}

async function login(gmail: gmail_v1.Gmail, email: string) {
  const login = logins[email];
  try {
    return auth.login(login.uid, login.token);
  } finally {
    const { uid, token } = await performOTP(gmail, email);
    logins[email] = { uid, token };
    Bun.write(loginsCacheFile, JSON.stringify(logins));
    return auth.login(uid, token);
  }
}

export async function reroll(gmail: gmail_v1.Gmail, email: string) {
  const lobbyAgent = new NetAgent(NetAgent.gateway, { throwErrors: true });
  const Lobby = lobbyAgent.proxyService('Lobby');

  const [credentials] = await Promise.all([
    login(gmail, email),
    lobbyAgent.waitForOpen(),
  ]);

  await Lobby.heatbeat({
    no_operation_counter: 0,
  });

  const type = 7;
  const client_version_string = `web-${lobbyAgent.version.slice(0, -2)}`;

  const { access_token } = await Lobby.oauth2Auth({
    client_version_string,
    type,
    uid: credentials.uid,
    code: credentials.accessToken,
  });

  const { has_account } = await Lobby.oauth2Check({
    access_token,
    type,
  });

  const device = {
    platform: 'pc',
    hardware: 'pc',
    os: 'windows',
    os_version: 'win10',
    is_browser: true,
    software: 'Firefox',
    sale_platform: 'web',
  };

  if (!has_account)
    await Lobby.oauth2Signup({
      access_token,
      client_version_string,
      device,
      email: email,
      tag: 'en',
      type,
    });

  const { account } = await Lobby.oauth2Login({
    access_token,
    client_version: {
      resource: lobbyAgent.version,
    },
    client_version_string,
    currency_platforms: [1, 4, 5, 9, 12],
    device,
    random_key: '57e4276f-cec9-4464-9c9a-5ed1644e4a76',
    reconnect: false,
    tag: 'en',
    type,
  });

  assert(account, 'account is null!');

  console.log('logged in to', email);

  const { account_id, nickname } = account;

  assert(account_id, 'account_id is null!');

  if (!nickname) {
    const nickname = `User${Math.floor(Math.random() * 1000000)}`;
    console.log('creating nickname', nickname);
    await Lobby.createNickname({
      nickname,
      tag: 'en',
    });
  }

  await Lobby.loginBeat({
    contract: 'DF2vkXCnfeXp4WoGSBGNcJBufZiMN3UP',
  });

  await Lobby.loginSuccess();

  // await Lobby.startUnifiedMatch({
  //   client_version_string,
  //   match_sid: '1:2', // bronze east
  // });

  await Lobby.createRoom({
    client_version_string,
    public_live: false,
    player_count: 1,
    mode: {
      ai: true,
      detail_rule: {
        ai_level: 1,
        bianjietishi: true,
        dora_count: 3,
        fandian: 30000,
        fanfu: 1,
        guyi_mode: 0,
        init_point: 25000,
        open_hand: 0,
        shiduan: 0,
        time_add: 20,
        time_fixed: 5
      },
      mode: 3,
    }
  });

  await Lobby.startRoom();

  console.log('waiting for match game start...');

  // const { connect_token, game_uuid } = await agent.waitForNotification('NotifyMatchGameStart');
  const { connect_token, game_uuid } = await lobbyAgent.waitForNotification('NotifyRoomGameStart');
  console.log('match found!');

  assert(connect_token, 'connect_token is null!');
  assert(game_uuid, 'game_uuid is null!');
  
  const gameAgent = new NetAgent(NetAgent.gameGateway, {debugNotifications: true})
  const FastTest = gameAgent.proxyService('FastTest');

  const hmac = createHmac('sha256', 'damajiang');
  hmac.update(connect_token + account_id + game_uuid);
  const gift = hmac.digest('hex');

  await gameAgent.waitForOpen();

  await FastTest.authGame({
    account_id: account.account_id,
    game_uuid,
    token: connect_token,
    gift
  });
  

  await FastTest.enterGame();

  const data = await gameAgent.waitForNotification("ActivityFestivalData");

  const {tiles} = await gameAgent.waitForNotification("ActionNewRound");
  
  
  gameAgent.close();
  lobbyAgent.close();
}
