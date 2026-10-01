import { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:3000';
const OUTLET_KEY = 'waypoint_store_outlet';

// Demo item catalogue (names and unit sizes are demo values, edit freely).
// unitKg = weight of one unit, unitM3 = volume of one unit.
const CATALOG = {
  Fresh: {
    ambient: [
      { key: 'fresh-a1', name: 'Canned Goods Crate', unitKg: 20, unitM3: 0.05 },
      { key: 'fresh-a2', name: 'Dry Grocery Sack', unitKg: 25, unitM3: 0.06 },
      { key: 'fresh-a3', name: 'Bottled Beverages Crate', unitKg: 15, unitM3: 0.04 },
    ],
    chilled: [
      { key: 'fresh-c1', name: 'Dairy Crate', unitKg: 12, unitM3: 0.04 },
      { key: 'fresh-c2', name: 'Fresh Produce Crate', unitKg: 15, unitM3: 0.05 },
      { key: 'fresh-c3', name: 'Chilled Meat & Fish Box', unitKg: 10, unitM3: 0.03 },
    ],
  },
  Style: {
    ambient: [
      { key: 'style-a1', name: 'T-Shirts Carton', unitKg: 8, unitM3: 0.08 },
      { key: 'style-a2', name: 'Denim Carton', unitKg: 14, unitM3: 0.1 },
      { key: 'style-a3', name: 'Footwear Carton', unitKg: 10, unitM3: 0.09 },
    ],
    chilled: [],
  },
  Tech: {
    ambient: [
      { key: 'tech-a1', name: 'Mobile Phones Carton', unitKg: 6, unitM3: 0.03 },
      { key: 'tech-a2', name: 'Accessories Carton', unitKg: 5, unitM3: 0.04 },
      { key: 'tech-a3', name: 'Laptops Carton', unitKg: 12, unitM3: 0.05 },
    ],
    chilled: [],
  },
};

const STATUS_TEXT = {
  PENDING: 'SUBMITTED - AWAITING DISPATCHER',
  ALLOCATED: 'PLANNED BY DISPATCHER',
  OVER_CAPACITY: 'WAITING FOR CAPACITY',
  ASSIGNED: 'ASSIGNED TO A TRUCK',
  LOADED: 'LOADED - ON THE WAY',
  DELIVERED: 'DELIVERED - PLEASE INSPECT',
  RECEIVED: 'RECEIVED',
  DEFERRED: 'DEFERRED',
};

const STATUS_COLOR = {
  PENDING: 'text-slate-600',
  ALLOCATED: 'text-blue-600',
  OVER_CAPACITY: 'text-red-600',
  ASSIGNED: 'text-blue-700',
  LOADED: 'text-indigo-700',
  DELIVERED: 'text-amber-600',
  RECEIVED: 'text-[#16a34a]',
  DEFERRED: 'text-amber-700',
};

function readOutlet() {
  try {
    return localStorage.getItem(OUTLET_KEY) || '';
  } catch (e) {
    return '';
  }
}

function saveOutlet(value) {
  try {
    localStorage.setItem(OUTLET_KEY, value);
  } catch (e) {
    // ignore
  }
}

function cutoffInfo(now) {
  const cutoff = new Date(now);
  cutoff.setHours(16, 0, 0, 0);
  const diff = cutoff - now;
  if (diff <= 0) return { passed: true, text: 'Cutoff passed' };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return {
    passed: false,
    text: `Remaining Time: ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`,
  };
}

function StoreManager() {
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ambient');
  const [qtyInputs, setQtyInputs] = useState({});
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const [inspect, setInspect] = useState(null); // { order, items }
  const [note, setNote] = useState('');
  const [signed, setSigned] = useState(false);

  const canvasRef = useRef(null);
  const isDrawing = useRef(false);

  const fetchOrders = () =>
    fetch(`${API}/api/orders`)
      .then((res) => res.json())
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => {});

  useEffect(() => {
    fetch(`${API}/api/outlet-options`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setOutlets(list);
        const saved = readOutlet();
        const start = list.find((o) => o.outletId === saved) || list[0];
        if (start) setOutletId(start.outletId);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not reach the server.');
        setLoading(false);
      });

    fetchOrders();
    const timer = setInterval(fetchOrders, 5000);
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, []);

  const outlet = outlets.find((o) => o.outletId === outletId);
  const brand = outlet ? outlet.brand : 'Fresh';
  const catalog = CATALOG[brand] || CATALOG.Fresh;
  const chilledAvailable = catalog.chilled.length > 0;
  const activeTab = tab === 'chilled' && !chilledAvailable ? 'ambient' : tab;
  const itemList = catalog[activeTab];

  const changeOutlet = (id) => {
    setOutletId(id);
    saveOutlet(id);
    setCart([]);
    setTab('ambient');
    setMessage('');
    setError('');
    setInspect(null);
  };

  // ---- Cart ----
  const addToCart = (item) => {
    const q = Math.min(1000, Math.max(1, parseInt(qtyInputs[item.key] ?? 1, 10) || 1));
    setCart((prev) => {
      const existing = prev.find((l) => l.key === item.key);
      if (existing) {
        return prev.map((l) =>
          l.key === item.key ? { ...l, qty: Math.min(1000, (Number(l.qty) || 0) + q) } : l
        );
      }
      return [
        ...prev,
        {
          key: item.key,
          name: item.name,
          temp: activeTab,
          qty: q,
          unitKg: item.unitKg,
          unitM3: item.unitM3,
        },
      ];
    });
    setMessage('');
    setError('');
  };

  const setLineQty = (key, raw) => {
    if (raw === '') {
      setCart((prev) => prev.map((l) => (l.key === key ? { ...l, qty: '' } : l)));
      return;
    }
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    setCart((prev) =>
      prev.map((l) => (l.key === key ? { ...l, qty: Math.min(1000, Math.max(1, n)) } : l))
    );
  };

  const fixLineQty = (key) => {
    setCart((prev) =>
      prev.map((l) => (l.key === key && !(Number(l.qty) >= 1) ? { ...l, qty: 1 } : l))
    );
  };

  const stepLine = (key, delta) => {
    setCart((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, qty: Math.min(1000, Math.max(1, (Number(l.qty) || 1) + delta)) }
          : l
      )
    );
  };

  const removeLine = (key) => setCart((prev) => prev.filter((l) => l.key !== key));

  const cartKg = cart.reduce((s, l) => s + (Number(l.qty) || 0) * l.unitKg, 0);
  const cartM3 = cart.reduce((s, l) => s + (Number(l.qty) || 0) * l.unitM3, 0);

  const submitOrder = async () => {
    if (cart.length === 0) {
      setError('Your cart is empty. Add items first.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    const created = [];
    try {
      for (const temp of ['ambient', 'chilled']) {
        const lines = cart.filter((l) => l.temp === temp);
        if (lines.length === 0) continue;
        const res = await fetch(`${API}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outletId,
            temp,
            items: lines.map((l) => ({
              name: l.name,
              qty: Math.max(1, parseInt(l.qty, 10) || 1),
              unitWeightKg: l.unitKg,
              unitVolumeM3: l.unitM3,
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not submit the order.');
        created.push(data.orderId);
        setCart((prev) => prev.filter((l) => l.temp !== temp));
      }
      setMessage(`Submitted to the Dispatcher: ${created.map((id) => '#' + id).join(', ')}`);
      await fetchOrders();
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  // ---- Receipt / inspection ----
  const openInspect = (order) => {
    const items =
      order.items && order.items.length > 0
        ? order.items.map((i) => ({
            name: i.name,
            ordered: i.qty,
            received: i.qty,
            condition: 'good',
          }))
        : [
            {
              name: `${order.brand} ${order.temp} order (${Math.round(Number(order.weightKg))} kg)`,
              ordered: 1,
              received: 1,
              condition: 'good',
            },
          ];
    setInspect({ order, items });
    setNote('');
    setSigned(false);
    setError('');
  };

  const updateItem = (index, field, value) => {
    setInspect((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  };

  const canvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e) => {
    isDrawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const p = canvasPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const p = canvasPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setSigned(true);
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearSignature = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setSigned(false);
  };

  const submitInspection = async () => {
    if (!signed) {
      setError('Please sign in the signature box before submitting.');
      return;
    }
    const items = inspect.items.map((i) => ({
      ...i,
      received: Number(i.received) || 0,
    }));
    const hasIssue = items.some((i) => i.condition === 'damaged' || i.received !== i.ordered);
    try {
      const res = await fetch(`${API}/api/orders/${inspect.order.orderId}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition: hasIssue ? 'damaged' : 'good', items, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not confirm receipt.');
      setMessage(
        hasIssue
          ? `Receipt confirmed for #${inspect.order.orderId}. Discrepancies were logged for the Dispatcher.`
          : `Receipt confirmed for #${inspect.order.orderId}.`
      );
      setInspect(null);
      setError('');
      await fetchOrders();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="p-10 font-medium">Loading store manager dashboard...</div>;

  const myOrders = orders
    .filter((o) => o.outletId === outletId && (o.source === 'store' || o.status !== 'PENDING'))
    .reverse()
    .slice(0, 10);

  const cutoff = cutoffInfo(now);

  return (
    <div className="bg-[#f8fafc] text-gray-800 min-h-screen pb-12">
      <header className="bg-[#1e3a6a] text-white px-6 py-3 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center text-sm gap-2">
          <div className="flex items-center space-x-2 font-medium tracking-wide">
            <span className="text-base font-semibold">Waypoint Logistics</span>
            <span className="text-blue-200">|</span>
            <span className="text-slate-200">Store Manager Portal</span>
          </div>
          <div className="flex items-center gap-2 text-slate-100 font-medium tracking-wide">
            <span>Outlet:</span>
            <select
              value={outletId}
              onChange={(e) => changeOutlet(e.target.value)}
              className="bg-[#1e3a6a] text-white border border-blue-300 rounded px-2 py-1 text-xs"
            >
              {outlets.map((o) => (
                <option key={o.outletId} value={o.outletId}>
                  {o.outletId} - {o.district} ({o.brand})
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        <div className="w-full bg-[#fef2f2] border border-[#fca5a5] rounded-sm py-2 px-4 text-center">
          <p className="text-[#dc2626] font-semibold text-xs sm:text-sm tracking-wide uppercase">
            DAILY ORDER CUTOFF: 4:00 PM{' '}
            <span className="normal-case font-medium">({cutoff.text})</span>
          </p>
        </div>

        {message && (
          <div className="bg-green-50 border border-green-300 text-green-800 text-xs rounded-sm px-3 py-2">
            {message}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 text-xs rounded-sm px-3 py-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Select items */}
          <section className="md:col-span-7 bg-white border border-gray-200 shadow-sm p-4 rounded-sm">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Select Items to Order</h2>
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => setTab('ambient')}
                className={`font-medium text-xs px-8 py-1.5 rounded-sm ${
                  activeTab === 'ambient'
                    ? 'bg-[#d1d5db] text-gray-800'
                    : 'bg-transparent text-gray-500'
                }`}
              >
                Ambient Items
              </button>
              <button
                onClick={() => chilledAvailable && setTab('chilled')}
                disabled={!chilledAvailable}
                title={chilledAvailable ? '' : 'Chilled items are only available for Fresh outlets'}
                className={`font-medium text-xs px-6 py-1.5 rounded-sm ${
                  activeTab === 'chilled'
                    ? 'bg-[#d1d5db] text-gray-800'
                    : 'bg-transparent text-gray-500'
                } ${!chilledAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                Chilled Items
              </button>
            </div>
            {!chilledAvailable && (
              <p className="text-[11px] text-gray-500 mb-3">
                Chilled items are only available for Fresh outlets. This outlet is a {brand} outlet.
              </p>
            )}
            <div className="space-y-2.5">
              {itemList.map((item) => (
                <div
                  key={item.key}
                  className="border border-gray-300 bg-[#e5e7eb] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs rounded-sm"
                >
                  <div>
                    <span className="font-medium">{item.name}</span>
                    <div className="text-[10px] text-gray-600">
                      {item.unitKg} kg · {item.unitM3} m³ per unit
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-medium">
                      Qty:
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={qtyInputs[item.key] ?? 1}
                        onChange={(e) => setQtyInputs((p) => ({ ...p, [item.key]: e.target.value }))}
                        className="w-16 h-6 bg-white border border-gray-400 px-1 rounded text-center ml-1"
                      />
                    </label>
                    <button
                      onClick={() => addToCart(item)}
                      className="bg-[#2563eb] hover:bg-blue-700 text-white font-medium text-xs px-4 py-1 rounded"
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Cart */}
          <section className="md:col-span-5 bg-white border border-gray-200 shadow-sm p-4 rounded-sm flex flex-col justify-between space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-2">
                Your Cart {cart.length > 0 && <span className="text-gray-500">({cart.length})</span>}
              </h2>
              {cart.length === 0 ? (
                <p className="text-xs text-gray-500">
                  Your cart is empty. Choose items on the left and press Add to Cart.
                </p>
              ) : (
                <div className="space-y-2">
                  {cart.map((l) => (
                    <div key={l.key} className="border border-gray-200 rounded-sm px-2 py-1.5 text-xs">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="font-semibold">{l.name}</div>
                          <div className="text-[10px] text-gray-500 uppercase">{l.temp}</div>
                        </div>
                        <button
                          onClick={() => removeLine(l.key)}
                          title="Remove from cart"
                          className="text-red-600 hover:text-red-800 text-[11px] font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <button
                          onClick={() => stepLine(l.key, -1)}
                          className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded font-bold"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={l.qty}
                          onChange={(e) => setLineQty(l.key, e.target.value)}
                          onBlur={() => fixLineQty(l.key)}
                          className="w-16 h-6 bg-white border border-gray-400 px-1 rounded text-center"
                        />
                        <button
                          onClick={() => stepLine(l.key, 1)}
                          className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded font-bold"
                        >
                          +
                        </button>
                        <span className="text-[10px] text-gray-500 ml-2">
                          {Math.round((Number(l.qty) || 0) * l.unitKg)} kg
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="text-[11px] font-semibold text-gray-700 pt-1">
                    Total: {Math.round(cartKg)} kg · {cartM3.toFixed(2)} m³
                  </div>
                  {cart.some((l) => l.temp === 'ambient') && cart.some((l) => l.temp === 'chilled') && (
                    <p className="text-[10px] text-gray-500">
                      Ambient and chilled items are sent as two separate orders (chilled goods need a
                      refrigerated vehicle).
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={submitOrder}
              disabled={submitting || cart.length === 0}
              className="w-full bg-[#16a34a] hover:bg-green-700 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm py-2 rounded-sm transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Daily Order'}
            </button>
          </section>
        </div>

        {/* My orders and deliveries */}
        <section className="bg-white border border-gray-200 shadow-sm p-4 rounded-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">My Orders &amp; Deliveries</h2>
          {myOrders.length === 0 ? (
            <p className="text-xs text-gray-500">
              No orders yet for this outlet. Submit a daily order to see it here.
            </p>
          ) : (
            <div className="space-y-2.5">
              {myOrders.map((o) => (
                <div
                  key={o.orderId}
                  className="border border-gray-200 rounded-sm px-3 py-2 text-xs flex flex-wrap justify-between items-start gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-gray-700 font-semibold">Order #{o.orderId}</span>
                      <span className="text-gray-400">-</span>
                      <span
                        className={`font-bold tracking-wide uppercase ${
                          STATUS_COLOR[o.status] || 'text-gray-600'
                        }`}
                      >
                        {STATUS_TEXT[o.status] || o.status}
                      </span>
                    </div>
                    <div className="pl-2 text-gray-600 text-[11px] font-medium">
                      {o.items && o.items.length > 0 ? (
                        o.items.map((i) => (
                          <div key={i.name}>
                            {i.name} x {i.qty}
                          </div>
                        ))
                      ) : (
                        <div>
                          {o.brand} · {o.temp} · {Math.round(Number(o.weightKg))} kg
                        </div>
                      )}
                    </div>
                    {o.vehicleId && (
                      <div className="text-[11px] text-gray-600 font-medium pt-0.5">
                        Truck: {o.vehicleId} · Trip {o.tripId}
                      </div>
                    )}
                    {o.reason && (o.status === 'DEFERRED' || o.status === 'OVER_CAPACITY') && (
                      <div className="text-[11px] text-red-600 italic">{o.reason}</div>
                    )}
                    {o.status === 'RECEIVED' && o.receipt && (
                      <div className="text-[11px] text-gray-600">
                        Receipt: {o.receipt.condition === 'damaged' ? 'issues logged' : 'all good'}
                      </div>
                    )}
                  </div>
                  {o.status === 'DELIVERED' && (
                    <button
                      onClick={() => openInspect(o)}
                      className="bg-[#059669] hover:bg-emerald-700 text-white font-semibold text-[11px] px-3 py-1.5 rounded-sm transition-colors"
                    >
                      Confirm Receipt &amp; Inspect
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Inspection panel */}
        {inspect && (
          <section className="bg-white border-2 border-gray-300 shadow-sm rounded-sm p-4 relative">
            <button
              onClick={() => setInspect(null)}
              className="absolute top-2 right-2 bg-[#dc2626] text-white hover:bg-red-700 w-6 h-6 flex items-center justify-center font-bold text-xs rounded-sm"
            >
              ✕
            </button>

            <div className="border-b border-gray-200 pb-2 mb-3">
              <h3 className="text-sm font-bold text-gray-800">Inspect &amp; Confirm Delivery</h3>
              <p className="text-xs text-gray-600 font-medium mt-0.5">
                Order #{inspect.order.orderId} | Vehicle: {inspect.order.vehicleId} | Trip{' '}
                {inspect.order.tripId}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-4">
                {inspect.items.map((item, index) => (
                  <div key={index}>
                    <div className="text-xs font-semibold text-gray-700 mb-1">
                      {item.name} - Ordered: {item.ordered}
                    </div>
                    <div className="bg-[#d1d5db] p-2 rounded-sm text-xs space-y-1.5">
                      <label className="font-medium block">
                        Received Qty:{' '}
                        <input
                          type="number"
                          min="0"
                          value={item.received}
                          onChange={(e) => updateItem(index, 'received', e.target.value)}
                          className="w-16 h-6 bg-white border border-gray-400 px-1 rounded text-center ml-1"
                        />
                      </label>
                      <div className="flex items-center space-x-4">
                        <label className="inline-flex items-center space-x-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`condition-${index}`}
                            checked={item.condition === 'good'}
                            onChange={() => updateItem(index, 'condition', 'good')}
                          />
                          <span>Good Condition</span>
                        </label>
                        <label className="inline-flex items-center space-x-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`condition-${index}`}
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
                  <p className="text-xs font-semibold text-gray-800 mb-2">
                    Report Discrepancy / Damaged Goods
                  </p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Describe any damage or missing items (optional)"
                    className="w-full h-16 border border-gray-300 rounded-sm p-2 text-xs"
                  />
                  <button
                    onClick={() => alert('Photo evidence upload is not available in this demo yet.')}
                    className="mt-2 w-28 h-14 bg-[#d1d5db] border border-dashed border-gray-400 rounded-sm flex items-center justify-center p-2 text-center"
                  >
                    <span className="text-[11px] text-gray-700 font-medium">Add Photo Evidence</span>
                  </button>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="space-y-1">
                    <canvas
                      ref={canvasRef}
                      width={192}
                      height={64}
                      style={{ touchAction: 'none' }}
                      className="w-48 h-16 border-b-2 border-black bg-[#f1f5f9] cursor-crosshair"
                      onPointerDown={startDrawing}
                      onPointerMove={draw}
                      onPointerUp={stopDrawing}
                      onPointerLeave={stopDrawing}
                    />
                    <div className="flex justify-between items-center w-48">
                      <span className="text-[11px] text-gray-800 font-semibold">
                        Store Manager Signature
                      </span>
                      <button onClick={clearSignature} className="text-[10px] text-red-600 hover:underline">
                        Clear
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={submitInspection}
                    className="bg-[#16a34a] hover:bg-green-700 text-white font-semibold text-xs px-4 py-2 rounded-sm"
                  >
                    Submit Confirmation &amp; Log Issues
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