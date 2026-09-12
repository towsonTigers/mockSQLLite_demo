const express = require('express');

function createProjectsRouter(db) {
  const router = express.Router();

  // GET /api/projects  (with a task count per project via SQL join - real SQL, not mocked joins)
  router.get('/', (req, res) => {
    const projects = db.prepare(`
      SELECT p.*, COUNT(t.id) as task_count
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all();
    res.json(projects);
  });

  router.post('/', (req, res) => {
    const { name } = req.body;
    // Trim before validating/inserting so " Website " collides with an
    // existing "Website" instead of silently creating a near-duplicate,
    // and so a whitespace-only name is treated the same as an empty one.
    const trimmedName = typeof name === 'string' ? name.trim() : name;
    if (!trimmedName) return res.status(400).json({ error: 'name is required' });

    try {
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(trimmedName);
      const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(created);
    } catch (err) {
      // UNIQUE constraint violation surfaces here - real constraint, real error path
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createProjectsRouter };
