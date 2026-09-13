const request = require('supertest');
const { faker } = require('@faker-js/faker');
const { buildTestContext } = require('./setup');

describe('faker-js generating realistic data for the real TaskFlow API', () => {
  let app, db;

  beforeEach(() => {
    ({ app, db } = buildTestContext());
  });

  afterEach(() => {
    db.close();
  });

  it('creates a batch of projects with realistic, varied names instead of "Test Project 1/2/3"', async () => {
    const names = new Set();
    for (let i = 0; i < 5; i++) {
      // faker.company.name() can occasionally collide across a small
      // batch, so retry until we get a name not already used —
      // schema.sql's UNIQUE COLLATE NOCASE constraint would 400 on a dupe.
      let name;
      do {
        name = faker.company.name();
      } while (names.has(name.toLowerCase()));
      names.add(name.toLowerCase());

      const res = await request(app).post('/api/projects').send({ name });
      expect(res.status).toBe(201);
    }

    const list = await request(app).get('/api/projects');
    expect(list.body).toHaveLength(5);
  });

  it('seeds a project with realistic tasks and verifies stats aggregation matches what was inserted', async () => {
    const project = db.prepare('INSERT INTO projects (name) VALUES (?)').run(faker.company.name());

    const statuses = ['todo', 'in_progress', 'done'];
    const expectedCounts = { todo: 0, in_progress: 0, done: 0 };

    for (let i = 0; i < 10; i++) {
      const status = faker.helpers.arrayElement(statuses);
      expectedCounts[status] += 1;

      await request(app).post('/api/tasks').send({
        project_id: project.lastInsertRowid,
        title: faker.hacker.phrase(), // realistic-sounding task titles for free
        description: faker.lorem.sentence(),
        status,
        priority: faker.helpers.arrayElement(['low', 'medium', 'high']),
      });
    }

    const stats = await request(app).get('/api/tasks/stats');
    expect(stats.body).toEqual(expectedCounts);
  });
});
