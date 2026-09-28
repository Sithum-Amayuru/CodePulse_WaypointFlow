import { useState, useEffect } from 'react';

function Driver() {
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

  const markDelivered = (step) => {
    fetch(`http://localhost:3000/api/trip/deliver/${step}`, { method: 'POST' })
      .then((res) => res.json())
      .then((data) => setTrip(data))
      .catch((err) => console.error('Error updating trip:', err));
  };

  if (loading) return <div className="p-10">Loading...</div>;
  if (!trip) return <div className="p-10">Could not load trip data.</div>;

  const currentStop = trip.stops.find((s) => !s.delivered);

  return (
    <div className="bg-slate-50 text-slate-900 flex justify-center min-h-screen">
      <div className="w-full max-w-[375px] bg-white min-h-screen flex flex-col shadow-lg border-x border-slate-200">
        {/* Header */}
        <header className="bg-[#1e3465] text-white px-4 pt-5 pb-4">
          <h1 className="text-[17px] font-bold tracking-tight leading-tight">
            Active Trip: Route #{trip.tripId}
          </h1>
          <p className="text-xs text-slate-200 mt-1 font-normal opacity-90">
            Vehicle: {trip.vehicleId} | Driver: {trip.driver}
          </p>
        </header>

        <main className="flex-1 px-3.5 pt-3.5 pb-6 flex flex-col space-y-3">
          {/* Next Stop Banner */}
          {currentStop ? (
            <section className="bg-[#EBF3FE] border border-[#BFDBFE] rounded-lg px-3 py-2 text-center">
              <p className="text-[11px] font-semibold text-[#1E3A8A] tracking-tight">
                NEXT STOP: Stop {currentStop.step} - {currentStop.name}
              </p>
            </section>
          ) : (
            <section className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
              <p className="text-[11px] font-semibold text-green-800 tracking-tight">
                ALL STOPS DELIVERED - TRIP COMPLETE
              </p>
            </section>
          )}

          {/* Stop Cards */}
          <section aria-label="Delivery Stops Sequence" className="space-y-3">
            {trip.stops.map((s) => {
              const isCurrent = currentStop && s.step === currentStop.step;
              return (
                <article
                  key={s.step}
                  className={`bg-white border rounded-lg p-3.5 shadow-sm relative ${
                    s.delivered ? 'border-green-300 bg-green-50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        {s.delivered ? 'DELIVERED' : isCurrent ? 'IN-PROGRESS' : 'PENDING'}
                      </span>
                      <h2 className="text-sm font-bold text-slate-900 leading-snug">
                        Stop {s.step}: {s.name}
                      </h2>
                      <p className="text-[11px] text-slate-600 mt-1 leading-snug">{s.detail}</p>
                    </div>
                    {isCurrent && (
                      <button
                        onClick={() =>
                          window.open('https://www.google.com/maps/dir/?api=1&destination=Kandy,Sri+Lanka', '_blank')
                        }
                        className="bg-blue-700 text-white font-medium text-sm px-5 py-1.5 rounded-lg border-[3px] border-blue-400"
                      >
                        Navigate
                      </button>
                    )}
                    {s.delivered && <span className="text-green-600 font-semibold text-xs">✓</span>}
                  </div>
                </article>
              );
            })}
          </section>

          <div className="flex-grow min-h-[40px]"></div>

          {/* Bottom Action Buttons */}
          {currentStop && (
            <section aria-label="Route Actions" className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                onClick={() => markDelivered(currentStop.step)}
                className="bg-[#00B074] hover:bg-emerald-600 text-white font-bold text-xs py-3.5 px-2 rounded-lg shadow-sm"
              >
                Confirm Delivery (POD)
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Please enter the reason for the delay or issue:');
                  if (reason) alert('Your issue has been reported to the Dispatcher:\nReason: ' + reason);
                }}
                className="bg-[#F39C12] hover:bg-amber-600 text-white font-bold text-xs py-3.5 px-2 rounded-lg shadow-sm"
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