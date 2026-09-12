const request = require('supertest');
const { buildTestContext } = require('./setup');

describe('Tasks API (end-to-end against real SQLite, not mocks)', () => {
  let app, db;

  // A fresh, empty, isolated in-memory database for EVERY test.
  // This runs in single-digit milliseconds - there's no network call,
  // no docker container, no shared fixture state to reset.
  beforeEach(() => {
    ({ app, db } = buildTestContext());
  });

  afterEach(() => {
    db.close();
  });

  describe('POST /api/tasks', () => {
    it('creates a task when the referenced project exists', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Demo Project');

      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: 'Write conference talk' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        title: 'Write conference talk',
        status: 'todo',
        priority: 'medium',
      });
      expect(res.body.id).toBeDefined();
    });

    it('rejects a task with a non-existent project_id (real FK-style validation)', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: 9999, title: 'Orphan task' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not exist/);
    });

    it('rejects an invalid status/priority enum value', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Demo Project');

      const res = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: 'Bad status', status: 'yolo' });

      expect(res.status).toBe(400);
    });

    it('requires title and project_id', async () => {
      const res = await request(app).post('/api/tasks').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/tasks', () => {
    it('filters by status using real SQL WHERE clauses', async () => {
      const { app, db } = buildTestContext({ withSeedData: true });

      const res = await request(app).get('/api/tasks?status=done');

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((t) => t.status === 'done')).toBe(true);

      db.close();
    });

    it('rejects an invalid status filter', async () => {
      const res = await request(app).get('/api/tasks?status=not-a-real-status');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/tasks/stats', () => {
    it('aggregates counts per status via GROUP BY (validates real SQL aggregation)', async () => {
      const { app, db } = buildTestContext({ withSeedData: true });

      const res = await request(app).get('/api/tasks/stats');

      expect(res.status).toBe(200);
      // From seed.js: 2 done, 2 in_progress, 3 todo across both projects
      expect(res.body).toEqual({ todo: 3, in_progress: 2, done: 2 });

      db.close();
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('updates status and bumps updated_at', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Demo Project');
      const created = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: 'Ship it' });

      const res = await request(app)
        .put(`/api/tasks/${created.body.id}`)
        .send({ status: 'done' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.title).toBe('Ship it'); // untouched fields preserved
    });

    it('404s for a task that does not exist', async () => {
      const res = await request(app).put('/api/tasks/99999').send({ status: 'done' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('deletes an existing task', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Demo Project');
      const created = await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: 'Temporary task' });

      const del = await request(app).delete(`/api/tasks/${created.body.id}`);
      expect(del.status).toBe(204);

      const get = await request(app).get(`/api/tasks/${created.body.id}`);
      expect(get.status).toBe(404);
    });
  });

  describe('cascading delete (real FK behavior, not something you can fake with mocks)', () => {
    it('removes tasks when their parent project is deleted', async () => {
      const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Doomed Project');
      await request(app)
        .post('/api/tasks')
        .send({ project_id: project.lastInsertRowid, title: 'Will be cascade-deleted' });

      db.prepare('DELETE FROM projects WHERE id = ?').run(project.lastInsertRowid);

      const remaining = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE project_id = ?')
        .get(project.lastInsertRowid);
      expect(remaining.count).toBe(0);
    });
  });
});
