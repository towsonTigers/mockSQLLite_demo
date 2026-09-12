const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Creates a fully-initialized SQLite database connection.
 *
 * This is THE key abstraction for the talk:
 *   - Pass a file path  -> real, persistent database (production / local dev)
 *   - Pass ':memory:'   -> ephemeral, in-process database (tests)
 *
 * Both code paths run through the exact same schema.sql, so tests
 * exercise real SQL (constraints, foreign keys, CHECKs, indexes) —
 * not a hand-rolled mock's approximation of SQL.
 */
function createDb(filePath = ':memory:') {
  const db = new Database(filePath);
  // WAL mode only makes sense for on-disk databases; in-memory DBs
  // (used by the test suite) don't support it.
  if (filePath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  return db;
}

module.exports = { createDb };
