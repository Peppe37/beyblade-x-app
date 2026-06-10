import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
import { CheckCircle, XCircle, Info, Database, Globe, ArrowRight, ShieldAlert } from 'lucide-react';
import { isTauri } from './services/api';

export default function App() {
  const { fetchLocalIp, lang } = useSettings();
  const { toasts, removeToast, addToast } = useToast();

  const [backendConfigured, setBackendConfigured] = useState(() => {
    if (!isTauri()) return true;
    return localStorage.getItem('remote_backend_url') !== null;
  });

  const [remoteUrl, setRemoteUrl] = useState(() => {
    const saved = localStorage.getItem('remote_backend_url');
    const remember = localStorage.getItem('remember_url') === 'true';
    return remember && saved ? saved : 'http://127.0.0.1:7878';
  });
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('remember_url') !== 'false'; // default to true
  });
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    fetchLocalIp();
  }, []);

  const connectToBackend = async (url: string, isPreset: boolean = false) => {
    setConnecting(true);
    setConnectionError('');

    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }
    targetUrl = targetUrl.replace(/\/$/, '');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${targetUrl}/health`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Status ${res.status}`);
      }
      const data = await res.json();
      if (data?.status === 'ok' || data?.app === 'BeybladeX') {
        localStorage.setItem('remote_backend_url', targetUrl);
        localStorage.setItem('remember_url', rememberMe || isPreset ? 'true' : 'false');
        setBackendConfigured(true);
        addToast(lang === 'it' ? 'Connessione stabilita con successo!' : 'Connection established successfully!', 'success');
      } else {
        throw new Error(lang === 'it' ? 'Risposta del server non valida' : 'Invalid server response');
      }
    } catch (err: any) {
      console.error(err);
      setConnectionError(
        lang === 'it'
          ? `Impossibile connettersi: ${err.message || err.toString()}`
          : `Failed to connect: ${err.message || err.toString()}`
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleLocalConnect = () => {
    connectToBackend('http://127.0.0.1:7878', true);
  };

  const handleRemoteConnect = (e: React.FormEvent) => {
    e.preventDefault();
    connectToBackend(remoteUrl, false);
  };

  return (
    <>
      <div className="bg-grid" />
      <div className="bg-orbs">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
      </div>

      {!backendConfigured ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
          position: 'relative',
          zIndex: 10,
        }} className="animate-fade-in">
          <div style={{
            width: '100%',
            maxWidth: 580,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: 32,
            boxShadow: 'var(--shadow-neon)',
            textAlign: 'center',
          }} className="glass-panel">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
              <div className="bey-spin-icon" style={{ width: 44, height: 44 }} />
              <div>
                <h1 style={{ fontFamily: 'Orbitron', fontSize: '1.6rem', fontWeight: 900, color: 'white', margin: 0 }}>BEYBLADE X</h1>
                <p style={{ fontFamily: 'Orbitron', fontSize: '0.65rem', color: 'var(--secondary)', letterSpacing: 3, textTransform: 'uppercase', margin: 0 }}>
                  Tournament Manager
                </p>
              </div>
            </div>

            <h2 style={{ fontSize: '1.1rem', fontFamily: 'Orbitron', color: 'var(--text)', marginBottom: 24, textTransform: 'uppercase' }}>
              {lang === 'it' ? 'Configurazione Connessione Backend' : 'Backend Connection Setup'}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
              {/* Option 1: Local Backend Server */}
              <div className="card card-interactive" style={{ padding: 24, cursor: 'pointer', textAlign: 'left' }} onClick={handleLocalConnect} id="btn-select-local">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--primary)', padding: 12, borderRadius: 12 }}>
                    <Database size={24} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', color: 'var(--primary)', margin: '0 0 6px 0' }}>
                      {lang === 'it' ? 'Connetti a Server Locale' : 'Connect to Local Server'}
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
                      {lang === 'it'
                        ? 'Collega l\'applicazione al backend in esecuzione su questa stessa macchina (http://localhost:7878).'
                        : 'Connects the application to the backend running locally on this machine (http://localhost:7878).'}
                    </p>
                  </div>
                  <ArrowRight size={20} style={{ alignSelf: 'center', color: 'var(--text-muted)' }} />
                </div>
              </div>

              {/* Option 2: Remote Connection */}
              <div className="card" style={{ padding: 24, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
                  <div style={{ background: 'rgba(255,215,0,0.1)', color: 'var(--accent)', padding: 12, borderRadius: 12 }}>
                    <Globe size={24} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', color: 'var(--accent)', margin: '0 0 6px 0' }}>
                      {lang === 'it' ? 'Connetti a Server Remoto' : 'Connect to Remote Server'}
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
                      {lang === 'it'
                        ? 'Collega l\'applicazione a un indirizzo server personalizzato (es. host remoto o altro PC in rete).'
                        : 'Connects the application to a custom server address (e.g., remote host or another PC in network).'}
                    </p>
                  </div>
                </div>

                <form onSubmit={handleRemoteConnect} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>
                      {lang === 'it' ? 'Indirizzo URL del Server' : 'Server URL Address'}
                    </label>
                    <input
                      className="form-input"
                      placeholder="E.g. http://192.168.1.100:7878"
                      value={remoteUrl}
                      onChange={(e) => setRemoteUrl(e.target.value)}
                      disabled={connecting}
                      id="remote-url-input"
                      required
                      style={{ fontSize: '0.85rem' }}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={connecting}
                    />
                    {lang === 'it' ? 'Ricorda questo URL' : 'Remember this URL'}
                  </label>

                  {connectionError && (
                    <div style={{
                      display: 'flex', gap: 8, padding: '10px 14px', background: 'rgba(255,51,102,0.1)',
                      border: '1px solid rgba(255,51,102,0.2)', borderRadius: 8, color: 'var(--danger)', fontSize: '0.75rem', lineHeight: 1.4
                    }}>
                      <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                      <span>{connectionError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--bg-dark)', width: '100%', marginTop: 8 }}
                    disabled={connecting}
                    id="btn-connect-remote"
                  >
                    {connecting ? (
                      <span className="flex items-center justify-center gap-sm">
                        <div className="spinner spinner-xs" style={{ borderColor: 'var(--bg-dark) transparent var(--bg-dark) transparent' }} />
                        {lang === 'it' ? 'Connessione...' : 'Connecting...'}
                      </span>
                    ) : (
                      <>
                        <Globe size={16} />
                        {lang === 'it' ? 'Connetti' : 'Connect'}
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : (
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
      )}

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
