import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
    email: text("email").primaryKey(),
    uid: text("uid").notNull(),
    token: text("token").notNull(),
})