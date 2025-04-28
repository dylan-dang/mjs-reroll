import assert from 'assert';
import { getGmailClient } from './gmail';
import { pool } from './utils';
import { reroll } from './reroll';
import { generateVariants, drop } from './utils';

async function main() {
  const gmail = await getGmailClient();

  const profile = await gmail.users.getProfile({ userId: 'me' });
  assert(profile.data.emailAddress);

  await pool(
    [drop(generateVariants(profile.data.emailAddress), 0).next().value!],
    reroll.bind(null, gmail),
    8
  );
}

await main();
