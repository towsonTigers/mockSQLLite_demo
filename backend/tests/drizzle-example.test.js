const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { sqliteTable, integer, text } = require('drizzle-orm/sqlite-core');
const { eq } = require('drizzle-orm');

const SCHEMA_PATH = path.join(__dirname, '../src/schema.sql');

/**
 * Mirrors schema.sql as Drizzle table definitions.
 * In a TypeScript project this file IS your source of truth and every
 * query below would be fully typed with no extra annotation needed —
 * here in plain JS you lose the compile-time inference but the query
 * builder API is identical.
 */
const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  // created_at is intentionally NOT declared here. Drizzle sends every
  // declared column on insert (NULL if you don't supply a value), which
  // would stomp schema.sql's DEFAULT (datetime('now')). A real migration
  // would instead write: createdAt: text('created_at')
  //   .default(sql`(datetime('now'))`)
  // so Drizzle's default matches the SQL-level one.
});

const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  priority: text('priority').notNull(),
  // description/created_at/updated_at omitted for the same reason as
  // projects.created_at above — see comment there.
});

function buildDrizzleContext() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  sqlite.exec(schema); // exec() (unlike prepare()) runs a whole multi-statement script
  return { sqlite, db: drizzle(sqlite) };
}

describe('Drizzle ORM against the real TaskFlow schema', () => {
  let sqlite, db;

  beforeEach(() => {
    ({ sqlite, db } = buildDrizzleContext());
  });

  afterEach(() => {
    sqlite.close();
  });

  it('inserts via the typed table objects and reads back with .returning()', async () => {
    const [project] = await db
      .insert(projects)
      .values({ name: 'Drizzle Demo' })
      .returning();

    const [task] = await db
      .insert(tasks)
      .values({
        projectId: project.id,
        title: 'Show typed inserts',
        status: 'todo',
        priority: 'high',
      })
      .returning();

    expect(task.title).toBe('Show typed inserts');
    expect(task.projectId).toBe(project.id);
  });

  it('filters with eq() the same way the schema.sql CHECK constraint enforces valid status', async () => {
    const [project] = await db.insert(projects).values({ name: 'Filter Demo' }).returning();

    await db.insert(tasks).values([
      { projectId: project.id, title: 'Done task', status: 'done', priority: 'low' },
      { projectId: project.id, title: 'Todo task', status: 'todo', priority: 'low' },
    ]);

    const doneTasks = await db.select().from(tasks).where(eq(tasks.status, 'done'));

    expect(doneTasks).toHaveLength(1);
    expect(doneTasks[0].title).toBe('Done task');
  });
});
