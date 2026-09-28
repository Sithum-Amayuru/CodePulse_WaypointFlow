import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SEEDED_ACCOUNTS = [
  { email: 'dispatcher@waypoint.lk', password: 'password123', role: 'Dispatcher', path: '/dispatcher' },
  { email: 'loader@waypoint.lk', password: 'password123', role: 'Loader', path: '/loader' },
  { email: 'driver@waypoint.lk', password: 'password123', role: 'Driver', path: '/driver' },
  { email: 'storemanager@waypoint.lk', password: 'password123', role: 'Store Manager', path: '/store-manager' },
];

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    const account = SEEDED_ACCOUNTS.find(
      (a) => a.email === email.trim().toLowerCase() && a.password === password
    );

    if (account) {
      localStorage.setItem('waypointUser', JSON.stringify(account));
      navigate(account.path);
    } else {
      setError('Invalid email or password. Try one of the seeded accounts below.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-blue-900">Waypoint Logistics</p>
          <p className="text-gray-500 text-sm mt-1">Sign in to your dashboard</p>
        </div>

        <form onSubmit={handleLogin}>
          <label className="text-sm font-medium block mb-1">Email</label>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded p-2 mb-4 text-sm"
            placeholder="dispatcher@waypoint.lk"
          />

          <label className="text-sm font-medium block mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded p-2 mb-4 text-sm"
            placeholder="password123"
          />

          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          <button
            type="submit"
            className="bg-blue-900 text-white w-full py-2.5 rounded-lg font-semibold"
          >
            Sign In
          </button>
        </form>

        <div className="mt-6 border-t pt-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">SEEDED TEST ACCOUNTS</p>
          {SEEDED_ACCOUNTS.map((a) => (
            <p key={a.email} className="text-xs text-gray-600">
              {a.role}: <span className="font-mono">{a.email}</span> / <span className="font-mono">password123</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Login;