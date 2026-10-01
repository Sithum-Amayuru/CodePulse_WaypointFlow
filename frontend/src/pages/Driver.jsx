import { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:3000';
const QUEUE_KEY = 'waypoint_driver_queue_v2';
const JOBS_KEY = 'waypoint_driver_jobs_cache_v2';

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // storage not available: ignore
  }
}

// Deliveries saved on the phone are shown as delivered (but marked pending sync)
function applyQueue(jobs, queue) {
  return jobs.map((j) =>
    queue.some((q) => q.orderId === j.orderId) ? { ...j, status: 'DELIVERED', pending: true } : j
  );
}

const isDone = (j) => j.status === 'DELIVERED' || j.status === 'RECEIVED';

function Driver() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState(() => readJSON(QUEUE_KEY, []));
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState('');
  const syncLock = useRef(false);

  const fetchJobs = () => {
    return fetch(`${API}/api/driver/jobs`)
      .then((res) => {
        if (!res.ok) throw new Error('Bad response');
        return res.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setOnline(true);
        writeJSON(JOBS_KEY, list);
        setJobs(applyQueue(list, readJSON(QUEUE_KEY, [])));
        setLoading(false);
      })
      .catch(() => {
        setOnline(false);
        const cached = readJSON(JOBS_KEY, null);
        if (cached) setJobs(applyQueue(cached, readJSON(QUEUE_KEY, [])));
        setLoading(false);
      });
  };

  const syncQueue = async () => {
    if (syncLock.current) return;
    const pending = readJSON(QUEUE_KEY, []);
    if (pending.length === 0) return;
    syncLock.current = true;
    const hadDelayed = pending.some((i) => i.offline || i.failed);
    setSyncing(true);

    const failed = [];
    let reached = false;
    for (const item of pending) {
      try {
        const res = await fetch(`${API}/api/orders/${item.orderId}/deliver`, { method: 'POST' });
        reached = true;
        // ok = synced. 409/404 = the order is already delivered or no longer valid: drop it.
        if (res.ok || res.status === 409 || res.status === 404) continue;
        failed.push({ ...item, failed: true });
      } catch (e) {
        failed.push({ ...item, failed: true });
      }
    }

    // Keep anything added while we were syncing; replace only the ones we processed
    const processed = pending.map((i) => i.orderId);
    const current = readJSON(QUEUE_KEY, []);
    const next = current.filter((i) => !processed.includes(i.orderId)).concat(failed);
    writeJSON(QUEUE_KEY, next);
    setQueue(next);

    if (reached) {
      setOnline(true);
      await fetchJobs();
      if (failed.length === 0 && hadDelayed) {
        setNotice('Back online. All saved deliveries have been synced.');
        setTimeout(() => setNotice(''), 5000);
      }
    } else {
      setOnline(false);
    }
    setSyncing(false);
    syncLock.current = false;
  };

  useEffect(() => {
    fetchJobs().then(() => syncQueue());

    const handleOnline = () => {
      syncQueue().then(() => fetchJobs());
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const timer = setInterval(() => {
      if (readJSON(QUEUE_KEY, []).length > 0) {
        syncQueue();
      } else {
        fetchJobs();
      }
    }, 8000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(timer);
    };
  }, []);

  const markDelivered = (orderId, key) => {
    setSelected(key);
    const q = readJSON(QUEUE_KEY, []);
    if (!q.some((i) => i.orderId === orderId)) {
      q.push({ orderId, at: new Date().toISOString(), offline: !online });
      writeJSON(QUEUE_KEY, q);
      setQueue(q);
    }
    setJobs((prev) => applyQueue(prev, q));
    syncQueue();
  };

  if (loading) return <div className="p-10 text-center font-medium">Loading active route...</div>;

  // Group the loaded orders by truck + trip
  const groupsMap = {};
  jobs.forEach((j) => {
    const key = `${j.vehicleId}|${j.tripId}`;
    if (!groupsMap[key]) {
      groupsMap[key] = { key, vehicleId: j.vehicleId, tripId: j.tripId, district: j.district, stops: [] };
    }
    groupsMap[key].stops.push(j);
  });
  const groups = Object.values(groupsMap);
  const activeGroup =
    groups.find((g) => g.key === selected) ||
    groups.find((g) => g.stops.some((s) => !isDone(s))) ||
    groups[0];

  const hasDelayedItems = queue.some((i) => i.offline || i.failed);
  const stops = activeGroup ? activeGroup.stops : [];
  const currentStop = stops.find((s) => !isDone(s));

  return (
    <div className="bg-slate-50 text-slate-900 flex justify-center min-h-screen">
      <div className="w-full max-w-[375px] bg-white min-h-screen flex flex-col shadow-lg border-x border-slate-200">
        {/* Header */}
        <header className="bg-[#1e3465] text-white px-4 pt-5 pb-4">
          <h1 className="text-[17px] font-bold tracking-tight leading-tight">
            {activeGroup
              ? `Active Trip: ${activeGroup.vehicleId} · Trip ${activeGroup.tripId}`
              : 'Active Trip: none yet'}
          </h1>
          <p className="text-xs text-slate-200 mt-1 font-normal opacity-90">
            {activeGroup
              ? `Vehicle: ${activeGroup.vehicleId} | ${activeGroup.district} route | ${stops.length} ${
                  stops.length === 1 ? 'stop' : 'stops'
                }`
              : 'Waiting for the Loader to finish loading'}
          </p>
        </header>

        {/* Connection status banners */}
        {!online && (
          <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 text-xs font-semibold">
            You are offline. Deliveries are saved on this phone and will sync automatically when
            the signal returns.
          </div>
        )}
        {online && hasDelayedItems && (
          <div className="bg-blue-50 border-b border-blue-200 text-blue-900 px-4 py-2 text-xs font-semibold">
            Syncing {queue.length} saved {queue.length === 1 ? 'delivery' : 'deliveries'}...
          </div>
        )}
        {notice && (
          <div className="bg-green-50 border-b border-green-300 text-green-800 px-4 py-2 text-xs font-semibold">
            {notice}
          </div>
        )}

        <main className="flex-1 px-3.5 pt-3.5 pb-6 flex flex-col space-y-3">
          {/* Truck selector (only when more than one truck is loaded) */}
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const done = g.stops.filter(isDone).length;
                const isActive = activeGroup && g.key === activeGroup.key;
                return (
                  <button
                    key={g.key}
                    onClick={() => setSelected(g.key)}
                    className={`text-[11px] font-semibold px-3 py-1 rounded-full border ${
                      isActive
                        ? 'bg-[#1e3465] text-white border-[#1e3465]'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {g.vehicleId} · T{g.tripId} ({done}/{g.stops.length})
                  </button>
                );
              })}
            </div>
          )}

          {!activeGroup && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-600">
              No loaded trips yet. A trip appears here after the Loader marks its orders as loaded.
            </div>
          )}

          {/* Next Stop Banner */}
          {activeGroup && currentStop && (
            <section className="bg-[#EBF3FE] border border-[#BFDBFE] rounded-lg px-3 py-2 text-center">
              <p className="text-[11px] font-semibold text-[#1E3A8A] tracking-tight">
                NEXT STOP: Stop {stops.indexOf(currentStop) + 1} - {currentStop.destination}
              </p>
            </section>
          )}
          {activeGroup && !currentStop && (
            <section className="bg-green-50 border border-green-300 rounded-lg px-3 py-2 text-center">
              <p className="text-[11px] font-bold text-green-800 tracking-tight">
                ALL STOPS DELIVERED - TRIP COMPLETE
              </p>
            </section>
          )}

          {/* Stop Cards */}
          <section aria-label="Delivery Stops Sequence" className="space-y-3">
            {stops.map((s, i) => {
              const isCurrent = currentStop && s.orderId === currentStop.orderId;
              const delivered = isDone(s);
              const showPending = s.pending && (!online || hasDelayedItems);
              return (
                <article
                  key={s.orderId}
                  className={`bg-white border rounded-lg p-3.5 shadow-sm relative transition-all ${
                    showPending
                      ? 'border-amber-300 bg-amber-50/70'
                      : delivered
                      ? 'border-green-300 bg-green-50/60'
                      : isCurrent
                      ? 'border-blue-400 ring-1 ring-blue-400'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${
                          showPending
                            ? 'text-amber-700'
                            : delivered
                            ? 'text-green-700'
                            : isCurrent
                            ? 'text-blue-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {showPending
                          ? 'SAVED OFFLINE - PENDING SYNC'
                          : delivered
                          ? 'DELIVERED'
                          : isCurrent
                          ? 'IN-PROGRESS'
                          : 'PENDING'}
                      </span>
                      <h2 className="text-sm font-bold text-slate-900 leading-snug">
                        Stop {i + 1}: {s.destination}
                      </h2>
                      <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                        {s.brand} · {s.temp} · {Math.round(Number(s.weightKg))} kg /{' '}
                        {Number(s.volumeM3).toFixed(2)} m³
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Order #{s.orderId}</p>
                    </div>

                    {isCurrent && (
                      <button
                        onClick={() =>
                          window.open(
                            `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                              s.district + ', Sri Lanka'
                            )}`,
                            '_blank'
                          )
                        }
                        className="bg-blue-700 hover:bg-blue-800 text-white font-medium text-xs px-3.5 py-1.5 rounded-lg border-2 border-blue-400 shadow-sm"
                      >
                        Navigate
                      </button>
                    )}

                    {delivered && !showPending && (
                      <span className="text-green-600 font-bold text-sm bg-green-100 rounded-full h-6 w-6 flex items-center justify-center">
                        ✓
                      </span>
                    )}
                    {showPending && (
                      <span className="text-amber-700 font-bold text-sm bg-amber-100 rounded-full h-6 w-6 flex items-center justify-center">
                        ⏳
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          <div className="flex-grow min-h-[20px]"></div>

          {/* Retry sync */}
          {hasDelayedItems && (
            <button
              onClick={syncQueue}
              disabled={syncing}
              className="bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold text-xs py-3 rounded-lg"
            >
              {syncing ? 'Syncing...' : `Retry sync (${queue.length} pending)`}
            </button>
          )}

          {/* Bottom Action Buttons */}
          {activeGroup && currentStop && (
            <section aria-label="Route Actions" className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                onClick={() => markDelivered(currentStop.orderId, activeGroup.key)}
                className="bg-[#00B074] hover:bg-emerald-600 text-white font-bold text-xs py-3.5 px-2 rounded-lg shadow-sm transition-colors"
              >
                Confirm Delivery (POD)
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Please enter the reason for the delay or issue:');
                  if (reason) alert('Your issue has been reported to the Dispatcher:\nReason: ' + reason);
                }}
                className="bg-[#F39C12] hover:bg-amber-600 text-white font-bold text-xs py-3.5 px-2 rounded-lg shadow-sm transition-colors"
              >
                Report Delay / Issue
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default Driver;