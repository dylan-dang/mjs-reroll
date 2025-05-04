import { sqliteTable, text, primaryKey, unique } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable(
  "accounts",
  {
    email: text("email").primaryKey(),
    uid: text("uid").notNull(),
    token: text("token").notNull(),
  },
  (t) => [unique().on(t.uid)],
);

export const games = sqliteTable(
  "games",
  {
    email: text("email")
      .notNull()
      .references(() => accounts.email),
    game_uuid: text("uuid").notNull(),
  },
  (t) => [primaryKey({ columns: [t.email, t.game_uuid] })],
);
