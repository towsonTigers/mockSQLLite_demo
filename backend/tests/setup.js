const { createDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seed } = require('../src/seed');

/**
 * Spins up a brand-new, fully isolated SQLite database that lives only
 * in process memory, applies the REAL schema.sql to it, optionally
 * seeds it with realistic fixtures, and wires it into a real Express
 * app instance.
 *
 * Call this in beforeEach() and you get total test isolation with
 * zero cleanup code required - the whole database just evaporates
 * when the reference is dropped. No TRUNCATE TABLE, no test-order
 * dependencies, no "who left data in the DB" debugging sessions.
 */
function buildTestContext({ withSeedData = false } = {}) {
  const db = createDb(':memory:');
  if (withSeedData) seed(db);
  const app = createApp(db);
  return { db, app };
}

module.exports = { buildTestContext };
