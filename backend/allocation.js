// Allocation engine for the Waypoint peak-day scenario.
// Rules follow the Task 2B feasibility rules in the challenge booklet.

const BUDGET_MIN = { fresh: 270, styleTech: 480 };
const MAX_TRIPS_PER_VEHICLE = 2;
const EPSILON = 1e-9;

const toNumber = (value) => Number(value);
const categoryOf = (order) => (order.brand === 'Fresh' ? 'fresh' : 'styleTech');
const round2 = (x) => Math.round(x * 100) / 100;

function normalizeOrder(row) {
  return {
    orderRef: row.order_ref,
    outletId: row.outlet_id,
    brand: row.brand,
    district: row.district,
    depot: row.depot,
    dockType: row.dock_type,
    parking: row.parking_constraint,
    windowClose: row.window_close_time,
    temp: row.temp_requirement,
    weightKg: toNumber(row.order_weight_kg),
    volumeM3: toNumber(row.order_volume_m3),
    deferredYesterday: toNumber(row.deferred_yesterday),
    daysSinceServed: toNumber(row.days_since_last_served),
  };
}

function normalizeVehicle(row) {
  return {
    vehicleId: row.vehicle_id,
    type: row.type,
    temp: row.temp,
    weightCap: toNumber(row.weight_cap_kg),
    volumeCap: toNumber(row.volume_cap_m3),
    depot: row.depot,
    trips: [],
  };
}

function buildLookups(travelRows, allowanceRows) {
  const travel = {};
  for (const r of travelRows) {
    travel[r.district] = {
      outbound: toNumber(r.depot_to_district_freeflow_min),
      interStop: toNumber(r.inter_stop_freeflow_min),
    };
  }
  const allowance = {};
  for (const r of allowanceRows) {
    allowance[`${r.brand}|${r.dock_type}`] = toNumber(r.service_allowance_min);
  }
  return { travel, allowance };
}

// trip_minutes = outbound travel + inter-stop travel + handling time
function tripMinutes(orders, lookups) {
  const t = lookups.travel[orders[0].district];
  let handling = 0;
  for (const o of orders) handling += lookups.allowance[`${o.brand}|${o.dockType}`];
  return t.outbound + t.interStop * (orders.length - 1) + handling;
}

// Depot, refrigeration and outlet-access rules
function vehicleAllows(vehicle, order) {
  if (vehicle.depot !== order.depot) return false;
  if (order.temp === 'chilled' && vehicle.temp !== 'reefer') return false;
  if (order.parking === 'van_only' && vehicle.type !== 'van') return false;
  return true;
}

// Minutes this vehicle has already used in a budget category (ignoring one trip)
function minutesUsed(vehicle, category, excludeTrip, lookups) {
  let sum = 0;
  for (const trip of vehicle.trips) {
    if (trip === excludeTrip) continue;
    if (categoryOf(trip.orders[0]) === category) sum += tripMinutes(trip.orders, lookups);
  }
  return sum;
}

// Capacity and time-budget rules
function fitsInTrip(vehicle, trip, order, lookups) {
  const orders = [...trip.orders, order];
  const weight = orders.reduce((s, o) => s + o.weightKg, 0);
  const volume = orders.reduce((s, o) => s + o.volumeM3, 0);
  if (weight > vehicle.weightCap + EPSILON || volume > vehicle.volumeCap + EPSILON) return false;
  const category = categoryOf(order);
  const minutes = tripMinutes(orders, lookups);
  return minutesUsed(vehicle, category, trip, lookups) + minutes <= BUDGET_MIN[category];
}

// Keep vans and reefers free for orders that really need them
function vehicleCost(vehicle, order) {
  let cost = 0;
  if (vehicle.type === 'van' && order.parking !== 'van_only') cost += 1000;
  if (vehicle.temp === 'reefer' && order.temp !== 'chilled') cost += 100;
  cost -= vehicle.weightCap / 1000; // prefer larger vehicles so trips consolidate
  return cost;
}

// Priority: skipped yesterday, longest unserved, Fresh first, earliest window close
function compareByPriority(a, b) {
  return (
    b.deferredYesterday - a.deferredYesterday ||
    b.daysSinceServed - a.daysSinceServed ||
    (a.brand === 'Fresh' ? 0 : 1) - (b.brand === 'Fresh' ? 0 : 1) ||
    a.windowClose.localeCompare(b.windowClose) ||
    b.weightKg - a.weightKg
  );
}

function explainDeferral(order, vehicles) {
  const atDepot = vehicles.filter((v) => v.depot === order.depot);
  if (atDepot.length === 0) return 'No available vehicle at this depot';
  const access = atDepot.filter((v) => order.parking !== 'van_only' || v.type === 'van');
  if (access.length === 0) return 'Van-only outlet and no van is available';
  const capable = access.filter((v) => order.temp !== 'chilled' || v.temp === 'reefer');
  if (capable.length === 0) {
    return order.parking === 'van_only'
      ? 'Chilled order at a van-only outlet and no refrigerated van is available'
      : 'No refrigerated vehicle is available';
  }
  const bigEnough = capable.filter(
    (v) => v.weightCap >= order.weightKg && v.volumeCap >= order.volumeM3
  );
  if (bigEnough.length === 0) return 'Order is larger than the capacity of every eligible vehicle';
  return 'Eligible vehicles are full (capacity, two-trip limit or time budget used up)';
}

function runAllocation({ orders: orderRows, fleet, vehicles: vehicleRows, travel, allowance }) {
  const orders = orderRows.map(normalizeOrder);
  const lookups = buildLookups(travel, allowance);

  for (const o of orders) {
    if (!lookups.travel[o.district]) {
      throw new Error(`district_travel.csv has no row for district "${o.district}"`);
    }
    if (lookups.allowance[`${o.brand}|${o.dockType}`] === undefined) {
      throw new Error(`service_allowance.csv has no row for ${o.brand} + ${o.dockType}`);
    }
  }

  const availableIds = new Set(
    fleet.filter((f) => f.status.trim() === 'available').map((f) => f.vehicle_id)
  );
  const vehicles = vehicleRows
    .filter((r) => availableIds.has(r.vehicle_id))
    .map(normalizeVehicle)
    .sort((a, b) => a.vehicleId.localeCompare(b.vehicleId));

  const results = new Map();
  const sorted = [...orders].sort(compareByPriority);

  for (const order of sorted) {
    const base = {
      orderId: order.orderRef,
      outletId: order.outletId,
      destination: `${order.outletId} (${order.district})`,
      brand: order.brand,
      district: order.district,
      temp: order.temp,
      weightKg: order.weightKg,
      volumeM3: order.volumeM3,
    };

    // 1) Try to add the order to a trip that already exists
    let placed = null;
    for (const v of vehicles) {
      if (!vehicleAllows(v, order)) continue;
      for (const trip of v.trips) {
        if (
          trip.brand === order.brand &&
          trip.district === order.district &&
          fitsInTrip(v, trip, order, lookups)
        ) {
          trip.orders.push(order);
          placed = { vehicleId: v.vehicleId, tripId: trip.tripId };
          break;
        }
      }
      if (placed) break;
    }

    // 2) Otherwise open a new trip on the best eligible vehicle
    if (!placed) {
      const candidates = vehicles
        .filter(
          (v) =>
            vehicleAllows(v, order) &&
            v.trips.length < MAX_TRIPS_PER_VEHICLE &&
            fitsInTrip(v, { orders: [] }, order, lookups)
        )
        .sort(
          (a, b) =>
            vehicleCost(a, order) - vehicleCost(b, order) ||
            a.vehicleId.localeCompare(b.vehicleId)
        );

      if (candidates.length > 0) {
        const v = candidates[0];
        const trip = {
          tripId: v.trips.length + 1,
          brand: order.brand,
          district: order.district,
          orders: [order],
        };
        v.trips.push(trip);
        placed = { vehicleId: v.vehicleId, tripId: trip.tripId };
      }
    }

    if (placed) {
      results.set(order.orderRef, { ...base, decision: 'served', ...placed, reason: null });
    } else {
      results.set(order.orderRef, {
        ...base,
        decision: 'deferred',
        vehicleId: null,
        tripId: null,
        reason: explainDeferral(order, vehicles),
      });
    }
  }

  const allocations = orders.map((o) => results.get(o.orderRef));

  const trips = [];
  for (const v of vehicles) {
    for (const t of v.trips) {
      trips.push({
        vehicleId: v.vehicleId,
        vehicleType: v.type,
        temp: v.temp,
        tripId: t.tripId,
        brand: t.brand,
        district: t.district,
        stops: t.orders.length,
        weightKg: round2(t.orders.reduce((s, o) => s + o.weightKg, 0)),
        volumeM3: round2(t.orders.reduce((s, o) => s + o.volumeM3, 0)),
        minutes: tripMinutes(t.orders, lookups),
        orderRefs: t.orders.map((o) => o.orderRef),
      });
    }
  }

  const summary = {
    totalOrders: allocations.length,
    served: allocations.filter((a) => a.decision === 'served').length,
    deferred: allocations.filter((a) => a.decision === 'deferred').length,
    availableVehicles: vehicles.length,
    vehiclesUsed: vehicles.filter((v) => v.trips.length > 0).length,
    tripsRun: trips.length,
  };

  return { allocations, trips, summary };
}

module.exports = { runAllocation };