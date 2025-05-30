import assert from "node:assert";
import { getGmailClient } from "./auth/gmail";
import { log, pool } from "./utils";
import { reroll } from "./reroll";
import { generateVariants } from "./utils";
import { accounts, concurrency, stagger } from "../config.json" with {
  type: "json",
};

async function main() {
  log("logging into gmail...");
  const gmail = await getGmailClient();

  const profile = await gmail.users.getProfile({ userId: "me" });
  assert(profile.data.emailAddress, "email address was not found");
  log("Logged into gmail: ", profile.data.emailAddress);
  await pool(
    generateVariants(profile.data.emailAddress).take(accounts),
    (email) => reroll(gmail, email),
    concurrency,
    stagger,
  );

  log("Account pool has been exhausted!");
  process.exit(1);
}

await main();
