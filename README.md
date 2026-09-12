# TaskFlow — SQLite-Powered API Testing Demo

A small, real, working full-stack app (React + Express + SQLite) built to demo one idea:

> **Stop mocking your database. Use real SQLite instead — file-backed in production, in-memory in tests.**

This isn't a toy. `npm test` spins up 14 real end-to-end tests, each against a fresh,
fully-isolated, real SQL database, in about **one second**, with **zero setup/teardown code**.

```
Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total
Time:        1.1 s
```

---

## Why this pattern

| | Mocked DB layer | SQLite (`:memory:`) |
|---|---|---|
| Speed | Fast | Fast (comparable — no network, no disk) |
| Real SQL (JOINs, constraints, CHECK, FK cascade) | ❌ hand-simulated | ✅ actually executed |
| CI/CD complexity | Low, but false confidence | Low — no container, no service, no wait-for-it script |
| Catches real bugs | Only bugs the mock author anticipated | Anything the SQL engine catches |
| Test isolation | Manual | Free — the whole DB is a JS object, GC'd on close |

The core trick is one factory function:

```js
// backend/src/db.js
function createDb(filePath = ':memory:') {
  const db = new Database(filePath);   // better-sqlite3
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}
```

Production calls `createDb('./data/taskflow.db')`. Tests call `createDb(':memory:')`.
**Same schema, same code path, same SQL** — the only thing that changes is where the
bytes live.

---

## Project structure

```
taskflow-demo/
├── backend/
│   ├── src/
│   │   ├── schema.sql       ← single source of truth for the DB shape
│   │   ├── db.js            ← the createDb() factory (the whole talk in one file)
│   │   ├── seed.js          ← realistic fixture data, shared by dev + tests
│   │   ├── app.js            ← createApp(db) — Express wiring, DB-agnostic
│   │   ├── server.js         ← the ONLY place a file DB + port binding happens
│   │   └── routes/
│   │       ├── tasks.js
│   │       └── projects.js
│   └── tests/
│       ├── setup.js          ← buildTestContext() — fresh in-memory DB per test
│       ├── tasks.test.js
│       └── projects.test.js
└── frontend/
    └── src/                  ← React + Vite Kanban board UI
```

---

## Running it

**Backend**
```bash
cd backend
npm install
npm test        # 14 tests, ~1s, real SQLite under the hood
npm run dev      # starts the API on :3001, seeds ./data/taskflow.db on first run
```

**Frontend**
```bash
cd frontend
npm install
npm run dev      # starts on :5173, proxies /api to :3001
```

Open `http://localhost:5173`. The header bar under the nav shows the **live SQL query**
behind whatever you're looking at — a deliberate reminder that this UI is backed by a
real, inspectable database, not a black box.

---

## Talk narrative / live-coding script

This app is deliberately structured so you can walk through it top-to-bottom on stage.

### 1. Open with the pain (2 min)
Show a typical mocked-repository test:
```js
jest.mock('../db', () => ({
  query: jest.fn().mockResolvedValue([{ id: 1, status: 'done' }]),
}));
```
Ask the room: *"What does this test actually verify?"* Answer: that your code calls
`query()` with *something*. It says nothing about whether your SQL is even valid.

### 2. Introduce the fix (3 min)
Show `backend/src/db.js`. One function, one parameter (`:memory:` vs a file path).
Show `backend/src/schema.sql` — this is the *only* schema definition in the whole
project. Tests and production both run through it.

### 3. Show the bug it actually caught (this is the money moment — it's real, not staged)
While building this demo, this line shipped:
```js
query += ' ORDER BY priority = "high" DESC, created_at DESC';
```
It passed a code review. It looked fine. `npm test` failed immediately:
```
SqliteError: no such column: "high" - should this be a string literal in single-quotes?
```
SQLite treats double-quoted strings as *identifiers*, not literals — a classic gotcha.
A mocked `db.query()` returning canned JSON would **never** have caught this, because
the mock doesn't know what valid SQL looks like. Real SQLite does. That's the pitch,
proven live instead of asserted.

### 4. Walk `tests/setup.js` and `tests/tasks.test.js` (5 min)
- `buildTestContext()` — a fresh DB is one function call away
- `beforeEach` / `afterEach` — no manual `TRUNCATE`, no ordering dependencies
- Point out the cascading-delete test — real foreign key behavior, asserted with
  a raw SQL query, not an API call. Tests can drop to raw SQL whenever it's the
  most direct way to assert something.

### 5. Scale it up (3 min)
Talk through what changes at scale:
- **Seed once, reuse a snapshot** for read-heavy suites (`db.serialize()` /
  `db.backup()` with better-sqlite3, or just re-run `seed()` — it's fast enough)
- **Parallel test files** are naturally isolated — each file's `:memory:` DB is a
  separate process-local object, no shared state to worry about
- **CI** needs nothing extra: no `docker-compose up`, no health-check polling loop,
  no service container. `npm test` is the whole pipeline step.
- Where this pattern *stops* being enough: DB-specific features (window functions,
  JSON functions, extensions) that differ between SQLite and your production engine
  (Postgres/MySQL). Call this out explicitly — it's a real trade-off, not a silver
  bullet. Mitigation: keep schema/SQL portable, or run a small number of true
  integration tests against the real engine in CI as a backstop.

### 6. Live demo the UI (2 min)
Switch to the running app. Click between projects in the sidebar — point at the
**Live Query** bar updating with the real SQL and param list. Create a task with an
invalid project — show the 400 coming from a real FK-style check in the route,
verified by a test (`tests/tasks.test.js` → "rejects a task with a non-existent
project_id").

### Closing line
*"The tests you write should run the same SQL your users' requests will run. SQLite
in-memory is the cheapest way to make that true — cheaper than mocks, and it tells
you the truth."*

---

## Notes on the seed data

`backend/src/seed.js` creates 2 projects and 7 tasks (3 todo, 2 in_progress, 2 done) —
these exact numbers are asserted in `tests/tasks.test.js` (`GET /api/tasks/stats`), so
if you tweak the seed data for the demo, update that test too (or better: use it as a
live example of a test breaking for the *right* reason).
