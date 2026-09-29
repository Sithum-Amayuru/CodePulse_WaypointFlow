const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/* ============================================================
   1. POSTGRESQL DATABASE CONNECTION
   ============================================================ */

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'waypoint_logistics_db',
    password: process.env.DB_PASSWORD || 'Admin1234',
    port: process.env.DB_PORT || 5432
});

pool.connect()
    .then(client => {
        console.log('✅ Connected to PostgreSQL Database successfully!');
        client.release();
    })
    .catch(err => {
        console.error('❌ Database connection error:', err.stack);
    });


/* ============================================================
   2. BASIC SERVER
   ============================================================ */

app.get('/', (req, res) => {
    res.send('Hello! Waypoint backend server is running with PostgreSQL.');
});


/* ============================================================
   3. DATABASE API ENDPOINTS
   ============================================================ */

/* ---------- Fleet ---------- */

app.get('/api/fleet', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM fleet'
        );

        res.json(result.rows);

    } catch (err) {
        console.error('Fleet error:', err.message);

        res.status(500).json({
            error: 'Database error'
        });
    }
});


/* ---------- Orders ---------- */

app.get('/api/orders', async (req, res) => {
  try {
    // 1. Fetch all orders
    const ordersResult = await pool.query(
      'SELECT * FROM orders ORDER BY id ASC'
    );

    const orders = ordersResult.rows;

    // 2. Fetch fleet metrics from database
    const fleetResult = await pool.query(`
      SELECT 
        COUNT(*) AS total_vehicles,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_vehicles,
        ROUND(AVG(fuel_percentage)) AS avg_fuel
      FROM fleet
    `);

    const fleetStats = fleetResult.rows[0];

    // 3. Return orders and KPI data as a JSON object
    res.json({
      ordersList: orders,
      activeVehicles: parseInt(fleetStats.active_vehicles, 10),
      totalVehicles: parseInt(fleetStats.total_vehicles, 10),
      fuelPercent: parseInt(fleetStats.avg_fuel, 10)
    });

  } catch (err) {
    console.error("Error fetching orders:", err);

    res.status(500).json({
      error: "Failed to fetch orders"
    });
  }
});

/* ---------- Create Order ---------- */

app.post('/api/orders', async (req, res) => {
    try {

        const {
            outlet,
            items,
            status
        } = req.body;

        const newOrder = await pool.query(
            `
            INSERT INTO orders
            (outlet, status)
            VALUES ($1, $2)
            RETURNING *
            `,
            [
                outlet,
                status || 'PENDING'
            ]
        );

        res.status(201).json({
            message: 'Order successfully saved to database!',
            order: newOrder.rows[0]
        });

    } catch (err) {

        console.error(
            'Order insertion error:',
            err.message
        );

        res.status(500).json({
            error: 'Database insertion error'
        });
    }
});


/* ---------- Update Order ---------- */

app.patch('/api/orders/:id', async (req, res) => {

    const client = await pool.connect();

    try {

        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                message: 'Status is required'
            });
        }

        /*
         * Start database transaction.
         *
         * The order update and fleet update will
         * either both succeed or both be rolled back.
         */

        await client.query('BEGIN');


        /*
         * 1. Update the order status.
         */

        const updateOrder = await client.query(
            `
            UPDATE orders
            SET status = $1
            WHERE id = $2
            RETURNING *
            `,
            [
                status,
                id
            ]
        );


        /*
         * Order does not exist.
         */

        if (updateOrder.rows.length === 0) {

            await client.query('ROLLBACK');

            return res.status(404).json({
                message: 'Order not found'
            });
        }


        /*
         * 2. If the order is DISPATCHED,
         *    allocate one ACTIVE vehicle.
         */

        let allocatedVehicle = null;

        if (status.toUpperCase() === 'DISPATCHED') {

            const fleetResult = await client.query(
                `
                UPDATE fleet
                SET status = 'BUSY'
                WHERE id = (
                    SELECT id
                    FROM fleet
                    WHERE status = 'ACTIVE'
                    ORDER BY id ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING *
                `
            );


            /*
             * No ACTIVE vehicle available.
             *
             * Roll back the order update as well,
             * because the dispatch cannot be completed
             * without a vehicle.
             */

            if (fleetResult.rows.length === 0) {

                await client.query('ROLLBACK');

                return res.status(409).json({

                    message:
                        'Order cannot be dispatched because no ACTIVE vehicle is available.',

                    order:
                        updateOrder.rows[0]

                });
            }


            allocatedVehicle =
                fleetResult.rows[0];

            console.log(
                `🚚 Vehicle ${allocatedVehicle.id} changed from ACTIVE to BUSY`
            );
        }


        /*
         * 3. Commit both database changes.
         */

        await client.query('COMMIT');


        /*
         * 4. Return the updated order and
         *    allocated vehicle information.
         *
         * The frontend can then call /api/orders
         * again to refresh the Fleet KPIs.
         */

        res.json({

            success: true,

            message:
                status.toUpperCase() === 'DISPATCHED'
                    ? 'Order dispatched and vehicle allocated successfully.'
                    : 'Order status updated successfully.',

            order:
                updateOrder.rows[0],

            allocatedVehicle:
                allocatedVehicle

        });

    } catch (err) {

        /*
         * Roll back any partially completed
         * database operation.
         */

        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error(
                'Rollback error:',
                rollbackError.message
            );
        }


        console.error(
            'Order update error:',
            err.message
        );


        res.status(500).json({
            error: 'Database update error'
        });

    } finally {

        /*
         * Always return the PostgreSQL
         * connection to the pool.
         */

        client.release();
    }
});
/* ============================================================
   4. SHARED TRIP STATE
   ============================================================ */

/*
 * IMPORTANT:
 *
 * This is the SINGLE SOURCE OF TRUTH for:
 *
 * Loader
 * Driver
 * Dispatcher
 *
 * The Loader changes "loaded".
 * The backend calculates the LIFO route.
 * The Driver only displays what the backend returns.
 */

let currentTrip = {

    id: 'KDY-04',

    routeNumber: 'Route-A1',

    vehicleNumber: 'WP-4820',

    driverName: 'Saman K.',

    title: 'Morning Dispatch',

    stops: [

        {
            id: 1,
            step: 1,
            name: 'Kandy Central Outlet',
            detail: '30 Crates (Ambient) | Pallet ID: #P-90',

            loaded: false,
            delivered: false,

            status: 'PENDING',

            loadedAt: null,
            deliveredAt: null
        },

        {
            id: 2,
            step: 2,
            name: 'Peradeniya Branch',
            detail: '20 Crates (Chilled) | Pallet ID: #P-89',

            loaded: false,
            delivered: false,

            status: 'PENDING',

            loadedAt: null,
            deliveredAt: null
        },

        {
            id: 3,
            step: 3,
            name: 'Matale City Outlet',
            detail: '15 Crates (Ambient) | Pallet ID: #P-88',

            loaded: false,
            delivered: false,

            status: 'PENDING',

            loadedAt: null,
            deliveredAt: null
        }

    ]
};


/* ============================================================
   5. LIFO ROUTE CALCULATION
   ============================================================ */

/*
 * Loading order:
 *
 * Kandy
 * Peradeniya
 * Matale
 *
 * Driver order:
 *
 * Matale
 * Peradeniya
 * Kandy
 *
 * Therefore loadedAt is used as the source
 * for determining LIFO sequence.
 */

function getLifoStops() {

    const stops = [...currentTrip.stops];

    /*
     * Loaded stops are ordered by loading time
     * in reverse order.
     *
     * Most recently loaded = first delivery.
     */

    const loadedStops = stops
        .filter(stop => stop.loaded)
        .sort((a, b) => {

            const aTime =
                a.loadedAt
                    ? new Date(a.loadedAt).getTime()
                    : 0;

            const bTime =
                b.loadedAt
                    ? new Date(b.loadedAt).getTime()
                    : 0;

            return bTime - aTime;
        });


    /*
     * Stops not yet loaded remain after loaded stops.
     */

    const unloadedStops = stops
        .filter(stop => !stop.loaded)
        .sort((a, b) => a.step - b.step);


    return [
        ...loadedStops,
        ...unloadedStops
    ];
}


/* ============================================================
   6. CALCULATE ACTIVE DRIVER STOP
   ============================================================ */

function updateTripStatuses() {

    /*
     * First reset statuses according to
     * their actual loading/delivery state.
     */

    currentTrip.stops.forEach(stop => {

        if (stop.delivered) {

            stop.status = 'DELIVERED';

            return;
        }

        if (!stop.loaded) {

            stop.status = 'PENDING';

            return;
        }

        stop.status = 'LOADED';
    });


    /*
     * Get the route using LIFO.
     */

    const lifoStops = getLifoStops();


    /*
     * First loaded + undelivered stop
     * becomes the active delivery.
     */

    const activeStop = lifoStops.find(
        stop =>
            stop.loaded &&
            !stop.delivered
    );


    if (activeStop) {
        activeStop.status = 'IN_PROGRESS';
    }
}


/* ============================================================
   7. GET ACTIVE TRIP
   ============================================================ */

app.get('/api/trip', (req, res) => {

    try {

        updateTripStatuses();

        const lifoStops = getLifoStops();

        /*
         * Return the LIFO sequence to the Driver.
         */

        res.json({

            ...currentTrip,

            stops: lifoStops

        });

    } catch (err) {

        console.error(
            'Trip fetch error:',
            err.message
        );

        res.status(500).json({
            message: 'Unable to load active trip'
        });
    }
});


/* ============================================================
   8. LOADER CONFIRM LOAD
   ============================================================ */

/*
 * NEW CANONICAL ENDPOINT:
 *
 * POST /api/loader/confirm/:id
 *
 * Example:
 *
 * POST /api/loader/confirm/3
 *
 * This is the ONLY endpoint the Loader should use
 * to confirm a stop.
 */

app.post('/api/loader/confirm/:id', (req, res) => {

    try {

        const stopId =
            Number(req.params.id);


        if (!Number.isInteger(stopId)) {

            return res.status(400).json({
                message: 'Invalid stop ID'
            });
        }


        const stop =
            currentTrip.stops.find(
                item => item.id === stopId
            );


        if (!stop) {

            return res.status(404).json({
                message: 'Stop not found'
            });
        }


        /*
         * Prevent duplicate loading.
         */

        if (stop.loaded) {

            updateTripStatuses();

            return res.status(409).json({

                message:
                    `Stop ${stopId} has already been loaded.`,

                stop,

                trip: {
                    ...currentTrip,
                    stops: getLifoStops()
                }

            });
        }


        /*
         * A stop cannot be loaded after
         * it has already been delivered.
         */

        if (stop.delivered) {

            return res.status(409).json({

                message:
                    'A delivered stop cannot be loaded again.'

            });
        }


        /*
         * Confirm loading.
         */

        stop.loaded = true;

        stop.loadedAt =
            new Date().toISOString();

        stop.status = 'LOADED';


        /*
         * Recalculate active stop.
         */

        updateTripStatuses();


        console.log(
            `📦 Loader confirmed Stop ${stop.id}: ${stop.name}`
        );


        const lifoStops =
            getLifoStops();


        res.json({

            success: true,

            message:
                `Stop ${stop.id} loaded successfully.`,

            stop,

            trip: {
                ...currentTrip,
                stops: lifoStops
            }

        });

    } catch (err) {

        console.error(
            'Loader confirmation error:',
            err.message
        );

        res.status(500).json({
            message: 'Failed to confirm loading'
        });
    }
});


/* ============================================================
   9. BACKWARD-COMPATIBILITY LOAD ENDPOINT
   ============================================================ */

/*
 * Old Loader code may still call:
 *
 * POST /api/trip/load/:step
 *
 * Keep this temporarily so old pages don't immediately break.
 *
 * It uses the SAME shared state and LIFO logic.
 *
 * New Loader code should use:
 *
 * POST /api/loader/confirm/:id
 */

app.post('/api/trip/load/:step', (req, res) => {

    const step =
        Number(req.params.step);


    const stop =
        currentTrip.stops.find(
            item => item.step === step
        );


    if (!stop) {

        return res.status(404).json({
            message: 'Stop not found'
        });
    }


    if (stop.loaded) {

        return res.status(409).json({
            message: 'Stop already loaded',
            stop
        });
    }


    stop.loaded = true;

    stop.loadedAt =
        new Date().toISOString();

    stop.status = 'LOADED';


    updateTripStatuses();


    res.json({

        success: true,

        message: 'Loaded successfully',

        stop,

        trip: {
            ...currentTrip,
            stops: getLifoStops()
        }

    });
});


/* ============================================================
   10. DRIVER DELIVERY / POD
   ============================================================ */

app.post('/api/trip/deliver/:id', (req, res) => {

    try {

        const id =
            Number(req.params.id);


        const stop =
            currentTrip.stops.find(
                item => item.id === id
            );


        if (!stop) {

            return res.status(404).json({
                message: 'Stop not found'
            });
        }


        /*
         * Driver cannot deliver an unloaded stop.
         */

        if (!stop.loaded) {

            return res.status(409).json({

                message:
                    'This stop has not been confirmed as loaded by the Loader.'

            });
        }


        /*
         * Prevent delivering a stop twice.
         */

        if (stop.delivered) {

            return res.status(409).json({

                message:
                    'This stop has already been delivered.'

            });
        }


        /*
         * Check that this is the active LIFO stop.
         */

        updateTripStatuses();


        const lifoStops =
            getLifoStops();


        const activeStop =
            lifoStops.find(
                item =>
                    item.loaded &&
                    !item.delivered
            );


        if (!activeStop) {

            return res.status(409).json({

                message:
                    'There is no active delivery stop.'

            });
        }


        if (activeStop.id !== id) {

            return res.status(409).json({

                message:
                    'This stop is not the active LIFO delivery stop.',

                activeStop

            });
        }


        /*
         * Confirm delivery.
         */

        stop.delivered = true;

        stop.deliveredAt =
            new Date().toISOString();

        stop.status = 'DELIVERED';


        /*
         * Automatically activate the next
         * LIFO stop.
         */

        updateTripStatuses();


        const updatedLifoStops =
            getLifoStops();


        console.log(
            `🚚 Stop ${stop.id} delivered: ${stop.name}`
        );


        res.json({

            success: true,

            message:
                'Delivery confirmed!',

            stop,

            trip: {
                ...currentTrip,
                stops: updatedLifoStops
            }

        });

    } catch (err) {

        console.error(
            'Delivery error:',
            err.message
        );

        res.status(500).json({

            message:
                'Failed to confirm delivery'

        });
    }
});


/* ============================================================
   11. ISSUE REPORT
   ============================================================ */

app.post('/api/trip/issue', (req, res) => {

    console.log(
        '⚠️ Issue reported by driver:',
        req.body
    );

    res.json({
        success: true,
        message: 'Issue reported to dispatcher.'
    });
});


/* ============================================================
   12. DAMAGE REPORT
   ============================================================ */

app.post('/api/damage-report', (req, res) => {

    console.log(
        '⚠️ Damage report:',
        req.body
    );

    res.json({
        success: true,
        message: 'Damage report submitted.'
    });
});


/* ============================================================
   13. BARCODE VERIFICATION
   ============================================================ */

app.post('/api/barcode/verify', (req, res) => {

    const {
        barcode,
        stopId
    } = req.body;


    if (!barcode) {

        return res.json({

            valid: false,

            message: 'Invalid barcode'

        });
    }


    /*
     * Hackathon verification.
     *
     * This endpoint does not change loading state.
     *
     * Loading is ONLY confirmed by:
     *
     * POST /api/loader/confirm/:id
     */

    res.json({

        valid: true,

        stopId: stopId || null,

        message:
            `Barcode ${barcode} matched with manifest.`

    });
});


/* ============================================================
   14. STORE MANAGER ENDPOINTS
   ============================================================ */

app.get('/api/store-manager', (req, res) => {

    res.json({

        outlet: {
            id: 42,
            name: 'Outlet #042 - Kandy City'
        },

        cutoffTime: '4:00 PM',

        remainingTime: '01h 24m'

    });
});


app.get('/api/products', (req, res) => {

    res.json([

        {
            id: 1,
            name: 'Canned Goods Pallets',
            defaultQuantity: 50,
            category: 'Ambient'
        },

        {
            id: 2,
            name: 'Dry Grocery Pallets',
            defaultQuantity: 20,
            category: 'Ambient'
        }

    ]);
});


app.post('/api/cart/items', (req, res) => {

    res.json({
        message: 'Added to cart'
    });
});


app.get('/api/orders/current', (req, res) => {

    res.json({

        orderNumber: 'ORD-992',

        status: 'PENDING',

        eta: 'Today, 3:00 PM',

        truck: 'WP-4820',

        items: [
            {
                name: 'Canned Goods',
                quantity: 50
            }
        ]

    });
});


app.post('/api/orders/submit', (req, res) => {

    res.json({
        message: 'Order submitted to backend'
    });
});


app.get('/api/deliveries/current', (req, res) => {

    res.json({

        id: 'DEL-101',

        orderNumber: 'ORD-991',

        vehicle: 'WP-4820',

        driver: 'Saman K.',

        items: [

            {
                id: 1,
                name: 'Canned Goods',
                orderedQuantity: 50,
                receivedQuantity: 50,
                damaged: false
            }

        ]

    });
});


app.post('/api/deliveries/:id/confirm', (req, res) => {

    res.json({
        message: 'Delivery inspected and confirmed'
    });
});


app.post('/api/deliveries/photo', (req, res) => {

    res.json({

        success: true,

        fileUrl: '/mock-url.jpg'

    });
});


/* ============================================================
   15. START SERVER
   ============================================================ */

app.listen(PORT, () => {

    console.log(
        `🚀 Backend Server is running on http://localhost:${PORT}`
    );

});