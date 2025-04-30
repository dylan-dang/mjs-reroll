import assert from 'assert';
import { getGmailClient } from './gmail';
import { pool } from './utils';
import { reroll } from './reroll';
import { generateVariants, drop } from './utils';

const DEBUG = false;

async function main() {
  const gmail = await getGmailClient();

  const profile = await gmail.users.getProfile({ userId: 'me' });
  assert(profile.data.emailAddress);
  console.log('Logged into gmail: ', profile.data.emailAddress);
  await pool(
    [drop(generateVariants(profile.data.emailAddress), 0).next().value!],
    (email) => reroll(gmail, email, DEBUG),
    8
  );

  console.log('Account pool has been exhausted!');
  process.exit(1);
}

await main();
