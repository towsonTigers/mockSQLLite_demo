const request = require('supertest');
const { buildTestContext } = require('./setup');

describe('Projects API', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = buildTestContext());
  });

  afterEach(() => {
    db.close();
  });

  it('creates a project', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'New Project' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New Project');
  });

  it('enforces the UNIQUE constraint on project name (real constraint, not a mock assumption)', async () => {
    await request(app).post('/api/projects').send({ name: 'Duplicate' });
    const res = await request(app).post('/api/projects').send({ name: 'Duplicate' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/UNIQUE/i);
  });

  it('returns projects with an accurate task_count from a SQL join', async () => {
    const { app, db } = buildTestContext({ withSeedData: true });

    const res = await request(app).get('/api/projects');

    expect(res.status).toBe(200);
    const website = res.body.find((p) => p.name === 'Website Relaunch');
    expect(website.task_count).toBe(4);

    db.close();
  });
});
