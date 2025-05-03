import type { gmail_v1 } from 'googleapis';
import { NetAgent } from './api';
import { Game, Operation } from './api/game';
import { login } from './auth';
import assert from 'assert';
import { once } from './utils';
import { sleep } from 'bun';
import { debug } from '../config.json' with { type: 'json' };
import { log } from './utils';
import {verbose} from '../config.json' with { type: 'json'};
import { db } from './db';
import { accounts } from './db/schema';
import { eq } from 'drizzle-orm';

async function playGame(account_id: number, lobbyAgent: NetAgent) {
  const gameLog = (...args: Parameters<typeof console['log']>) => {
    if (verbose > 1) log(account_id, '>', ...args);
  };
  gameLog('waiting for match...');

  const { connect_token, game_uuid } = await once(
    lobbyAgent.notify,
    debug ? 'NotifyRoomGameStart' : 'NotifyMatchGameStart'
  );
  gameLog('match found!');

  assert(connect_token, 'connect_token is null!');
  assert(game_uuid, 'game_uuid is null!');

  const game = new Game(account_id, game_uuid, connect_token);
  await game.init();

  game.on('newRound', () => {
    gameLog(
      'Round',
      ['East', 'South', 'West', 'Norht'][game.round],
      game.jun + 1,
      game.honba ? `Repeat ${game.honba}` : '',
      'started!'
    );
    gameLog('seat:', game.seat);
    gameLog(
      'points:',
      game.players.map((player) => player.score)
    );
  });

  game.on('discard', ({ tile, seat }) => {
    gameLog('player', seat, 'discards', tile);
  });

  game.on('operation', async ({ operation_list }) => {
    assert(operation_list, "operation_list not found");
    const timeuse = Math.random() * 3;
    await sleep(timeuse * 1000);

    if (operation_list.find((op) => op.type === Operation.Discard)) {
      const index = Math.floor(Math.random() * game.hand.length);
      const tile = game.hand[index];
      gameLog('discarded: ', tile.toString());
      await game.FastTest.inputOperation({
        type: Operation.Discard,
        moqie: index === game.hand.length - 1,
        tile: tile.toString(),
        tile_state: 0,
        timeuse: Math.floor(timeuse),
      });
      return;
    }

    gameLog(
      'skipped operations: ',
      operation_list.map((op) => Operation[op.type!]).join(', ')
    );
    await game.FastTest.inputChiPengGang({
      cancel_operation: true,
      timeuse: Math.floor(timeuse),
    });
  });

  game.agent.notify.on('ActionHule', ({ hules, gameend, scores }) => {
    for (const hule of hules) {
      gameLog('Player', hule.seat, hule.zimo ? 'tsumo!' : 'ron!');
    }
    if (gameend) gameLog('final scores: ', scores);

    game.FastTest.confirmNewRound();
  });

  game.agent.notify.on('ActionNoTile', ({ gameend, scores }) => {
    gameLog('Exhaustive Draw!');
    if (gameend) gameLog('final scores: ', scores);

    game.FastTest.confirmNewRound();
  });

  await once(game.agent.notify, 'NotifyGameEndResult');
  gameLog('game ended!');
  game.agent.close();
}

export async function reroll(
  gmail: gmail_v1.Gmail,
  email: string,
) {
  const lobbyAgent = new NetAgent(NetAgent.gateway, { throwErrors: true });
  const Lobby = lobbyAgent.proxyService('Lobby');

  const [credentials] = await Promise.all([
    login(gmail, email),
    lobbyAgent.waitForOpen(),
  ]);

  setInterval(
    () =>
      void Lobby.heatbeat({
        no_operation_counter: 0,
      }),
    30000
  );

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

  const { account_id, nickname } = account;

  assert(account_id, 'account_id is null!');

  if (!nickname) {
    const nickname = `User${Math.floor(Math.random() * 1000000)}`;
    log('creating nickname', nickname);
    await Lobby.createNickname({
      nickname,
      tag: 'en',
    });
  }

  log('Logged in to Mahjong Soul using', email, 'as', nickname);

  await Lobby.loginBeat({
    contract: 'DF2vkXCnfeXp4WoGSBGNcJBufZiMN3UP',
  });

  await Lobby.loginSuccess();

  if (debug) {
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
          time_fixed: 5,
        },
        mode: 3,
      },
    });

    await Lobby.startRoom();
  } else {
    await Lobby.startUnifiedMatch({
      client_version_string,
      match_sid: '1:2', // bronze east
    });
  }

  const cachedAccount = await db.select({gamesPlayed: accounts.gamesPlayed}).from(accounts).where(eq(accounts.email, email)).get();
  assert(cachedAccount, "account not found in database");
  for (let gamesPlayed = cachedAccount.gamesPlayed; gamesPlayed < 16; gamesPlayed++) {
    await playGame(account_id, lobbyAgent);
    await db.update(accounts).set({ gamesPlayed: gamesPlayed + 1 });
  }

  lobbyAgent.close();
}
