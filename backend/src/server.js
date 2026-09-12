const path = require('path');
const fs = require('fs');
const { createDb } = require('./db');
const { seed } = require('./seed');
const { createApp } = require('./app');

const DB_PATH = path.join(__dirname, '..', 'data', 'taskflow.db');
const PORT = process.env.PORT || 3001;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const isFreshDb = !fs.existsSync(DB_PATH);
const db = createDb(DB_PATH);

if (isFreshDb) {
  console.log('Fresh database detected - seeding sample data...');
  seed(db);
}

const app = createApp(db);

app.listen(PORT, () => {
  console.log(`TaskFlow API listening on http://localhost:${PORT}`);
  console.log(`Database file: ${DB_PATH}`);
});
