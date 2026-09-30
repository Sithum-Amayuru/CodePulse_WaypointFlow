const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const Database = require('better-sqlite3');
const { runAllocation } = require('./allocation');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---- Database Setup ----
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'waypoint.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS stops (
    step INTEGER PRIMARY KEY,
    name TEXT,
    detail TEXT,
    loaded INTEGER DEFAULT 0,
    delivered INTEGER DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS trip_info (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tripId TEXT,
    vehicleId TEXT,
    driver TEXT
  )
`);

const stopCount = db.prepare('SELECT COUNT(*) as count FROM stops').get();
if (stopCount.count === 0) {
  db.prepare(
    'INSERT INTO trip_info (id, tripId, vehicleId, driver) VALUES (1, ?, ?, ?)'
  ).run('KDY-04', 'WP-4820', 'Saman K.');

  const insertStop = db.prepare(
    'INSERT INTO stops (step, name, detail, loaded, delivered) VALUES (?, ?, ?, 0, 0)'
  );
  insertStop.run(1, 'Kandy Central Outlet', '30 Crates (Ambient) | Pallet ID: #P-90');
  insertStop.run(2, 'Peradeniya Branch', '20 Crates (Chilled) | Pallet ID: #P-89');
  insertStop.run(3, 'Matale City Outlet', '15 Crates (Ambient) | Pallet ID: #P-88');

  console.log('Database seeded with initial trip data.');
}

function getTrip() {
  const info = db.prepare('SELECT * FROM trip_info WHERE id = 1').get();
  const stops = db.prepare('SELECT * FROM stops ORDER BY step').all().map((s) => ({
    step: s.step,
    name: s.name,
    detail: s.detail,
    loaded: !!s.loaded,
    delivered: !!s.delivered,
  }));
  return { tripId: info.tripId, vehicleId: info.vehicleId, driver: info.driver, stops };
}

// ---- CSV Helper ----
function readCSV(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return parse(fileContent, { columns: true, skip_empty_lines: true, bom: true });
}

// ---- Serve the built frontend (only when it exists, e.g. inside Docker) ----
const publicDir = path.join(__dirname, 'public');
const hasFrontend = fs.existsSync(path.join(publicDir, 'index.html'));
if (hasFrontend) {
  app.use(express.static(publicDir));
}

// ---- Basic Routes ----
if (!hasFrontend) {
  app.get('/', (req, res) => {
    res.send('Hello! Waypoint backend server is running.');
  });
}

app.get('/api/outlets', (req, res) => {
  res.json(readCSV('outlets.csv'));
});

app.get('/api/vehicles', (req, res) => {
  res.json(readCSV('vehicles.csv'));
});

// ---- Trip Routes ----
app.get('/api/trip', (req, res) => {
  res.json(getTrip());
});

app.post('/api/trip/load/:step', (req, res) => {
  const step = Number(req.params.step);
  db.prepare('UPDATE stops SET loaded = 1 WHERE step = ?').run(step);
  res.json(getTrip());
});

app.post('/api/trip/deliver/:step', (req, res) => {
  const step = Number(req.params.step);
  db.prepare('UPDATE stops SET delivered = 1 WHERE step = ?').run(step);
  res.json(getTrip());
});

// ---- Allocation Engine ----
function computeAllocation() {
  return runAllocation({
    orders: readCSV('task2b_peak_day_scenarios.csv'),
    fleet: readCSV('task2b_peak_day_fleet.csv'),
    vehicles: readCSV('vehicles.csv'),
    travel: readCSV('district_travel.csv'),
    allowance: readCSV('service_allowance.csv'),
  });
}

// One row per order: served (vehicle + trip) or deferred (with reason)
app.get('/api/allocate', (req, res) => {
  try {
    res.json(computeAllocation().allocations);
  } catch (err) {
    console.error('Allocation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Summary numbers and the list of trips built by the engine
app.get('/api/allocate/trips', (req, res) => {
  try {
    const { summary, trips } = computeAllocation();
    res.json({ summary, trips });
  } catch (err) {
    console.error('Allocation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- Frontend fallback: any other page (e.g. /dispatcher) opens the app ----
if (hasFrontend) {
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});