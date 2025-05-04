import {
  sqliteTable,
  integer,
  text,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable(
  "accounts",
  {
    email: text("email").primaryKey(),
    uid: integer("uid").notNull(),
    token: text("token").notNull(),
  },
  (t) => [index("uid_index").on(t.token), unique().on(t.uid)],
);

export const games = sqliteTable(
  "games",
  {
    account_id: integer("account_id")
      .notNull()
      .references(() => accounts.uid),
    game_uuid: text("uuid").notNull(),
  },
  (t) => [primaryKey({ columns: [t.account_id, t.game_uuid] })],
);
