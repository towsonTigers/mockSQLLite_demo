const express = require('express');

/**
 * Router factory. Takes a `db` connection so the SAME route code
 * runs against a production file-backed DB or a test in-memory DB —
 * there is no branching "if (process.env.NODE_ENV === 'test')" anywhere.
 */
function createTasksRouter(db) {
  const router = express.Router();

  const VALID_STATUS = ['todo', 'in_progress', 'done'];
  const VALID_PRIORITY = ['low', 'medium', 'high'];

  // GET /api/tasks?status=todo&project_id=1
  router.get('/', (req, res) => {
    const { status, project_id } = req.query;
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (status) {
      if (!VALID_STATUS.includes(status)) {
        return res.status(400).json({ error: `Invalid status: ${status}` });
      }
      query += ' AND status = ?';
      params.push(status);
    }
    if (project_id) {
      query += ' AND project_id = ?';
      params.push(project_id);
    }
    query += " ORDER BY priority = 'high' DESC, created_at DESC";

    const tasks = db.prepare(query).all(...params);
    res.json(tasks);
  });

  // GET /api/tasks/stats  (aggregate SQL - exactly the kind of logic mocks can't validate)
  router.get('/stats', (req, res) => {
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM tasks
      GROUP BY status
    `).all();

    const stats = { todo: 0, in_progress: 0, done: 0 };
    for (const row of rows) stats[row.status] = row.count;
    res.json(stats);
  });

  // GET /api/tasks/:id
  router.get('/:id', (req, res) => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  });

  // POST /api/tasks
  router.post('/', (req, res) => {
    const { project_id, title, description = '', status = 'todo', priority = 'medium' } = req.body;

    // Whitespace-only titles ("   ") are truthy in JS, so a plain `!title`
    // check lets them through. Trim first so " " and "" are rejected alike.
    const trimmedTitle = typeof title === 'string' ? title.trim() : title;

    if (!project_id || !trimmedTitle) {
      return res.status(400).json({ error: 'project_id and title are required' });
    }
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }
    if (!VALID_PRIORITY.includes(priority)) {
      return res.status(400).json({ error: `Invalid priority: ${priority}` });
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
    if (!project) {
      return res.status(400).json({ error: `project_id ${project_id} does not exist` });
    }

    try {
      const result = db.prepare(`
        INSERT INTO tasks (project_id, title, description, status, priority)
        VALUES (?, ?, ?, ?, ?)
      `).run(project_id, trimmedTitle, description, status, priority);

      const created = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // PUT /api/tasks/:id
  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const {
      project_id = existing.project_id,
      title = existing.title,
      description = existing.description,
      status = existing.status,
      priority = existing.priority,
    } = req.body;

    // NOTE: destructuring defaults only fire on `undefined`, so an explicit
    // `title: ''` in the body would otherwise sail past this validation
    // even though POST would reject the same value. Trim first so both
    // routes treat "" and "   " identically.
    const trimmedTitle = typeof title === 'string' ? title.trim() : title;
    if (!trimmedTitle) {
      return res.status(400).json({ error: 'title cannot be empty' });
    }
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }
    if (!VALID_PRIORITY.includes(priority)) {
      return res.status(400).json({ error: `Invalid priority: ${priority}` });
    }

    // Previously project_id was silently dropped, so a task could never be
    // reassigned via this endpoint. Now: allow it, but validate the target
    // project actually exists first (same check POST performs on create).
    if (Number(project_id) !== existing.project_id) {
      const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
      if (!project) {
        return res.status(400).json({ error: `project_id ${project_id} does not exist` });
      }
    }

    db.prepare(`
      UPDATE tasks SET project_id = ?, title = ?, description = ?, status = ?, priority = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(project_id, trimmedTitle, description, status, priority, req.params.id);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  // DELETE /api/tasks/:id
  router.delete('/:id', (req, res) => {
    const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(204).send();
  });

  return router;
}

module.exports = { createTasksRouter };
