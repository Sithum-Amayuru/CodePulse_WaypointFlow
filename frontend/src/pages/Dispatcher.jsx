import { useState, useEffect } from 'react';

function Dispatcher() {
  const [allocations, setAllocations] = useState([]);
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fleetCount, setFleetCount] = useState(48);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch('http://localhost:3000/api/allocate').then((res) => res.json()),
      fetch('http://localhost:3000/api/trip').then((res) => res.json()),
    ])
      .then(([allocationData, tripData]) => {
        setAllocations(allocationData);
        setTrip(tripData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching data:', err);
        setLoading(false);
      });
  };

  const servedCount = allocations.filter((a) => a.decision === 'served').length;
  const deferredCount = allocations.filter((a) => a.decision === 'deferred').length;

  if (loading) {
    return <div className="p-10">Loading dashboard...</div>;
  }

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
            <div className="text-[13px] font-medium text-[#00c853] mt-0.5">{fleetCount} / 60 Vehicles</div>
          </div>
          <div className="bg-white rounded border border-slate-300 shadow-sm py-3.5 px-4 text-center">
            <div className="text-[17px] font-semibold text-[#2563eb]">Orders Served</div>
            <div className="text-[13px] font-medium text-[#2563eb] mt-0.5">{servedCount} Allocated</div>
          </div>
          <div className="bg-white rounded border border-slate-300 shadow-sm py-3.5 px-4 text-center">
            <div className="text-[17px] font-semibold text-[#e11d48]">Deferral Alerts</div>
            <div className="text-[13px] font-medium text-[#e11d48] mt-0.5">{deferredCount} Orders Pending</div>
          </div>
        </section>

        {/* Live Trip Status */}
        {trip && (
          <section className="bg-white rounded border border-slate-300 shadow-sm p-5 mb-6">
            <div className="flex justify-between items-center mb-3">
              <p className="font-semibold text-sm">
                Live Trip: Route #{trip.tripId} ({trip.vehicleId} - {trip.driver})
              </p>
              <p className="text-xs text-gray-500">
                Loaded: {trip.stops.filter((s) => s.loaded).length}/{trip.stops.length} · Delivered:{' '}
                {trip.stops.filter((s) => s.delivered).length}/{trip.stops.length}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {trip.stops.map((s) => (
                <div
                  key={s.step}
                  className={`rounded p-3 border text-xs ${
                    s.delivered
                      ? 'bg-green-50 border-green-300'
                      : s.loaded
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <p className="font-semibold text-gray-500">STOP {s.step}</p>
                  <p className="font-semibold">{s.name}</p>
                  <p className="mt-1">
                    {s.delivered ? (
                      <span className="text-green-600">✓ Delivered</span>
                    ) : s.loaded ? (
                      <span className="text-blue-600">● In transit</span>
                    ) : (
                      <span className="text-gray-500">○ Not loaded</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Allocation Engine Results Table */}
        <section className="bg-white rounded-md border border-slate-300 shadow-sm overflow-hidden">
          <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-200 bg-slate-50/75">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Allocation Engine Results
            </p>
            <button
              onClick={loadData}
              className="text-[10px] bg-slate-700 text-white px-3 py-1 rounded font-semibold"
            >
              Re-run Allocation
            </button>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-800 font-semibold tracking-wider uppercase text-[11px]">
                  <th className="py-2.5 px-4 pl-6">Order ID</th>
                  <th className="py-2.5 px-4">Destination</th>
                  <th className="py-2.5 px-4 text-center">Decision</th>
                  <th className="py-2.5 px-4 pr-6">Vehicle / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {allocations.map((a) => (
                  <tr key={a.orderId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-4 pl-6 font-medium text-slate-700">#{a.orderId}</td>
                    <td className="py-2 px-4">{a.destination}</td>
                    <td className="py-2 px-4 text-center">
                      {a.decision === 'served' ? (
                        <span className="bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded text-[10px]">
                          SERVED
                        </span>
                      ) : (
                        <span className="bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded text-[10px]">
                          DEFERRED
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 pr-6">
                      {a.decision === 'served' ? (
                        <span className="text-slate-700 font-medium">{a.vehicleId}</span>
                      ) : (
                        <span className="text-red-600 italic">{a.reason}</span>
                      )}
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