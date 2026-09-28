import { useState, useEffect, useRef } from 'react';

function StoreManager() {
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInspection, setShowInspection] = useState(false);
  const [items, setItems] = useState([
    { name: 'Canned Goods Pallets (Ambient)', ordered: 50, received: 50, condition: 'good' },
    { name: 'Dry Grocery Pallets (Ambient)', ordered: 20, received: 18, condition: 'damaged' },
  ]);

  const canvasRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
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
  }, []);

  const updateItem = (index, field, value) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const startDrawing = (e) => {
    isDrawing.current = true;
    const rect = canvasRef.current.getBoundingClientRect();
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearSignature = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const submitInspection = () => {
    alert('Confirmation submitted! Discrepancies logged and sent to Dispatcher.');
    setShowInspection(false);
  };

  if (loading) return <div className="p-10">Loading...</div>;

  const deliveredCount = trip ? trip.stops.filter((s) => s.delivered).length : 0;
  const orderStatus = deliveredCount === trip?.stops.length ? 'DELIVERED' : deliveredCount > 0 ? 'IN-TRANSIT' : 'PENDING';

  return (
    <div className="bg-[#f8fafc] text-gray-800 min-h-screen pb-12">
      <header className="bg-[#1e3a6a] text-white px-6 py-3 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center text-sm gap-2">
          <div className="flex items-center space-x-2 font-medium tracking-wide">
            <span className="text-base font-semibold">Waypoint Logistics</span>
            <span className="text-blue-200">|</span>
            <span className="text-slate-200">Store Manager Portal</span>
          </div>
          <div className="text-slate-100 font-medium tracking-wide">Outlet #042 - Kandy City</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        <div className="w-full bg-[#fef2f2] border border-[#fca5a5] rounded-sm py-2 px-4 text-center">
          <p className="text-[#dc2626] font-semibold text-xs sm:text-sm tracking-wide uppercase">
            DAILY ORDER CUTOFF: 4:00 PM <span className="normal-case font-medium">(Remaining Time: 01h 24m)</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <section className="md:col-span-7 bg-white border border-gray-200 shadow-sm p-4 rounded-sm">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Select Items to Order</h2>
            <div className="flex gap-4 mb-4">
              <button className="bg-[#d1d5db] text-gray-800 font-medium text-xs px-8 py-1.5 rounded-sm">
                Ambient Items
              </button>
              <button
                onClick={() => alert('Chilled Items section is currently empty for this demo.')}
                className="bg-transparent text-gray-500 font-medium text-xs px-6 py-1.5 rounded-sm"
              >
                Chilled Items
              </button>
            </div>
            <div className="space-y-2.5">
              <div className="border border-gray-300 bg-[#e5e7eb] px-3 py-2 flex items-center justify-between text-xs rounded-sm">
                <span className="font-medium">Canned Goods Pallets (Ambient) - Qty: 50</span>
                <button
                  onClick={() => alert('Canned Goods Pallets added to your daily order cart.')}
                  className="bg-[#2563eb] hover:bg-blue-700 text-white font-medium text-xs px-5 py-1 rounded"
                >
                  Add to Cart
                </button>
              </div>
              <div className="border border-gray-300 bg-[#e5e7eb] px-3 py-2 flex items-center justify-between text-xs rounded-sm">
                <span className="font-medium">Dry Grocery Pallets (Ambient) - Qty: 20</span>
                <button
                  onClick={() => alert('Dry Grocery Pallets added to your daily order cart.')}
                  className="bg-[#2563eb] hover:bg-blue-700 text-white font-medium text-xs px-5 py-1 rounded"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </section>

          <section className="md:col-span-5 bg-white border border-gray-200 shadow-sm p-4 rounded-sm flex flex-col justify-between space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Current Delivery &amp; Order Summary</h2>
              <div className="space-y-1 text-xs">
                <div className="flex items-center space-x-1.5">
                  <span className="text-gray-700 font-semibold">Order #4829</span>
                  <span className="text-gray-400">-</span>
                  <span
                    className={`font-bold tracking-wide uppercase ${
                      orderStatus === 'DELIVERED' ? 'text-[#16a34a]' : 'text-blue-600'
                    }`}
                  >
                    {orderStatus}
                  </span>
                </div>
                <div className="pl-2 space-y-0.5 text-gray-600 text-[11px] font-medium">
                  <div>Canned Goods Pallets x 50</div>
                  <div>Dry Grocery Pallets x 20</div>
                </div>
                <div className="pt-2 text-[11px] text-gray-600 font-medium">
                  ETA: 2:30 PM | Truck: {trip?.vehicleId}
                </div>
              </div>
              {orderStatus === 'DELIVERED' && !showInspection && (
                <button
                  onClick={() => setShowInspection(true)}
                  className="mt-2.5 bg-[#059669] hover:bg-emerald-700 text-white font-semibold text-[11px] px-3 py-1.5 rounded-sm"
                >
                  Confirm Receipt & Inspect
                </button>
              )}
            </div>
            <button className="w-full bg-[#16a34a] hover:bg-green-700 text-white font-semibold text-xs sm:text-sm py-2 rounded-sm">
              Submit Daily Order
            </button>
          </section>
        </div>

        {showInspection && (
          <section className="bg-white border-2 border-gray-300 shadow-sm rounded-sm p-4 relative">
            <button
              onClick={() => setShowInspection(false)}
              className="absolute top-2 right-2 bg-[#dc2626] text-white hover:bg-red-700 w-6 h-6 flex items-center justify-center font-bold text-xs"
            >
              X
            </button>

            <div className="border-b border-gray-200 pb-2 mb-3">
              <h3 className="text-sm font-bold text-gray-800">Inspect &amp; Confirm Delivery</h3>
              <p className="text-xs text-gray-600 font-medium mt-0.5">
                Order #4829 | Vehicle: {trip?.vehicleId} | Driver: {trip?.driver}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index}>
                    <div className="text-xs font-semibold text-gray-700 mb-1">
                      {item.name} - Ordered: {item.ordered}
                    </div>
                    <div className="bg-[#d1d5db] p-2 rounded-sm text-xs space-y-1.5">
                      <label className="font-medium block">
                        Received Qty:{' '}
                        <input
                          type="number"
                          value={item.received}
                          onChange={(e) => updateItem(index, 'received', Number(e.target.value))}
                          className="w-16 h-6 bg-white border border-gray-400 px-1 rounded text-center ml-1"
                        />
                      </label>
                      <div className="flex items-center space-x-4">
                        <label className="inline-flex items-center space-x-1 cursor-pointer">
                          <input
                            type="radio"
                            checked={item.condition === 'good'}
                            onChange={() => updateItem(index, 'condition', 'good')}
                          />
                          <span>Good Condition</span>
                        </label>
                        <label className="inline-flex items-center space-x-1 cursor-pointer">
                          <input
                            type="radio"
                            checked={item.condition === 'damaged'}
                            onChange={() => updateItem(index, 'condition', 'damaged')}
                          />
                          <span>Damaged / Missing</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3 flex flex-col justify-between h-full">
                <div>
                  <p className="text-xs font-semibold text-gray-800 mb-2">Report Discrepancy / Damaged Goods</p>
                  <div className="w-28 h-24 bg-[#d1d5db] border border-dashed border-gray-400 rounded-sm flex items-center justify-center p-2 text-center cursor-pointer">
                    <span className="text-[11px] text-gray-700 font-medium">
                      Click or Drag to Upload Photo Evidence
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="space-y-1">
                    <canvas
                      ref={canvasRef}
                      width={192}
                      height={64}
                      className="w-48 h-16 border-b-2 border-black bg-[#f1f5f9] cursor-crosshair"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                    />
                    <div className="flex justify-between items-center w-48">
                      <span className="text-[11px] text-gray-800 font-semibold">Store Manager Signature</span>
                      <button onClick={clearSignature} className="text-[10px] text-red-600 hover:underline">
                        Clear
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={submitInspection}
                    className="bg-[#16a34a] hover:bg-green-700 text-white font-semibold text-xs px-4 py-2 rounded-sm"
                  >
                    Submit Confirmation & Log Issues
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default StoreManager;