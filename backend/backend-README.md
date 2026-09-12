# TaskFlow — Backend

Express + SQLite (`better-sqlite3`) API server for TaskFlow. The same schema and route
code run against a real, file-backed SQLite database in development and against a real,
ephemeral in-memory SQLite database in tests — so the test suite exercises actual SQL
(joins, `CHECK` constraints, foreign keys, cascading deletes) instead of a mocked data
layer.

This folder is the backend only. For the UI, see `../frontend/README.md`
(or the root `README.md` for the full project).

## Prerequisites

- Node.js 18+ and npm
- No database server to install — SQLite is embedded via `better-sqlite3`, which
  compiles/downloads a native binary during `npm install`

## Project structure

```
backend/
├── data/                    # SQLite file DB lives here at runtime (git-ignored)
│   └── taskflow.db          # created on first `npm run dev`
├── src/
│   ├── schema.sql           # single source of truth for the DB shape
│   ├── db.js                 # createDb(filePath) — file path or ':memory:'
│   ├── seed.js                # sample fixture data (2 projects, 7 tasks)
│   ├── app.js                  # createApp(db) — Express app wiring, DB-agnostic
│   ├── server.js               # entry point: opens the file DB, seeds it, binds a port
│   └── routes/
│       ├── tasks.js            # /api/tasks CRUD + /api/tasks/stats
│       └── projects.js         # /api/projects list/create
└── tests/
    ├── setup.js              # buildTestContext() — fresh in-memory DB + app per test
    ├── tasks.test.js         # Tasks API tests
    ├── projects.test.js      # Projects API tests
    └── edge-cases.test.js    # validation/edge-case tests
```

## Setup

```bash
npm install
```

## Running in development

```bash
npm run dev
```

- Starts the API on **http://localhost:3001** (override with `PORT=xxxx npm run dev`).
- On first run, if `data/taskflow.db` doesn't exist yet, it's created, `schema.sql` is
  applied, and the database is seeded with sample projects/tasks (`src/seed.js`).
- On later runs it reuses the existing file, so data persists across restarts.
- To reset to a clean seeded state, stop the server, delete the `data/` folder (or just
  the `taskflow.db*` files inside it), and run `npm run dev` again.

`npm start` does exactly the same thing as `npm run dev` (`node src/server.js`) — there's
no separate production build step for the backend.

## The db.js pattern

```js
function createDb(filePath = ':memory:') {
  const db = new Database(filePath);
  if (filePath !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}
```

- `server.js` calls `createDb('./data/taskflow.db')` — a real, persistent database.
- `tests/setup.js` calls `createDb(':memory:')` — an ephemeral, process-local database.

Both paths run through the exact same `schema.sql` and the exact same `app.js`/route
code, so nothing behaves differently between "real" usage and tests.

## Data model

- **projects**: `id`, `name` (unique, case-insensitive via `COLLATE NOCASE`), `created_at`
- **tasks**: `id`, `project_id` (FK → `projects`, `ON DELETE CASCADE`), `title`,
  `description`, `status` (`todo` | `in_progress` | `done`, `CHECK`-constrained),
  `priority` (`low` | `medium` | `high`, `CHECK`-constrained), `created_at`, `updated_at`

Full definition in `src/schema.sql`.

## API

All endpoints are prefixed with `/api` and return JSON.

| Method | Path            | Description                                                |
|--------|-----------------|-------------------------------------------------------------|
| GET    | `/health`       | Health check — `{ status: 'ok' }`                            |
| GET    | `/projects`     | List projects, each with a `task_count` (via `LEFT JOIN`)     |
| POST   | `/projects`     | Create a project — `{ name }`                                  |
| GET    | `/tasks`        | List tasks — optional `?status=` and `?project_id=` filters   |
| GET    | `/tasks/stats`  | Task counts grouped by status — `{ todo, in_progress, done }`  |
| GET    | `/tasks/:id`    | Get a single task                                                |
| POST   | `/tasks`        | Create a task — `{ project_id, title, description?, status?, priority? }` |
| PUT    | `/tasks/:id`    | Update a task (any of the same fields; validates a `project_id` change) |
| DELETE | `/tasks/:id`    | Delete a task                                                    |

Notable validation behavior (see `src/routes/`):
- Creating a task requires an existing `project_id` and a non-empty (post-trim) `title`.
- `status`/`priority` are validated against their allowed enum values on both create and
  update.
- Deleting a project cascades to delete its tasks (`ON DELETE CASCADE`).
- Duplicate project names are rejected case-insensitively and independent of leading/
  trailing whitespace.

## Running the tests

```bash
npm test
```

Runs the full Jest suite in-band (`jest --runInBand`):

```
PASS tests/edge-cases.test.js
PASS tests/tasks.test.js
PASS tests/projects.test.js

Test Suites: 3 passed, 3 total
Tests:       39 passed, 39 total
Time:        ~1.2 s
```

Each test gets a brand-new, fully isolated **in-memory** SQLite database, built from the
real `schema.sql` via `buildTestContext()` in `tests/setup.js`, wired into a real Express
app instance with `supertest`. Nothing is mocked — requests hit real routes, which run
real SQL against a real (if ephemeral) database — so the tests catch actual SQL errors,
constraint violations, and foreign-key behavior, not just whether a function was called.
No file on disk is touched, so running tests never affects `data/taskflow.db`.

**What's covered:**
- `tasks.test.js` — CRUD behavior for `/api/tasks`, project-existence validation on
  create, and the `/api/tasks/stats` aggregate endpoint.
- `projects.test.js` — creating and listing projects, including the per-project task
  count from the join.
- `edge-cases.test.js` — boundary conditions such as whitespace-only titles/names,
  empty-string edge cases, `project_id: 0` vs. missing, non-numeric/duplicate/padded
  input, status-casing mismatches, SQL-injection-style payloads and quote-containing
  text, cascading deletes, reassigning a task's project, duplicate-project-name
  rejection (exact/case-insensitive/padded), double-deletes, long titles, and Unicode/
  emoji round-tripping.

Other test scripts:

```bash
npm run test:watch      # re-run on file changes
npm run test:verbose    # verbose per-test output
```
