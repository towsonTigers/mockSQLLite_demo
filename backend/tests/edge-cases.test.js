const request = require('supertest');
const { buildTestContext } = require('./setup');

/**
 * EDGE CASE SUITE
 *
 * These aren't "does the happy path work" tests - tasks.test.js and
 * projects.test.js already cover that. These deliberately probe the
 * boundaries: malformed input, injection attempts, race-prone writes,
 * and validation asymmetries between POST and PUT.
 *
 * This suite originally shipped with 5 failing tests documenting real
 * gaps: whitespace-only titles slipping through, PUT allowing a title
 * to be cleared to empty (an asymmetry with POST), PUT silently
 * dropping project_id instead of validating a move, and project-name
 * uniqueness that ignored case and padding. All five are now fixed in
 * src/routes/tasks.js, src/routes/projects.js, and src/schema.sql -
 * these tests assert the corrected behavior.
 */

describe('Edge cases', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = buildTestContext());
  });

  afterEach(() => {
    db.close();
  });

  // ---------------------------------------------------------------
  // 1. Empty / whitespace input
  // ---------------------------------------------------------------
  describe('empty and whitespace input', () => {
    it('rejects an empty-string title on create', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P');
      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: '' });
      expect(res.status).toBe(400);
    });

    // Whitespace-only strings are truthy in JS, so a naive `!title` check
    // lets them through. The route trims before validating, so this is
    // now rejected the same as an empty string.
    it('rejects a whitespace-only title on create', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P');
      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: '   ' });
      expect(res.status).toBe(400);
    });

    // Previously POST validated `!title` but PUT's destructuring default
    // (`title = existing.title`) only fires on `undefined`, so an explicit
    // empty string sailed through untouched. PUT now trims and validates
    // title the same way POST does.
    it('rejects an attempt to clear a title to empty string via PUT', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P');
      const created = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: 'Real title' });

      const res = await request(app)
        .put(`/api/tasks/${created.body.id}`)
        .send({ title: '' });

      expect(res.status).toBe(400);

      // and the original title must be untouched
      const stillThere = await request(app).get(`/api/tasks/${created.body.id}`);
      expect(stillThere.body.title).toBe('Real title');
    });

    it('rejects a project with an empty name', async () => {
      const res = await request(app).post('/api/projects').send({ name: '' });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // 2. Type coercion / malformed values
  // ---------------------------------------------------------------
  describe('type coercion and malformed values', () => {
    it('rejects project_id: 0 the same as a missing project_id', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: 0, title: 'Zero id' });
      // 0 is falsy in JS, so `!project_id` treats it as "missing" -
      // acceptable here since real IDs start at 1, but worth asserting
      // explicitly so a future refactor to `project_id == null` is caught.
      expect(res.status).toBe(400);
    });

    it('rejects a non-numeric project_id as "does not exist" rather than crashing', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: 'not-a-number', title: 'Bad id' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not exist/);
    });

    it('accepts a numeric-string project_id (common when data comes from a query param or form)', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P');
      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: String(project.lastInsertRowid), title: 'String id' });
      expect(res.status).toBe(201);
    });

    it('rejects status with wrong casing ("Done" is not "done")', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P');
      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: 'Case test', status: 'Done' });
      expect(res.status).toBe(400);
    });

    it('GET /api/tasks?project_id=<non-numeric> returns an empty list, not an error', async () => {
      const res = await request(app).get('/api/tasks?project_id=abc');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // 3. SQL injection attempts (proving parameterization actually works)
  // ---------------------------------------------------------------
  describe('SQL injection attempts', () => {
    it('stores a classic injection payload as a literal string, does not execute it', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P');
      const payload = "Robert'); DROP TABLE tasks;--";

      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: payload });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe(payload); // stored verbatim

      // the table must still exist and be queryable
      const stillThere = db.prepare('SELECT COUNT(*) as c FROM tasks').get();
      expect(stillThere.c).toBe(1);
    });

    it('handles a title containing double quotes without breaking the query (the bug from the talk, inverted)', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P');
      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: 'Say "hello" to SQL', priority: 'high' });

      expect(res.status).toBe(201);

      // this exercises the exact ORDER BY clause that broke during the talk
      const list = await request(app).get('/api/tasks?status=todo');
      expect(list.status).toBe(200);
      expect(list.body.some((t) => t.title === 'Say "hello" to SQL')).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 4. Referential integrity & cascades
  // ---------------------------------------------------------------
  describe('referential integrity', () => {
    it('cascade-deletes many tasks at once when a project is deleted', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Big project');
      const insert = db.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
      for (let i = 0; i < 50; i++) insert.run(project.lastInsertRowid, `Task ${i}`);

      db.prepare('DELETE FROM projects WHERE id = ?').run(project.lastInsertRowid);

      const remaining = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE project_id = ?')
        .get(project.lastInsertRowid);
      expect(remaining.c).toBe(0);
    });

    // Previously PUT silently dropped project_id from the body - there was
    // no way to move a task to a different project through this API.
    // It's now supported, with the same "does the project exist" guard
    // that POST already applied on create.
    it('moves a task to a different project via PUT', async () => {
      const projA = db.prepare('INSERT INTO projects (name) VALUES (?)').run('A');
      const projB = db.prepare('INSERT INTO projects (name) VALUES (?)').run('B');
      const created = await request(app)
        .post('/api/tasks')
        .send({ project_id: projA.lastInsertRowid, title: 'Move me' });

      const res = await request(app)
        .put(`/api/tasks/${created.body.id}`)
        .send({ project_id: projB.lastInsertRowid });

      expect(res.status).toBe(200);
      expect(res.body.project_id).toBe(projB.lastInsertRowid);
    });

    it('rejects moving a task to a project_id that does not exist', async () => {
      const projA = db.prepare('INSERT INTO projects (name) VALUES (?)').run('A');
      const created = await request(app)
        .post('/api/tasks')
        .send({ project_id: projA.lastInsertRowid, title: 'Stay put' });

      const res = await request(app)
        .put(`/api/tasks/${created.body.id}`)
        .send({ project_id: 999999 });

      expect(res.status).toBe(400);

      // and the task must not have moved
      const stillThere = await request(app).get(`/api/tasks/${created.body.id}`);
      expect(stillThere.body.project_id).toBe(projA.lastInsertRowid);
    });
  });

  // ---------------------------------------------------------------
  // 5. Uniqueness edge cases
  // ---------------------------------------------------------------
  describe('project name uniqueness', () => {
    it('rejects an exact duplicate project name', async () => {
      await request(app).post('/api/projects').send({ name: 'Duplicate' });
      const res = await request(app).post('/api/projects').send({ name: 'Duplicate' });
      expect(res.status).toBe(400);
    });

    // Previously SQLite's default TEXT collation was case-sensitive
    // (BINARY) and the schema had no COLLATE NOCASE, so these were
    // treated as two different names. Schema now declares the column
    // COLLATE NOCASE.
    it('rejects a case-insensitive duplicate project name', async () => {
      await request(app).post('/api/projects').send({ name: 'Website' });
      const res = await request(app).post('/api/projects').send({ name: 'website' });
      expect(res.status).toBe(400);
    });

    // Previously names weren't trimmed, so visually-identical names with
    // padding were treated as distinct. The route now trims before
    // validating/inserting.
    it('rejects a padded duplicate project name', async () => {
      await request(app).post('/api/projects').send({ name: 'Website' });
      const res = await request(app).post('/api/projects').send({ name: ' Website ' });
      expect(res.status).toBe(400);
    });

    it('still allows genuinely different names', async () => {
      const a = await request(app).post('/api/projects').send({ name: 'Website' });
      const b = await request(app).post('/api/projects').send({ name: 'Mobile App' });
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
    });

    it('rejects a whitespace-only project name', async () => {
      const res = await request(app).post('/api/projects').send({ name: '   ' });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // 6. Empty-database / zero-row states
  // ---------------------------------------------------------------
  describe('empty database states', () => {
    it('returns zeroed stats (not an error) when there are no tasks at all', async () => {
      const res = await request(app).get('/api/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0 });
    });

    it('returns an empty array (not 404) for a project with zero tasks', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Empty project');
      const res = await request(app).get(`/api/tasks?project_id=${project.lastInsertRowid}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns an empty array (not an error) filtering by a project_id that does not exist at all', async () => {
      const res = await request(app).get('/api/tasks?project_id=999999');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // 7. Idempotency
  // ---------------------------------------------------------------
  describe('idempotency', () => {
    it('deleting the same task twice returns 404 the second time, not a crash', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P');
      const created = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: 'Delete me twice' });

      const first = await request(app).delete(`/api/tasks/${created.body.id}`);
      const second = await request(app).delete(`/api/tasks/${created.body.id}`);

      expect(first.status).toBe(204);
      expect(second.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------
  // 8. Large / unusual payloads
  // ---------------------------------------------------------------
  describe('large and unusual payloads', () => {
    it('accepts a very long title (SQLite TEXT is effectively unbounded)', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P');
      const longTitle = 'x'.repeat(50000);

      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: longTitle });

      expect(res.status).toBe(201);
      expect(res.body.title.length).toBe(50000);
      // Note: nothing stops this today - worth an app-level length cap
      // even though the database itself won't complain.
    });

    it('round-trips unicode and emoji correctly', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P');
      const title = '\u4fee\u5fa9\u30d0\u30b0 \ud83d\udc1b \u2014 fix production issue';

      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe(title);
    });
  });
});
