# TaskFlow — Frontend

React + Vite Kanban board UI for TaskFlow. It talks to the TaskFlow backend API over
`/api/*` and includes a "Live Query" panel that shows the actual SQL statement and
parameters behind whatever data is currently on screen.

This folder is the frontend only. For the API server, see `../backend/README.md`
(or the root `README.md` for the full project).

## Prerequisites

- Node.js 18+ and npm
- The TaskFlow backend running on **http://localhost:3001** (see `../backend`) — the
  dev server proxies API calls there, so without it the UI will load but show no data

## Project structure

```
frontend/
├── index.html              # Vite entry HTML
├── vite.config.js          # dev server port + /api proxy config
└── src/
    ├── main.jsx             # React root
    ├── App.jsx              # top-level state, data fetching, API calls
    ├── App.css / index.css  # styling
    └── components/
        ├── Sidebar.jsx      # project list + status breakdown (todo/in_progress/done)
        ├── Board.jsx        # Kanban columns, groups tasks by status
        ├── TaskCard.jsx     # single task card with "advance status" / delete actions
        ├── NewTaskForm.jsx  # modal form for creating a task
        └── QueryConsole.jsx # "Live Query" panel showing the SQL behind the current view
```

## Setup

```bash
npm install
```

## Running in development

Start the backend first (in a separate terminal, from `../backend`):

```bash
npm run dev
```

Then, from this `frontend/` folder:

```bash
npm run dev
```

- Opens the dev server at **http://localhost:5173**.
- `vite.config.js` proxies any request to `/api/*` through to
  `http://localhost:3001`, where the backend is expected to be running.
- Edits to files under `src/` hot-reload in the browser.

## What the app does

- **Sidebar** — lists all projects (with a task count for each) and a live status
  breakdown fetched from `GET /api/tasks/stats`. Selecting a project filters the board
  via `GET /api/tasks?project_id=`.
- **Board** — three columns (To do / In progress / Done) built by grouping the loaded
  tasks by `status` client-side.
- **Task cards** — each card shows title, description, priority, and project, with a
  button to advance its status (`todo → in_progress → done`) via `PUT /api/tasks/:id`,
  and a delete button (`DELETE /api/tasks/:id`).
- **New task form** — a modal that posts to `POST /api/tasks`, with client-side checks
  (non-empty title, a project selected) mirroring the backend's validation.
- **Live Query panel** — displays the exact SQL text, bound parameters, and row count
  for the most recent tasks query, so it's visible that the UI is reading from a real
  SQL database rather than mocked/static data.

## Available scripts

| Command           | Description                                              |
|--------------------|-----------------------------------------------------------|
| `npm run dev`      | Start the Vite dev server on port 5173 with API proxying  |
| `npm run build`    | Production build, output to `dist/`                       |
| `npm run preview`  | Serve the production build from `dist/` locally           |

## Building for production

```bash
npm run build
npm run preview
```

`npm run build` outputs static assets to `frontend/dist`. In production, requests to
`/api/*` are **not** proxied automatically the way they are in dev — you'll need to
serve `dist/` behind the same origin as the API (e.g. a reverse proxy) or update the
`API` base path in `src/App.jsx` to point at the backend's URL.

## Tests

There is no frontend test suite in this project. Automated tests cover the backend API
only — see `../backend/README.md` for how to run those.
