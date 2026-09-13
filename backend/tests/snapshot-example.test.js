const request = require('supertest');
const { buildTestContext } = require('./setup');

describe('Snapshot testing the real API response shapes', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = buildTestContext({ withSeedData: true }));
  });

  afterEach(() => {
    db.close();
  });

  it('matches the known-good shape of GET /api/tasks/stats', async () => {
    const res = await request(app).get('/api/tasks/stats');

    expect(res.status).toBe(200);
    // From seed.js: 3 todo, 2 in_progress, 2 done across both projects.
    // A snapshot here mainly guards the *shape* (keys present, no extra
    // fields sneaking in) — the exact counts are still asserted directly
    // above via toEqual in tasks.test.js, since counts are the kind of
    // thing you want a real assertion on, not just "did the diff change."
    expect(res.body).toMatchSnapshot();
  });

  it('matches the known-good shape of a single task, with volatile fields masked out', async () => {
    const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Snapshot Demo');
    const created = await request(app)
      .post('/api/tasks')
      .send({ project_id: project.lastInsertRowid, title: 'Snapshot this task' });

    // id and the timestamp columns change on every run, so a raw snapshot
    // would fail immediately on the second run for reasons that have
    // nothing to do with a real regression. Jest's property matchers let
    // you snapshot the *shape* while ignoring values that are expected to
    // vary, instead of hand-picking individual fields to assert on.
    expect(created.body).toMatchSnapshot({
      id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });
});
