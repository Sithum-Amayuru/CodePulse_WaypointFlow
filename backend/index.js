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

// Orders: column names match the competition CSV so the allocation engine can read them directly
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    order_ref TEXT PRIMARY KEY,
    outlet_id TEXT,
    brand TEXT,
    district TEXT,
    depot TEXT,
    dock_type TEXT,
    parking_constraint TEXT,
    window_close_time TEXT,
    temp_requirement TEXT,
    order_weight_kg REAL,
    order_volume_m3 REAL,
    deferred_yesterday REAL DEFAULT 0,
    days_since_last_served REAL DEFAULT 0,
    source TEXT,
    status TEXT,
    vehicle_id TEXT,
    trip_id INTEGER,
    reason TEXT,
    received_condition TEXT,
    created_at TEXT,
    updated_at TEXT
  )
`);

// Older databases do not have the items column yet: add it (ignored if it already exists)
try {
  db.exec('ALTER TABLE orders ADD COLUMN items TEXT');
} catch (e) {
  // column already exists
}

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

// ---- Seed the orders table from the peak-day scenario CSV (only the first time) ----
try {
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get();
  if (orderCount.count === 0) {
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        order_ref, outlet_id, brand, district, depot, dock_type, parking_constraint,
        window_close_time, temp_requirement, order_weight_kg, order_volume_m3,
        deferred_yesterday, days_since_last_served, source, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'csv','PENDING',?,?)
    `);
    const now = new Date().toISOString();
    const seedOrders = db.transaction((rows) => {
      for (const r of rows) {
        insertOrder.run(
          r.order_ref,
          r.outlet_id,
          r.brand,
          r.district,
          r.depot,
          r.dock_type,
          r.parking_constraint,
          r.window_close_time,
          r.temp_requirement,
          Number(r.order_weight_kg),
          Number(r.order_volume_m3),
          Number(r.deferred_yesterday) || 0,
          Number(r.days_since_last_served) || 0,
          now,
          now
        );
      }
    });
    const rows = readCSV('task2b_peak_day_scenarios.csv');
    seedOrders(rows);
    console.log(`Orders table seeded with ${rows.length} orders (status PENDING).`);
  }
} catch (err) {
  console.error('Could not seed orders:', err.message);
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

// ---- Demo Trip Routes (used by the old Dispatcher "Live Trip" panel) ----
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

// ---- Allocation Engine (whole-CSV batch view, kept as it was) ----
function engineInputs() {
  return {
    fleet: readCSV('task2b_peak_day_fleet.csv'),
    vehicles: readCSV('vehicles.csv'),
    travel: readCSV('district_travel.csv'),
    allowance: readCSV('service_allowance.csv'),
  };
}

function computeAllocation() {
  return runAllocation({
    orders: readCSV('task2b_peak_day_scenarios.csv'),
    ...engineInputs(),
  });
}

app.get('/api/allocate', (req, res) => {
  try {
    res.json(computeAllocation().allocations);
  } catch (err) {
    console.error('Allocation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/allocate/trips', (req, res) => {
  try {
    const { summary, trips } = computeAllocation();
    res.json({ summary, trips });
  } catch (err) {
    console.error('Allocation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  ORDER WORKFLOW
//  Store Manager submits -> Dispatcher (Auto-Allocate / Assign / Defer)
//  -> Loader loads -> Driver delivers -> Store Manager receives
// ============================================================

function safeParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function orderToJson(r) {
  return {
    orderId: r.order_ref,
    outletId: r.outlet_id,
    destination: `${r.outlet_id} (${r.district})`,
    brand: r.brand,
    district: r.district,
    depot: r.depot,
    temp: r.temp_requirement,
    weightKg: r.order_weight_kg,
    volumeM3: r.order_volume_m3,
    status: r.status,
    vehicleId: r.vehicle_id,
    tripId: r.trip_id,
    reason: r.reason,
    source: r.source,
    items: safeParse(r.items),
    receipt: safeParse(r.received_condition),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function getOrder(ref) {
  return db.prepare('SELECT * FROM orders WHERE order_ref = ?').get(ref);
}

function listOrders(whereSql = '', params = []) {
  return db
    .prepare(`SELECT * FROM orders ${whereSql}`)
    .all(...params)
    .map(orderToJson);
}

// Move one order to a new status, but only if it is in an allowed current status
function moveOrder(res, ref, allowedFrom, toStatus, extra = {}) {
  const row = getOrder(ref);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  if (!allowedFrom.includes(row.status)) {
    return res
      .status(409)
      .json({ error: `Order is ${row.status}. Expected: ${allowedFrom.join(' or ')}` });
  }
  const fields = { status: toStatus, updated_at: new Date().toISOString(), ...extra };
  const sets = Object.keys(fields)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  db.prepare(`UPDATE orders SET ${sets} WHERE order_ref = @order_ref`).run({
    ...fields,
    order_ref: ref,
  });
  return res.json(orderToJson(getOrder(ref)));
}

// Run the real allocation engine over every order that is not deferred,
// then save the result for the given orders only.
function runAutoAllocate(refs) {
  const rows = db.prepare("SELECT * FROM orders WHERE status != 'DEFERRED' ORDER BY rowid").all();
  const { allocations } = runAllocation({ orders: rows, ...engineInputs() });
  const byRef = new Map(allocations.map((a) => [a.orderId, a]));
  const now = new Date().toISOString();

  const update = db.prepare(`
    UPDATE orders
    SET status = @status, vehicle_id = @vehicle_id, trip_id = @trip_id,
        reason = @reason, updated_at = @updated_at
    WHERE order_ref = @order_ref
  `);

  const apply = db.transaction(() => {
    for (const ref of refs) {
      const a = byRef.get(ref);
      if (!a) continue;
      if (a.decision === 'served') {
        update.run({
          status: 'ALLOCATED',
          vehicle_id: a.vehicleId,
          trip_id: a.tripId,
          reason: null,
          updated_at: now,
          order_ref: ref,
        });
      } else {
        update.run({
          status: 'OVER_CAPACITY',
          vehicle_id: null,
          trip_id: null,
          reason: a.reason,
          updated_at: now,
          order_ref: ref,
        });
      }
    }
  });
  apply();
}

// All orders (Dispatcher and Store Manager tables)
app.get('/api/orders', (req, res) => {
  res.json(listOrders('ORDER BY rowid'));
});

// Outlets a Store Manager can order for (one row per outlet, same row the order template uses)
app.get('/api/outlet-options', (req, res) => {
  const rows = db
    .prepare(
      `SELECT outlet_id, brand, district FROM orders
       WHERE rowid IN (SELECT MIN(rowid) FROM orders GROUP BY outlet_id)
       ORDER BY outlet_id`
    )
    .all();
  res.json(rows.map((r) => ({ outletId: r.outlet_id, brand: r.brand, district: r.district })));
});

// Store Manager: submit a new daily order (from the cart items, or a plain weight and volume)
app.post('/api/orders', (req, res) => {
  try {
    const { outletId, temp, items } = req.body || {};
    let weight = Number(req.body && req.body.weightKg);
    let volume = Number(req.body && req.body.volumeM3);
    let itemsJson = null;

    if (Array.isArray(items) && items.length > 0) {
      let w = 0;
      let v = 0;
      const clean = [];
      for (const it of items.slice(0, 50)) {
        const qty = Math.floor(Number(it.qty));
        const uw = Number(it.unitWeightKg);
        const uv = Number(it.unitVolumeM3);
        if (!it.name || !(qty >= 1 && qty <= 1000) || !(uw > 0) || !(uv > 0)) {
          return res
            .status(400)
            .json({ error: 'Each item needs a name, a quantity (1-1000) and unit sizes.' });
        }
        w += qty * uw;
        v += qty * uv;
        clean.push({
          name: String(it.name).slice(0, 80),
          qty,
          unitWeightKg: uw,
          unitVolumeM3: uv,
        });
      }
      weight = Math.round(w * 100) / 100;
      volume = Math.round(v * 1000) / 1000;
      itemsJson = JSON.stringify(clean);
    }

    if (!outletId) return res.status(400).json({ error: 'Please choose an outlet.' });
    if (!['ambient', 'chilled'].includes(temp)) {
      return res.status(400).json({ error: 'Temperature must be ambient or chilled.' });
    }
    if (!(weight > 0 && weight <= 50000)) {
      return res.status(400).json({ error: 'Total weight must be between 0 and 50,000 kg.' });
    }
    if (!(volume > 0 && volume <= 500)) {
      return res.status(400).json({ error: 'Total volume must be between 0 and 500 m3.' });
    }

    // Outlet details (district, depot, dock, parking) come from the known outlet rows
    const template = db
      .prepare('SELECT * FROM orders WHERE outlet_id = ? ORDER BY rowid LIMIT 1')
      .get(outletId);
    if (!template) return res.status(400).json({ error: 'Unknown outlet.' });

    // Make sure the allocation engine will have the data it needs for this order
    const travel = readCSV('district_travel.csv');
    const allowance = readCSV('service_allowance.csv');
    if (!travel.some((r) => r.district === template.district)) {
      return res.status(400).json({ error: `No travel data for district ${template.district}.` });
    }
    if (!allowance.some((r) => r.brand === template.brand && r.dock_type === template.dock_type)) {
      return res.status(400).json({ error: 'No service allowance data for this outlet.' });
    }

    // Create a unique order id like ORD-9001
    let n = db.prepare("SELECT COUNT(*) as c FROM orders WHERE source = 'store'").get().c + 1;
    let ref = `ORD-${9000 + n}`;
    while (getOrder(ref)) {
      n += 1;
      ref = `ORD-${9000 + n}`;
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO orders (
        order_ref, outlet_id, brand, district, depot, dock_type, parking_constraint,
        window_close_time, temp_requirement, order_weight_kg, order_volume_m3,
        deferred_yesterday, days_since_last_served, source, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,'store','PENDING',?,?)
    `).run(
      ref,
      template.outlet_id,
      template.brand,
      template.district,
      template.depot,
      template.dock_type,
      template.parking_constraint,
      template.window_close_time,
      temp,
      weight,
      volume,
      now,
      now
    );
    if (itemsJson) {
      db.prepare('UPDATE orders SET items = ? WHERE order_ref = ?').run(itemsJson, ref);
    }

    res.status(201).json(orderToJson(getOrder(ref)));
  } catch (err) {
    console.error('Create order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Dispatcher: Auto-Allocate every pending order
app.post('/api/orders/auto-allocate-all', (req, res) => {
  try {
    const refs = db
      .prepare("SELECT order_ref FROM orders WHERE status = 'PENDING'")
      .all()
      .map((r) => r.order_ref);
    runAutoAllocate(refs);
    res.json(listOrders('ORDER BY rowid'));
  } catch (err) {
    console.error('Auto-allocate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Dispatcher: Auto-Allocate one order
app.post('/api/orders/:ref/auto-allocate', (req, res) => {
  try {
    const row = getOrder(req.params.ref);
    if (!row) return res.status(404).json({ error: 'Order not found' });
    if (!['PENDING', 'OVER_CAPACITY', 'ALLOCATED'].includes(row.status)) {
      return res.status(409).json({ error: `Order is already ${row.status}.` });
    }
    runAutoAllocate([row.order_ref]);
    res.json(orderToJson(getOrder(row.order_ref)));
  } catch (err) {
    console.error('Auto-allocate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Dispatcher: Assign (confirm the allocation, the Loader now gets this job)
app.post('/api/orders/:ref/assign', (req, res) => {
  moveOrder(res, req.params.ref, ['ALLOCATED'], 'ASSIGNED');
});

// Dispatcher: Defer Order
app.post('/api/orders/:ref/defer', (req, res) => {
  const row = getOrder(req.params.ref);
  const reason = (row && row.reason) || 'Deferred by dispatcher';
  moveOrder(res, req.params.ref, ['PENDING', 'ALLOCATED', 'OVER_CAPACITY'], 'DEFERRED', {
    vehicle_id: null,
    trip_id: null,
    reason,
  });
});

// Loader: jobs appear only after the Dispatcher has assigned them
app.get('/api/loader/jobs', (req, res) => {
  res.json(
    listOrders("WHERE status IN ('ASSIGNED','LOADED') ORDER BY vehicle_id, trip_id, rowid")
  );
});

app.post('/api/orders/:ref/load', (req, res) => {
  moveOrder(res, req.params.ref, ['ASSIGNED'], 'LOADED');
});

// Driver: loaded orders to deliver
app.get('/api/driver/jobs', (req, res) => {
  res.json(
    listOrders(
      "WHERE status IN ('LOADED','DELIVERED','RECEIVED') ORDER BY vehicle_id, trip_id, rowid"
    )
  );
});

app.post('/api/orders/:ref/deliver', (req, res) => {
  moveOrder(res, req.params.ref, ['LOADED'], 'DELIVERED');
});

// Store Manager: confirm receipt (received quantities and condition are saved as a receipt)
app.post('/api/orders/:ref/receive', (req, res) => {
  const body = req.body || {};
  const condition = body.condition === 'damaged' ? 'damaged' : 'good';
  const items = Array.isArray(body.items)
    ? body.items.slice(0, 50).map((i) => ({
        name: String(i.name || '').slice(0, 80),
        ordered: Number(i.ordered) || 0,
        received: Number(i.received) || 0,
        condition: i.condition === 'damaged' ? 'damaged' : 'good',
      }))
    : [];
  const receipt = JSON.stringify({ condition, items, at: new Date().toISOString() });
  moveOrder(res, req.params.ref, ['DELIVERED'], 'RECEIVED', { received_condition: receipt });
});

// ---- Demo reset: everything goes back to the starting state ----
app.post('/api/demo/reset', (req, res) => {
  try {
    const now = new Date().toISOString();
    const reset = db.transaction(() => {
      db.prepare("DELETE FROM orders WHERE source = 'store'").run();
      db.prepare(`
        UPDATE orders
        SET status = 'PENDING', vehicle_id = NULL, trip_id = NULL, reason = NULL,
            received_condition = NULL, updated_at = ?
      `).run(now);
      db.prepare('UPDATE stops SET loaded = 0, delivered = 0').run();
    });
    reset();
    res.json({ ok: true });
  } catch (err) {
    console.error('Reset error:', err.message);
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