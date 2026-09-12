const NEXT_STATUS = {
  todo: 'in_progress',
  in_progress: 'done',
  done: null,
};

const NEXT_LABEL = {
  todo: 'Start →',
  in_progress: 'Finish →',
  done: null,
};

export default function TaskCard({ task, project, onStatusChange, onDelete }) {
  const next = NEXT_STATUS[task.status];

  return (
    <article className={`task-card priority-${task.priority}`}>
      <div className="task-card-top">
        {project && <span className="task-project">{project.name}</span>}
        <span className={`task-priority priority-tag-${task.priority}`}>{task.priority}</span>
      </div>
      <h4 className="task-title">{task.title}</h4>
      {task.description && <p className="task-desc">{task.description}</p>}
      <div className="task-card-footer">
        <button className="link-btn danger" onClick={() => onDelete(task)}>
          Delete
        </button>
        {next && (
          <button className="link-btn" onClick={() => onStatusChange(task, next)}>
            {NEXT_LABEL[task.status]}
          </button>
        )}
      </div>
    </article>
  );
}
