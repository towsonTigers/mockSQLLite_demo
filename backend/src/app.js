const express = require('express');
const cors = require('cors');
const { createTasksRouter } = require('./routes/tasks');
const { createProjectsRouter } = require('./routes/projects');

/**
 * App factory: builds an Express app wired to a *given* db connection.
 *
 * This one function is what makes the whole testing story work:
 * - In production (server.js) we call createApp(fileDb)
 * - In tests (tests/setup.js) we call createApp(inMemoryDb)
 *
 * supertest can then fire real HTTP requests at the app, which run
 * through real Express middleware and real SQL against a real
 * (if ephemeral) SQLite engine. No mocking of req/res, no mocking
 * of the database layer.
 */
function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/tasks', createTasksRouter(db));
  app.use('/api/projects', createProjectsRouter(db));

  // Centralized error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
