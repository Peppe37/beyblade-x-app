import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Bladers from './pages/Bladers';
import Beys from './pages/Beys';
import Arenas from './pages/Arenas';
import Tournaments from './pages/Tournaments';
import TournamentDetail from './pages/TournamentDetail';
import Settings from './pages/Settings';
import Versus from './pages/Versus';

import { useSettings, useToast } from './store';
import { CheckCircle, XCircle, Info } from 'lucide-react';

export default function App() {
  const { fetchLocalIp } = useSettings();
  const { toasts, removeToast } = useToast();

  useEffect(() => {
    fetchLocalIp();
  }, []);

  return (
    <>
      <div className="bg-grid" />
      <div className="bg-orbs">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
      </div>

      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/bladers" element={<Bladers />} />
          <Route path="/beys" element={<Beys />} />
          <Route path="/arenas" element={<Arenas />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournaments/:id" element={<TournamentDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/versus" element={<Versus />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>

      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            onClick={() => removeToast(t.id)}
            style={{ cursor: 'pointer' }}
          >
            {t.type === 'success' && <CheckCircle size={18} color="var(--success)" />}
            {t.type === 'error' && <XCircle size={18} color="var(--danger)" />}
            {t.type === 'info' && <Info size={18} color="var(--primary)" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
