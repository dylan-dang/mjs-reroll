import type { gmail_v1 } from "googleapis";
import { NetAgent } from "./api";
import {fetchActivities} from './api/activity'
import { Game, Operation } from "./api/game";
import { login } from "./auth";
import assert from "node:assert";
import { getRandomMixedName } from "./utils";
import { sleep } from "bun";
import { debug } from "../config.json" with { type: "json" };
import { log } from "./utils";
import { verbosity } from "../config.json" with { type: "json" };
import { db } from "./db";
import { games } from "./db/schema";
import { eq, count } from "drizzle-orm";

async function getGamesPlayed(email: string) {
  return await db
  .select({ gamesPlayed: count() })
  .from(games)
  .where(eq(games.email, email))
  .get()!.gamesPlayed;

}

async function playGame(email: string, game: Game, logPrefix?: unknown) {
  const gameLog = (...args: Parameters<(typeof console)["log"]>) => {
    if (verbosity > 1) log(logPrefix ?? "", ">", ...args);
  };

  game.on("newRound", () => {
    gameLog(
      "Round",
      ["East", "South", "West", "Norht"][game.round],
      game.jun + 1,
      game.honba ? `Repeat ${game.honba}` : "",
      "started!",
    );
    gameLog("seat:", game.seat);
    gameLog(
      "points:",
      game.players.map((player) => player.score),
    );
  });

  game.on("discard", ({ tile, seat }) => {
    gameLog("player", seat, "discards", tile);
  });

  game.on("operation", async ({ operation_list }) => {
    assert(operation_list, "operation_list not found");
    const timeuse = Math.random() * 3;
    await sleep(timeuse * 1000);

    if (operation_list.find((op) => op.type === Operation.Discard)) {
      const hand = game.self.hand;
      const index = Math.floor(Math.random() * hand.length);
      const tile = hand[index];
      gameLog("discarded: ", tile.toString());
      await game.FastTest.inputOperation({
        type: Operation.Discard,
        moqie: index === hand.length - 1,
        tile: tile.toString(),
        tile_state: 0,
        timeuse: Math.floor(timeuse),
      });
      return;
    }

    gameLog(
      "skipped operations: ",
      operation_list.map((op) => Operation[op.type!]).join(", "),
    );
    await game.FastTest.inputChiPengGang({
      cancel_operation: true,
      timeuse: Math.floor(timeuse),
    });
  });

  game.agent.notify.on("ActionHule", ({ hules, gameend, scores }) => {
    for (const hule of hules) {
      gameLog("Player", hule.seat, hule.zimo ? "tsumo!" : "ron!");
    }
    if (gameend) gameLog("final scores: ", scores);

    game.FastTest.confirmNewRound();
  });

  game.agent.notify.on("ActionNoTile", ({ gameend, scores }) => {
    gameLog("Exhaustive Draw!");
    if (gameend) gameLog("final scores: ", scores);

    game.FastTest.confirmNewRound();
  });

  await game.init();
  await db
    .insert(games)
    .values({ email, game_uuid: game.uuid })
    .onConflictDoNothing();
  await game.agent.once("NotifyGameEndResult");
  gameLog("game ended!");
  game.agent.close();
  // we have to wait to start a new game
  await sleep(5000);
}

export async function reroll(gmail: gmail_v1.Gmail, email: string) {
  const lobbyAgent = new NetAgent(NetAgent.gateway, { throwErrors: true });
  const Lobby = lobbyAgent.proxyService("Lobby");

  const [credentials] = await Promise.all([
    login(gmail, email),
    lobbyAgent.waitForOpen(),
  ]);

  setInterval(
    () =>
      void Lobby.heatbeat({
        no_operation_counter: 0,
      }),
    30000,
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
    platform: "pc",
    hardware: "pc",
    os: "windows",
    os_version: "win10",
    is_browser: true,
    software: "Firefox",
    sale_platform: "web",
  };

  if (!has_account) {
    await Lobby.oauth2Signup({
      access_token,
      client_version_string,
      device,
      email: email,
      tag: "en",
      type,
    });
  }

  const { account, game_info } = await Lobby.oauth2Login({
    access_token,
    client_version: {
      resource: lobbyAgent.version,
    },
    client_version_string,
    currency_platforms: [1, 4, 5, 9, 12],
    device,
    random_key: "57e4276f-cec9-4464-9c9a-5ed1644e4a76",
    reconnect: false,
    tag: "en",
    type,
  });

  assert(account, "account is null!");
  const { account_id, nickname } = account;
  assert(account_id, "account_id is null!");

  await Lobby.loginSuccess();

  if (!nickname) {
    let error: boolean;
    do {
      error = false;
      try {
        const nickname = getRandomMixedName();
        log("creating nickname", nickname);
        await Lobby.createNickname({
          nickname,
          tag: "en",
        });
      } catch {
        error = true;
      }
    } while (error);
  }

  log("Logged in to Mahjong Soul using", email);

  await Lobby.loginBeat({
    contract: "DF2vkXCnfeXp4WoGSBGNcJBufZiMN3UP",
  });

  if (game_info) {
    const { connect_token, game_uuid } = game_info;
    assert(connect_token && game_uuid);

    const game = new Game(account_id, game_uuid, connect_token);
    log(account_id, "> resuming match", game_uuid);
    await playGame(email, game, account_id);
    log(account_id, "> finished match");
  }


  const {amulet, sim_v2} = await fetchActivities(Lobby);
  assert(sim_v2?.activity_id)
  assert(amulet?.activity_id)

  await Lobby.taskRequest({ params: [amulet.activity_id] }, {throwError: false});
  await Lobby.taskRequest({ params: [sim_v2.activity_id] }, {throwError: false});

  for (let gamesPlayed = await getGamesPlayed(email); gamesPlayed < 16; gamesPlayed++) {
    if (debug) {
      await Lobby.leaveRoom(undefined, { throwError: false });
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
        match_sid: "1:2", // bronze east
      });
    }

    log(account_id, "> finding match...");

    const { connect_token, game_uuid } = await lobbyAgent.once(
      debug ? "NotifyRoomGameStart" : "NotifyMatchGameStart",
    );
    log(account_id, "> found match", gamesPlayed, game_uuid);

    const game = new Game(account_id, game_uuid, connect_token);
    await playGame(email, game, account_id);
    log(account_id, "> finished match");
  }

  log("Exited account", email);

  lobbyAgent.close();
}
