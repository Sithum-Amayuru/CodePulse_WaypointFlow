import { useState, useEffect } from 'react';

const API = 'http://localhost:3000';

const ASSIGNED_STATES = ['ASSIGNED', 'LOADED', 'DELIVERED', 'RECEIVED'];
const IN_USE_STATES = ['ALLOCATED', 'ASSIGNED', 'LOADED', 'DELIVERED', 'RECEIVED'];

const TABS = [
  { key: 'ACTION', label: 'Needs Action', states: ['PENDING', 'ALLOCATED', 'OVER_CAPACITY'] },
  { key: 'ASSIGNED', label: 'Assigned', states: ['ASSIGNED', 'LOADED'] },
  { key: 'DONE', label: 'Delivered', states: ['DELIVERED', 'RECEIVED'] },
  { key: 'DEFERRED', label: 'Deferred', states: ['DEFERRED'] },
  { key: 'ALL', label: 'All', states: null },
];

const STATUS_STYLE = {
  PENDING: 'bg-slate-100 text-slate-700',
  ALLOCATED: 'bg-blue-100 text-blue-700',
  OVER_CAPACITY: 'bg-red-100 text-red-700',
  ASSIGNED: 'bg-green-100 text-green-700',
  LOADED: 'bg-indigo-100 text-indigo-700',
  DELIVERED: 'bg-emerald-100 text-emerald-700',
  RECEIVED: 'bg-emerald-200 text-emerald-800',
  DEFERRED: 'bg-amber-100 text-amber-800',
};

const STATUS_LABEL = {
  PENDING: 'PENDING',
  ALLOCATED: 'ALLOCATED',
  OVER_CAPACITY: 'OVER CAPACITY',
  ASSIGNED: 'ASSIGNED',
  LOADED: 'LOADED',
  DELIVERED: 'DELIVERED',
  RECEIVED: 'RECEIVED',
  DEFERRED: 'DEFERRED',
};

function Dispatcher() {
  const [orders, setOrders] = useState([]);
  const [vehicleTotal, setVehicleTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ACTION');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const loadData = () => {
    return fetch(`${API}/api/orders`)
      .then((res) => res.json())
      .then((orderData) => {
        setOrders(Array.isArray(orderData) ? orderData : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching data:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch(`${API}/api/vehicles`)
      .then((res) => res.json())
      .then((data) => setVehicleTotal(Array.isArray(data) ? data.length : 0))
      .catch(() => {});

    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, []);

  const callApi = (path, key) => {
    setBusy(key);
    setError('');
    return fetch(`${API}${path}`, { method: 'POST' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
      })
      .then(() => loadData())
      .catch((err) => setError(err.message))
      .finally(() => setBusy(''));
  };

  const orderAction = (ref, action) => callApi(`/api/orders/${ref}/${action}`, ref + action);
  const autoAllocateAll = () => callApi('/api/orders/auto-allocate-all', 'ALL');

  const count = (states) => orders.filter((o) => states.includes(o.status)).length;
  const assignedCount = count(ASSIGNED_STATES);
  const attentionCount = count(['DEFERRED', 'OVER_CAPACITY']);
  const pendingCount = count(['PENDING']);

  // Vehicles that currently have work
  const vehiclesInUse = new Set(
    orders.filter((o) => IN_USE_STATES.includes(o.status) && o.vehicleId).map((o) => o.vehicleId)
  ).size;

  // Live trips: assigned orders grouped by truck + trip
  const tripMap = {};
  orders
    .filter((o) => ASSIGNED_STATES.includes(o.status) && o.vehicleId)
    .forEach((o) => {
      const key = `${o.vehicleId}|${o.tripId}`;
      if (!tripMap[key]) {
        tripMap[key] = { key, vehicleId: o.vehicleId, tripId: o.tripId, district: o.district, orders: [] };
      }
      tripMap[key].orders.push(o);
    });
  const liveTrips = Object.values(tripMap).map((t) => {
    const total = t.orders.length;
    const loaded = t.orders.filter((o) => ['LOADED', 'DELIVERED', 'RECEIVED'].includes(o.status)).length;
    const delivered = t.orders.filter((o) => ['DELIVERED', 'RECEIVED'].includes(o.status)).length;
    let state = 'Waiting to load';
    if (delivered === total) state = 'Completed';
    else if (loaded > 0) state = 'In progress';
    return { ...t, total, loaded, delivered, state };
  });
  const tripsActive = liveTrips.filter((t) => t.state !== 'Completed').length;

  const activeTab = TABS.find((t) => t.key === tab);
  const visible = activeTab.states ? orders.filter((o) => activeTab.states.includes(o.status)) : orders;

  if (loading) {
    return <div className="p-10">Loading dashboard...</div>;
  }

  const Btn = ({ onClick, color, children }) => (
    <button
      onClick={onClick}
      disabled={busy !== ''}
      className={`${color} text-white text-[10px] font-semibold px-2.5 py-1 rounded disabled:opacity-50`}
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-white text-slate-800">
      <header className="bg-[#1b2a4e] text-white px-6 py-2.5 flex items-center shadow-sm">
        <div className="flex items-center space-x-2 text-base md:text-lg">
          <span className="font-normal tracking-wide text-slate-100">Waypoint Logistics</span>
          <span className="text-slate-400 font-light">|</span>
          <span className="text-slate-200 text-sm md:text-base font-light">Dispatcher Hub</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded border border-slate-300 shadow-sm py-3.5 px-4 text-center">
            <div className="text-[17px] font-semibold text-[#00c853]">Fleet Active</div>
            <div className="text-[13px] font-medium text-[#00c853] mt-0.5">
              {vehiclesInUse} / {vehicleTotal} Vehicles in use
            </div>
          </div>
          <div className="bg-white rounded border border-slate-300 shadow-sm py-3.5 px-4 text-center">
            <div className="text-[17px] font-semibold text-[#2563eb]">Orders Assigned</div>
            <div className="text-[13px] font-medium text-[#2563eb] mt-0.5">
              {assignedCount} of {orders.length} Orders
            </div>
          </div>
          <div className="bg-white rounded border border-slate-300 shadow-sm py-3.5 px-4 text-center">
            <div className="text-[17px] font-semibold text-[#e11d48]">Deferral Alerts</div>
            <div className="text-[13px] font-medium text-[#e11d48] mt-0.5">
              {attentionCount} Orders Need Attention
            </div>
          </div>
        </section>

        {/* Live trips */}
        <section className="bg-white rounded border border-slate-300 shadow-sm p-5 mb-6">
          <div className="flex justify-between items-center mb-3">
            <p className="font-semibold text-sm">Live Trips</p>
            <p className="text-xs text-gray-500">
              {tripsActive} active · {liveTrips.length} total
            </p>
          </div>
          {liveTrips.length === 0 ? (
            <p className="text-xs text-gray-500">
              No trips yet. Trips appear here after you assign orders to a truck.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-52 overflow-y-auto">
              {liveTrips.map((t) => (
                <div
                  key={t.key}
                  className={`rounded p-3 border text-xs ${
                    t.state === 'Completed'
                      ? 'bg-green-50 border-green-300'
                      : t.state === 'In progress'
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <p className="font-semibold text-gray-500">
                    {t.vehicleId} · TRIP {t.tripId}
                  </p>
                  <p className="font-semibold">{t.district} route</p>
                  <p className="mt-1 text-gray-600">
                    {t.total} {t.total === 1 ? 'stop' : 'stops'} · Loaded {t.loaded}/{t.total} ·
                    Delivered {t.delivered}/{t.total}
                  </p>
                  <p className="mt-1">
                    {t.state === 'Completed' ? (
                      <span className="text-green-600">✓ Completed</span>
                    ) : t.state === 'In progress' ? (
                      <span className="text-blue-600">● In progress</span>
                    ) : (
                      <span className="text-gray-500">○ Waiting to load</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Orders table */}
        <section className="bg-white rounded-md border border-slate-300 shadow-sm overflow-hidden">
          <div className="flex flex-wrap gap-2 justify-between items-center px-4 py-2.5 border-b border-slate-200 bg-slate-50/75">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Daily Orders
            </p>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500">● Live · updates automatically</span>
              <button
                onClick={autoAllocateAll}
                disabled={busy !== '' || pendingCount === 0}
                className="text-[10px] bg-blue-700 text-white px-3 py-1 rounded font-semibold disabled:opacity-50"
              >
                {busy === 'ALL' ? 'Allocating...' : `Auto-Allocate All Pending (${pendingCount})`}
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1 px-4 pt-3">
            {TABS.map((t) => {
              const n = t.states ? count(t.states) : orders.length;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`text-[11px] font-semibold px-3 py-1 rounded-full border ${
                    tab === t.key
                      ? 'bg-[#1b2a4e] text-white border-[#1b2a4e]'
                      : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  {t.label} ({n})
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mx-4 mt-3 bg-red-50 border border-red-300 text-red-700 text-xs rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="overflow-x-auto w-full max-h-[560px] overflow-y-auto mt-3">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 font-semibold tracking-wider uppercase text-[11px]">
                  <th className="py-2.5 px-4 pl-6">Order ID</th>
                  <th className="py-2.5 px-4">Destination</th>
                  <th className="py-2.5 px-4">Weight / Vol</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 pr-6">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-6 px-6 text-center text-slate-500">
                      No orders in this list.
                    </td>
                  </tr>
                )}
                {visible.map((o) => (
                  <tr key={o.orderId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-4 pl-6 font-medium text-slate-700">#{o.orderId}</td>
                    <td className="py-2 px-4">
                      {o.destination}
                      <div className="text-[10px] text-slate-500">
                        {o.brand} · {o.temp}
                      </div>
                    </td>
                    <td className="py-2 px-4">
                      {Math.round(Number(o.weightKg))} kg / {Number(o.volumeM3).toFixed(2)} m³
                    </td>
                    <td className="py-2 px-4">
                      <span
                        className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                          STATUS_STYLE[o.status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {STATUS_LABEL[o.status] || o.status}
                      </span>
                      {o.vehicleId && (
                        <div className="text-[10px] text-slate-600 mt-1">
                          {o.vehicleId} · Trip {o.tripId}
                        </div>
                      )}
                      {o.reason && (
                        <div className="text-[10px] text-red-600 italic mt-1 max-w-[260px]">
                          {o.reason}
                        </div>
                      )}
                      {o.status === 'RECEIVED' && o.receipt && o.receipt.condition === 'damaged' && (
                        <div className="text-[10px] text-amber-700 mt-1">
                          Receipt: discrepancies logged
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-4 pr-6">
                      <div className="flex gap-1.5 flex-wrap">
                        {(o.status === 'PENDING' || o.status === 'OVER_CAPACITY') && (
                          <Btn
                            color="bg-blue-700 hover:bg-blue-800"
                            onClick={() => orderAction(o.orderId, 'auto-allocate')}
                          >
                            Auto-Allocate
                          </Btn>
                        )}
                        {o.status === 'ALLOCATED' && (
                          <Btn
                            color="bg-green-600 hover:bg-green-700"
                            onClick={() => orderAction(o.orderId, 'assign')}
                          >
                            Assign
                          </Btn>
                        )}
                        {['PENDING', 'ALLOCATED', 'OVER_CAPACITY'].includes(o.status) && (
                          <Btn
                            color="bg-red-600 hover:bg-red-700"
                            onClick={() => orderAction(o.orderId, 'defer')}
                          >
                            Defer Order
                          </Btn>
                        )}
                        {o.status === 'ASSIGNED' && (
                          <span className="text-[10px] text-green-700">Sent to Loader</span>
                        )}
                        {o.status === 'LOADED' && (
                          <span className="text-[10px] text-indigo-700">Loaded, awaiting driver</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Dispatcher;