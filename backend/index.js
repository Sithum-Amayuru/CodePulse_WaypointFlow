const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ---- Database Setup ----
const db = new Database(path.join(__dirname, 'waypoint.db'));

// Create tables if they don't exist
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

// Seed initial data only if tables are empty
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

// Helper: get full trip object (mimics old in-memory shape)
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
  return parse(fileContent, { columns: true, skip_empty_lines: true });
}

// ---- Basic Routes ----
app.get('/', (req, res) => {
  res.send('Hello! Waypoint backend server is running.');
});

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

// Sample orders for testing the allocation engine
const sampleOrders = [
  { orderId: 'ORD-9021', destination: 'Kandy Outlet', weightKg: 1200, volumeM3: 3.5, tempRequirement: 'ambient', brand: 'Fresh', depot: 'Peliyagoda' },
  { orderId: 'ORD-9022', destination: 'Galle Outlet', weightKg: 2400, volumeM3: 8.0, tempRequirement: 'chilled', brand: 'Fresh', depot: 'Peliyagoda' },
  { orderId: 'ORD-9023', destination: 'Jaffna Outlet', weightKg: 1800, volumeM3: 5.0, tempRequirement: 'ambient', brand: 'Style', depot: 'Peliyagoda' },
];

app.get('/api/allocate', (req, res) => {
  const vehicles = readCSV('vehicles.csv');
  const results = [];

  // Track how much capacity each vehicle has already used up
  const vehicleUsage = {}; // { vehicleId: { weightUsed, volumeUsed } }

  for (const order of sampleOrders) {
    // Find an eligible vehicle: matches depot, has REMAINING capacity, has correct temp capability
    const eligibleVehicle = vehicles.find((v) => {
      const depotMatch = v.depot === order.depot;
      const tempOk = order.tempRequirement === 'chilled' ? v.temp === 'reefer' : true;

      const used = vehicleUsage[v.vehicle_id] || { weightUsed: 0, volumeUsed: 0 };
      const weightOk = Number(v.weight_cap_kg) - used.weightUsed >= order.weightKg;
      const volumeOk = Number(v.volume_cap_m3) - used.volumeUsed >= order.volumeM3;

      return depotMatch && tempOk && weightOk && volumeOk;
    });

    if (eligibleVehicle) {
      // Record this order's weight/volume against the vehicle so future orders see reduced capacity
      const used = vehicleUsage[eligibleVehicle.vehicle_id] || { weightUsed: 0, volumeUsed: 0 };
      vehicleUsage[eligibleVehicle.vehicle_id] = {
        weightUsed: used.weightUsed + order.weightKg,
        volumeUsed: used.volumeUsed + order.volumeM3,
      };

      results.push({
        orderId: order.orderId,
        destination: order.destination,
        decision: 'served',
        vehicleId: eligibleVehicle.vehicle_id,
        reason: null,
      });
    } else {
      let reason = 'No vehicle with sufficient remaining capacity';
      if (order.tempRequirement === 'chilled') {
        const anyReefer = vehicles.some((v) => v.depot === order.depot && v.temp === 'reefer');
        if (!anyReefer) reason = 'No refrigerated vehicle available at this depot';
      }
      results.push({
        orderId: order.orderId,
        destination: order.destination,
        decision: 'deferred',
        vehicleId: null,
        reason,
      });
    }
  }

  res.json(results);
});
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});