export default function Sidebar({ projects, stats, activeProject, onSelect }) {
  const total = stats.todo + stats.in_progress + stats.done;

  return (
    <aside className="sidebar scrollbar">
      <div className="sidebar-section">
        <h2 className="sidebar-heading">Projects</h2>
        <nav className="project-list">
          <button
            className={`project-item ${activeProject === null ? 'active' : ''}`}
            onClick={() => onSelect(null)}
          >
            <span>All tasks</span>
            <span className="count">{total}</span>
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              className={`project-item ${activeProject === p.id ? 'active' : ''}`}
              onClick={() => onSelect(p.id)}
            >
              <span>{p.name}</span>
              <span className="count">{p.task_count}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-section">
        <h2 className="sidebar-heading">Status breakdown</h2>
        <div className="stat-bars">
          <StatBar label="To do" value={stats.todo} total={total} color="var(--accent-todo)" />
          <StatBar label="In progress" value={stats.in_progress} total={total} color="var(--accent-progress)" />
          <StatBar label="Done" value={stats.done} total={total} color="var(--accent-done)" />
        </div>
        <p className="stat-source">
          via <code>GROUP BY status</code>
        </p>
      </div>
    </aside>
  );
}

function StatBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="stat-bar-row">
      <div className="stat-bar-label">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="stat-bar-track">
        <div className="stat-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
