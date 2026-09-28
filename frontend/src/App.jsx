import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dispatcher from './pages/Dispatcher';
import Loader from './pages/Loader';
import Driver from './pages/Driver';
import StoreManager from './pages/StoreManager';

function App() {
  return (
    <BrowserRouter>
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