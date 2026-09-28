import { useState, useEffect } from 'react';

function Loader() {
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrip();
  }, []);

  const fetchTrip = () => {
    fetch('http://localhost:3000/api/trip')
      .then((res) => res.json())
      .then((data) => {
        setTrip(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching trip:', err);
        setLoading(false);
      });
  };

  const markLoaded = (step) => {
    fetch(`http://localhost:3000/api/trip/load/${step}`, { method: 'POST' })
      .then((res) => res.json())
      .then((data) => setTrip(data))
      .catch((err) => console.error('Error updating trip:', err));
  };

  if (loading) return <div className="p-10">Loading...</div>;
  if (!trip) return <div className="p-10">Could not load trip data.</div>;

  // Reverse order for LIFO loading display (last stop loads first)
  const loadOrder = [...trip.stops].reverse();

  return (
    <div className="bg-[#f8fafc] text-slate-800 flex justify-center min-h-screen">
      <div className="w-full max-w-sm flex flex-col justify-between min-h-screen bg-[#f8fafc] shadow-md border-x border-slate-200">
        <main className="w-full flex flex-col items-center">
          {/* Header */}
          <header className="w-full bg-[#1b3160] text-white py-3.5 px-4 text-center shadow-sm">
            <h1 className="text-base font-semibold tracking-normal text-white">
              Dock #03 | Loading Manifest
            </h1>
            <p className="text-xs text-slate-300 mt-0.5 tracking-tight">
              Truck: {trip.vehicleId} (Route: Kandy)
            </p>
          </header>

          {/* Protocol Banner */}
          <div className="w-[90%] mx-auto mt-3 bg-[#fff3c4] border border-[#f59e0b] py-2.5 px-4 text-center text-xs font-medium text-gray-800">
            LOADING PROTOCOL: LIFO (Last-In, First-Out)
          </div>

          {/* Steps List */}
          <section aria-label="Loading Steps" className="w-full px-4 py-2 space-y-3">
            {loadOrder.map((s, index) => (
              <article
                key={s.step}
                className={`rounded-md border p-3 shadow-sm ${
                  s.loaded ? 'bg-green-50 border-green-300' : 'bg-white border-slate-300/80'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      STEP {index + 1} - {index === 0 ? 'LOAD FIRST' : index === loadOrder.length - 1 ? 'LOAD LAST (UNLOAD FIRST)' : 'LOAD NEXT'}
                    </p>
                    <h2 className="text-sm font-bold text-slate-900 mt-0.5">
                      Stop {s.step}: {s.name}
                    </h2>
                    <p className="text-xs text-slate-700 mt-0.5 font-medium">{s.detail}</p>
                  </div>
                  {s.loaded ? (
                    <span className="text-green-600 font-semibold text-xs whitespace-nowrap">✓ Loaded</span>
                  ) : (
                    <button
                      onClick={() => markLoaded(s.step)}
                      className="bg-blue-700 text-white text-[10px] font-semibold px-3 py-1.5 rounded whitespace-nowrap"
                    >
                      Mark Loaded
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>

          {/* Action Buttons */}
          <section className="w-full px-4 pt-6 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => alert('Barcode scanned!')}
                className="w-full bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold py-2.5 px-2 rounded shadow-sm"
              >
                Scan Barcode
              </button>
              <button
                onClick={() => {
                  const issue = prompt('Please enter the details of the damaged or missing items:');
                  if (issue) alert('Damage Report Submitted Successfully:\nDetails: ' + issue);
                }}
                className="w-full bg-[#ef4444] hover:bg-[#dc2626] text-white text-xs font-semibold py-2.5 px-2 rounded shadow-sm"
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