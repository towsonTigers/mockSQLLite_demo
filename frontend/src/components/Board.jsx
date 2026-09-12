import TaskCard from './TaskCard.jsx';

const COLUMNS = [
  { key: 'todo', label: 'To do', color: 'var(--accent-todo)' },
  { key: 'in_progress', label: 'In progress', color: 'var(--accent-progress)' },
  { key: 'done', label: 'Done', color: 'var(--accent-done)' },
];

export default function Board({ tasks, projectMap, onStatusChange, onDelete }) {
  return (
    <main className="board">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.key);
        return (
          <section className="board-column" key={col.key}>
            <header className="board-column-header">
              <span className="board-column-dot" style={{ background: col.color }} />
              <h3>{col.label}</h3>
              <span className="board-column-count">{colTasks.length}</span>
            </header>
            <div className="board-column-body scrollbar">
              {colTasks.length === 0 && (
                <p className="board-empty">Nothing here.</p>
              )}
              {colTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={projectMap.get(task.project_id)}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
