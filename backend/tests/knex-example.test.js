const fs = require('fs');
const path = require('path');
const knexLib = require('knex');

const SCHEMA_PATH = path.join(__dirname, '../src/schema.sql');

/**
 * Same schema.sql the raw better-sqlite3 layer uses — Knex just gives
 * us a query-builder API on top of the same in-memory SQLite engine.
 * This is the pattern from the talk: swap the query layer, keep the
 * schema and the "spin up a fresh in-memory DB per test" approach.
 */
function buildKnexContext() {
  const db = knexLib({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  return db;
}

describe('Knex query builder against the real TaskFlow schema', () => {
  let db;

  beforeEach(async () => {
    db = buildKnexContext();
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    // Knex's better-sqlite3 dialect runs each raw() call through
    // Database#prepare(), which only accepts a single statement —
    // unlike better-sqlite3's own db.exec(), which runs a whole script.
    // So we split schema.sql on statement boundaries and run each one.
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await db.raw(statement);
    }
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('inserts a project and task with the fluent builder, then filters by status', async () => {
    const [projectId] = await db('projects').insert({ name: 'Conference Demo' });

    await db('tasks').insert([
      { project_id: projectId, title: 'Write slides', status: 'in_progress', priority: 'high' },
      { project_id: projectId, title: 'Rehearse talk', status: 'todo', priority: 'medium' },
    ]);

    const inProgress = await db('tasks').where({ project_id: projectId, status: 'in_progress' });

    expect(inProgress).toHaveLength(1);
    expect(inProgress[0].title).toBe('Write slides');
  });

  it('cascades task deletes when the parent project is deleted (real FK, not a mock)', async () => {
    const [projectId] = await db('projects').insert({ name: 'Doomed via Knex' });
    await db('tasks').insert({ project_id: projectId, title: 'Will vanish' });

    await db('projects').where({ id: projectId }).del();

    const remaining = await db('tasks').where({ project_id: projectId });
    expect(remaining).toHaveLength(0);
  });
});
