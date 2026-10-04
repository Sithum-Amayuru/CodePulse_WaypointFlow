import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dispatcher from './pages/Dispatcher';
import Loader from './pages/Loader';
import Driver from './pages/Driver';
import StoreManager from './pages/StoreManager';

// Shown on every page except the login page
function LogoutButton() {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === '/') return null;

  const handleLogout = () => {
    try {
      // Only the sign-in is removed. The Driver's saved offline deliveries stay on the phone.
      localStorage.removeItem('waypointUser');
    } catch (e) {
      // storage not available: ignore
    }
    navigate('/');
  };

  return (
    <button
      onClick={handleLogout}
      className="fixed top-2 right-2 z-50 bg-white text-slate-800 border border-slate-300 shadow text-xs font-semibold px-3 py-1.5 rounded hover:bg-slate-100"
    >
      Logout
    </button>
  );
}

function App() {
  return (
    <BrowserRouter>
      <LogoutButton />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dispatcher" element={<Dispatcher />} />
        <Route path="/loader" element={<Loader />} />
        <Route path="/driver" element={<Driver />} />
        <Route path="/store-manager" element={<StoreManager />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;