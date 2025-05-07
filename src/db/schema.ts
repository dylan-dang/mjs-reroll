import {
  sqliteTable,
  text,
  primaryKey,
  unique,
  integer,
} from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable(
  'accounts',
  {
    email: text('email').primaryKey(),
    uid: text('uid').notNull(),
    token: text('token').notNull(),
    pulled: integer('pulled', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [unique().on(t.uid)]
);

export const games = sqliteTable(
  'games',
  {
    email: text('email')
      .notNull()
      .references(() => accounts.email),
    game_uuid: text('uuid').notNull(),
  },
  (t) => [primaryKey({ columns: [t.email, t.game_uuid] })]
);

export const rewards = sqliteTable(
  'rewards',
  {
    id: integer('id').notNull(),
    email: text('email')
      .references(() => accounts.email)
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.email, t.id] })]
);
