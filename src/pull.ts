import { count, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { accounts, games, rewards } from './db/schema';
import { log, pool } from './utils';
import { NetAgent } from './api';
import assert from 'node:assert';
import { login } from './auth/passport';

const finished = await db
  .select({
    email: accounts.email,
    token: accounts.token,
    uid: accounts.uid,
    pulled: accounts.pulled,
    count: count(games.game_uuid),
  })
  .from(accounts)
  .leftJoin(games, eq(games.email, accounts.email))
  .where(eq(accounts.pulled, false))
  .groupBy(accounts.email)
  .having(sql`count(${games.game_uuid}) >= 16`);

async function pull({ token, uid, email }: (typeof finished)[number]) {
  const lobbyAgent = new NetAgent(NetAgent.gateway, { throwErrors: true });
  const Lobby = lobbyAgent.proxyService('Lobby');

  await lobbyAgent.waitForOpen();
  const interval = setInterval(
    () =>
      void Lobby.heatbeat({
        no_operation_counter: 0,
      }),
    30000
  );

  const type = 7;
  const client_version_string = `web-${lobbyAgent.version.slice(0, -2)}`;

  const credentials = await login(uid, token);

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

  assert(has_account);

  const device = {
    platform: 'pc',
    hardware: 'pc',
    os: 'windows',
    os_version: 'win10',
    is_browser: true,
    software: 'Firefox',
    sale_platform: 'web',
  };

  const { game_info } = await Lobby.oauth2Login({
    access_token,
    client_version: {
      resource: lobbyAgent.version,
    },
    client_version_string,
    currency_platforms: [1, 4, 5, 9, 12],
    device,
    random_key: crypto.randomUUID(),
    reconnect: false,
    tag: 'en',
    type,
  });

  await Lobby.loginSuccess();

  log('Logged in to Mahjong Soul with', email);

  await Lobby.loginBeat({
    contract: 'DF2vkXCnfeXp4WoGSBGNcJBufZiMN3UP',
  });

  if (game_info) {
    clearInterval(interval);
    lobbyAgent.close();
    log(uid, 'in game!');
    return;
  }

  const { error: taskError } = await Lobby.completePeriodActivityTaskBatch(
    {
      task_list: [
        25040301, 25040302, 25040303, 25040304, 25040305, 25040306, 25040307,
        25040308, 25040309, 25040310, 25040311, 25040312, 25040313, 25040314,
        25040315, 25040316,
      ],
    },
    { throwError: false }
  );

  if (taskError) {
    log('ERROR:', email, 'failed to claim tasks, will try to pull anyway!');
  }

  const { results, error: pullError } = await Lobby.openChest(
    {
      chest_id: 1005,
      count: 1,
      choose_up_activity_id: 0,
      use_ticket: true,
    },
    { throwError: false }
  );

  if (pullError) {
    log('ERROR', email, 'failed to pull');
    clearInterval(interval);
    return;
  }

  // should only be one
  for (const { reward } of results) {
    assert(reward?.id);
    log('pulled', reward.id);
    await db.insert(rewards).values({
      id: reward.id,
      email,
    });
  }

  await db
    .update(accounts)
    .set({
      pulled: true,
    })
    .where(eq(accounts.email, email));

  clearInterval(interval);
  log('exiting', email);
  return;
}

await pool(finished, pull, 5, 10);
