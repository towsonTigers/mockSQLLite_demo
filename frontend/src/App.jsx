import { useEffect, useState, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Board from './components/Board.jsx';
import QueryConsole from './components/QueryConsole.jsx';
import NewTaskForm from './components/NewTaskForm.jsx';
import './App.css';

const API = '/api';

export default function App() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ todo: 0, in_progress: 0, done: 0 });
  const [activeProject, setActiveProject] = useState(null); // null = all
  const [showForm, setShowForm] = useState(false);
  const [lastQuery, setLastQuery] = useState(null);
  const [error, setError] = useState(null);

  const loadProjects = useCallback(async () => {
    const res = await fetch(`${API}/projects`);
    const data = await res.json();
    setProjects(data);
  }, []);

  const loadStats = useCallback(async () => {
    const res = await fetch(`${API}/tasks/stats`);
    const data = await res.json();
    setStats(data);
  }, []);

  const loadTasks = useCallback(async (projectId) => {
    const params = new URLSearchParams();
    if (projectId) params.set('project_id', projectId);
    const qs = params.toString();
    const res = await fetch(`${API}/tasks${qs ? `?${qs}` : ''}`);
    const data = await res.json();
    setTasks(data);

    setLastQuery({
      sql: "SELECT * FROM tasks WHERE 1=1" +
        (projectId ? "\n  AND project_id = ?" : "") +
        "\nORDER BY priority = 'high' DESC, created_at DESC",
      params: projectId ? [projectId] : [],
      rows: data.length,
    });
  }, []);

  const refreshAll = useCallback(async (projectId) => {
    await Promise.all([loadProjects(), loadStats(), loadTasks(projectId)]);
  }, [loadProjects, loadStats, loadTasks]);

  useEffect(() => {
    refreshAll(activeProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectProject = (id) => {
    setActiveProject(id);
    loadTasks(id);
  };

  const createTask = async (payload) => {
    setError(null);
    const res = await fetch(`${API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not create task');
      return false;
    }
    setShowForm(false);
    await refreshAll(activeProject);
    return true;
  };

  const updateStatus = async (task, status) => {
    await fetch(`${API}/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await refreshAll(activeProject);
  };

  const deleteTask = async (task) => {
    await fetch(`${API}/tasks/${task.id}`, { method: 'DELETE' });
    await refreshAll(activeProject);
  };

  const projectMap = useMemo(() => {
    const m = new Map();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">▮</span>
          <div>
            <h1>TaskFlow</h1>
            <p className="tagline">demo product, tested against real SQLite — not mocks</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New task
        </button>
      </header>

      <QueryConsole query={lastQuery} />

      <div className="app-body">
        <Sidebar
          projects={projects}
          stats={stats}
          activeProject={activeProject}
          onSelect={selectProject}
        />
        <Board
          tasks={tasks}
          projectMap={projectMap}
          onStatusChange={updateStatus}
          onDelete={deleteTask}
        />
      </div>

      {showForm && (
        <NewTaskForm
          projects={projects}
          defaultProjectId={activeProject}
          error={error}
          onCancel={() => { setShowForm(false); setError(null); }}
          onSubmit={createTask}
        />
      )}
    </div>
  );
}
