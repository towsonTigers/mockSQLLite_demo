/**
 * Seeds a database with realistic sample data.
 * Used by: `npm run dev` (local file DB) AND by tests that want a
 * pre-populated in-memory DB instead of an empty one.
 */
function seed(db) {
  const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
  const insertTask = db.prepare(`
    INSERT INTO tasks (project_id, title, description, status, priority)
    VALUES (?, ?, ?, ?, ?)
  `);

  const seedTx = db.transaction(() => {
    const website = insertProject.run('Website Relaunch');
    const mobile = insertProject.run('Mobile App v2');

    const tasks = [
      [website.lastInsertRowid, 'Design new homepage', 'Hero section + nav redesign', 'in_progress', 'high'],
      [website.lastInsertRowid, 'Migrate blog to CMS', '', 'todo', 'medium'],
      [website.lastInsertRowid, 'Fix Lighthouse performance score', 'LCP is 4.2s, needs to be < 2.5s', 'todo', 'high'],
      [website.lastInsertRowid, 'Write launch announcement', '', 'done', 'low'],
      [mobile.lastInsertRowid, 'Implement push notifications', 'iOS + Android', 'in_progress', 'high'],
      [mobile.lastInsertRowid, 'Add offline mode', 'Cache last 50 items locally', 'todo', 'medium'],
      [mobile.lastInsertRowid, 'App store screenshots', '', 'done', 'low'],
    ];

    for (const t of tasks) insertTask.run(...t);
  });

  seedTx();
}

module.exports = { seed };
