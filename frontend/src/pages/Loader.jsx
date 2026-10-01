import { useState, useEffect } from 'react';

const API = 'http://localhost:3000';

function Loader() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState('');

  const fetchJobs = () =>
    fetch(`${API}/api/loader/jobs`)
      .then((res) => {
        if (!res.ok) throw new Error('Bad response');
        return res.json();
      })
      .then((data) => {
        setJobs(Array.isArray(data) ? data : []);
        setError('');
        setLoading(false);
      })
      .catch(() => {
        setError('Could not reach the server.');
        setLoading(false);
      });

  useEffect(() => {
    fetchJobs();
    const timer = setInterval(fetchJobs, 5000);
    return () => clearInterval(timer);
  }, []);

  const markLoaded = (ref, key) => {
    setSelected(key);
    setBusy(ref);
    setError('');
    fetch(`${API}/api/orders/${ref}/load`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Request failed');
        }
      })
      .then(() => fetchJobs())
      .catch((err) => setError(err.message))
      .finally(() => setBusy(''));
  };

  const handleReset = async () => {
    if (!window.confirm('Reset demo data? All orders go back to Pending and the demo trip is cleared.')) {
      return;
    }
    try {
      const res = await fetch(`${API}/api/demo/reset`, { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');
      setSelected('');
      await fetchJobs();
      alert('Demo state reset. All orders are back to Pending.');
    } catch (err) {
      setError('Reset failed: ' + err.message);
    }
  };

  if (loading) return <div className="p-10 font-medium">Loading manifest data...</div>;

  // Group the assigned jobs by truck + trip
  const loadsMap = {};
  jobs.forEach((j) => {
    const key = `${j.vehicleId}|${j.tripId}`;
    if (!loadsMap[key]) {
      loadsMap[key] = { key, vehicleId: j.vehicleId, tripId: j.tripId, district: j.district, jobs: [] };
    }
    loadsMap[key].jobs.push(j);
  });
  const loads = Object.values(loadsMap);
  const activeLoad =
    loads.find((l) => l.key === selected) ||
    loads.find((l) => l.jobs.some((j) => j.status === 'ASSIGNED')) ||
    loads[0];

  // Reverse order for LIFO loading display (last stop loads first)
  const loadOrder = activeLoad ? [...activeLoad.jobs].reverse() : [];

  return (
    <div className="bg-[#f8fafc] text-slate-800 flex justify-center min-h-screen">
      <div className="w-full max-w-sm flex flex-col justify-between min-h-screen bg-[#f8fafc] shadow-md border-x border-slate-200">
        <main className="w-full flex flex-col items-center">
          {/* Header with Integrated Reset Button */}
          <header className="w-full bg-[#1b3160] text-white py-3.5 px-4 text-center shadow-sm relative">
            <h1 className="text-base font-semibold tracking-normal text-white">
              Dock #03 | Loading Manifest
            </h1>
            <p className="text-xs text-slate-300 mt-0.5 tracking-tight">
              {activeLoad
                ? `Truck: ${activeLoad.vehicleId} · Trip ${activeLoad.tripId} (Route: ${activeLoad.district})`
                : 'No truck assigned yet'}
            </p>

            <button
              onClick={handleReset}
              title="Reset Demo State"
              className="mt-2 bg-slate-700 hover:bg-slate-800 text-slate-100 text-[11px] font-semibold px-2.5 py-1 rounded border border-slate-500 transition-colors"
            >
              🔄 Reset Demo State
            </button>
          </header>

          {/* Truck selector (only when more than one truck has jobs) */}
          {loads.length > 1 && (
            <div className="w-[90%] mx-auto mt-3 flex flex-wrap gap-1.5">
              {loads.map((l) => {
                const done = l.jobs.filter((j) => j.status === 'LOADED').length;
                const isActive = activeLoad && l.key === activeLoad.key;
                return (
                  <button
                    key={l.key}
                    onClick={() => setSelected(l.key)}
                    className={`text-[11px] font-semibold px-3 py-1 rounded-full border ${
                      isActive
                        ? 'bg-[#1b3160] text-white border-[#1b3160]'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {l.vehicleId} · T{l.tripId} ({done}/{l.jobs.length})
                  </button>
                );
              })}
            </div>
          )}

          {/* Protocol Banner */}
          <div className="w-[90%] mx-auto mt-3 bg-[#fff3c4] border border-[#f59e0b] py-2.5 px-4 text-center text-xs font-medium text-gray-800">
            LOADING PROTOCOL: LIFO (Last-In, First-Out)
          </div>

          {error && (
            <div className="w-[90%] mx-auto mt-3 bg-red-50 border border-red-300 text-red-700 text-xs rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* Steps List */}
          <section aria-label="Loading Steps" className="w-full px-4 py-2 space-y-3">
            {!activeLoad && (
              <div className="rounded-md border border-slate-300/80 bg-white p-4 text-center text-xs text-slate-600">
                No jobs assigned yet. Jobs appear here after the Dispatcher assigns orders.
              </div>
            )}
            {loadOrder.map((o, index) => {
              const loaded = o.status === 'LOADED';
              const stopNo = activeLoad.jobs.length - index;
              return (
                <article
                  key={o.orderId}
                  className={`rounded-md border p-3 shadow-sm ${
                    loaded ? 'bg-green-50 border-green-300' : 'bg-white border-slate-300/80'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        STEP {index + 1} -{' '}
                        {index === 0
                          ? 'LOAD FIRST'
                          : index === loadOrder.length - 1
                          ? 'LOAD LAST (UNLOAD FIRST)'
                          : 'LOAD NEXT'}
                      </p>
                      <h2 className="text-sm font-bold text-slate-900 mt-0.5">
                        Stop {stopNo}: {o.destination}
                      </h2>
                      <p className="text-xs text-slate-700 mt-0.5 font-medium">
                        {o.brand} · {o.temp} · {Math.round(Number(o.weightKg))} kg /{' '}
                        {Number(o.volumeM3).toFixed(2)} m³
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Order #{o.orderId}</p>
                    </div>
                    {loaded ? (
                      <span className="text-green-600 font-semibold text-xs whitespace-nowrap">✓ Loaded</span>
                    ) : (
                      <button
                        onClick={() => markLoaded(o.orderId, activeLoad.key)}
                        disabled={busy !== ''}
                        className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-[10px] font-semibold px-3 py-1.5 rounded whitespace-nowrap transition-colors"
                      >
                        Mark Loaded
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          {/* Action Buttons */}
          <section className="w-full px-4 pt-6 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => alert('Barcode scanned successfully!')}
                className="w-full bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold py-2.5 px-2 rounded shadow-sm transition-colors"
              >
                Scan Barcode
              </button>
              <button
                onClick={() => {
                  const issue = prompt('Please enter the details of the damaged or missing items:');
                  if (issue) alert('Damage Report Submitted Successfully:\nDetails: ' + issue);
                }}
                className="w-full bg-[#ef4444] hover:bg-[#dc2626] text-white text-xs font-semibold py-2.5 px-2 rounded shadow-sm transition-colors"
              >
                Flag Missing/Damage
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default Loader;