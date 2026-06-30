const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function checkConnection(name, connectionString) {
  if (!connectionString) {
    console.log(`${name}: skipped (connection URL is not configured)`);
    return;
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    const result = await client.query(
      'SELECT current_database() AS database, current_user AS username, version()'
    );
    const row = result.rows[0];
    console.log(`${name}: connected successfully`);
    console.log(`  database: ${row.database}`);
    console.log(`  user: ${row.username}`);
  } catch (error) {
    console.error(`${name}: connection failed`);
    console.error(`  ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  await checkConnection('Development database', process.env.DATABASE_URL);
  await checkConnection('Test database', process.env.DATABASE_URL_TEST);
}

main();
