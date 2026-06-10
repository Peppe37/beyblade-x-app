import { useState } from 'react';
import { useSettings } from '../store';
import { t } from '../types';
import { Globe, Wifi, QrCode, Copy, Check, Database } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getBackendMode, getRemoteUrl } from '../services/api';

export default function Settings() {
  const { lang, setLang, localIp } = useSettings();
  const tr = t[lang];
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'lobby'>('home');

  const backendMode = getBackendMode();
  const remoteUrl = getRemoteUrl();
  const homeUrl = backendMode === 'remote' ? `${remoteUrl.replace(/\/$/, '')}/` : `http://${localIp || '127.0.0.1'}:7878/`;
  const lobbyUrl = backendMode === 'remote' ? `${remoteUrl.replace(/\/$/, '')}/lobby` : `http://${localIp || '127.0.0.1'}:7878/lobby`;
  const currentUrl = activeTab === 'home' ? homeUrl : lobbyUrl;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="page-inner animate-fade-in">
      <h1 className="page-title">{tr.settings || 'Impostazioni'}</h1>
      
      <div className="grid-2" style={{ gap: 24, marginTop: 24, alignItems: 'start' }}>
        {/* Left Column: Language and Server Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <div className="flex items-center gap-sm mb-md">
              <Globe size={20} color="var(--primary)" />
              <h2 style={{ fontFamily: 'Orbitron', fontSize: '1rem', marginBottom: 0 }}>{lang === 'it' ? 'Lingua' : 'Language'}</h2>
            </div>
            
            <div className="flex gap-sm">
              <button 
                className={`btn ${lang === 'it' ? 'btn-primary' : 'btn-secondary'} flex-1`}
                onClick={() => setLang('it')}
              >
                Italiano
              </button>
              <button 
                className={`btn ${lang === 'en' ? 'btn-primary' : 'btn-secondary'} flex-1`}
                onClick={() => setLang('en')}
              >
                English
              </button>
            </div>
          </div>

          <div className="card animate-fade-in">
            <div className="flex items-center gap-sm mb-md">
              <Database size={20} color="var(--accent)" />
              <h2 style={{ fontFamily: 'Orbitron', fontSize: '1rem', marginBottom: 0 }}>
                {lang === 'it' ? 'Configurazione Backend' : 'Backend Configuration'}
              </h2>
            </div>
            
            <div style={{ background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                {lang === 'it' ? 'Stato Connessione' : 'Connection Status'}
              </div>
              <div style={{ fontFamily: 'Orbitron', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>
                {lang === 'it' ? 'Connesso a Server' : 'Connected to Server'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'Orbitron', wordBreak: 'break-all' }}>
                {remoteUrl}
              </div>
            </div>
            
            <button 
              className="btn btn-secondary animate-pulse" 
              style={{ width: '100%', borderColor: 'var(--danger)', color: 'var(--danger)', background: 'transparent' }}
              onClick={() => {
                localStorage.removeItem('remote_backend_url');
                localStorage.removeItem('remember_url');
                window.location.reload();
              }}
            >
              {lang === 'it' ? 'Disconnetti / Cambia Indirizzo' : 'Disconnect / Switch Address'}
            </button>
          </div>

          <div className="card">
            <div className="flex items-center gap-sm mb-md">
              <Wifi size={20} color="var(--success)" />
              <h2 style={{ fontFamily: 'Orbitron', fontSize: '1rem', marginBottom: 0 }}>Network Server</h2>
            </div>
            
            <div style={{ background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                {lang === 'it' ? 'Indirizzo IP Locale' : 'Local IP Address'}
              </div>
              <div style={{ fontFamily: 'Orbitron', color: 'var(--success)', fontWeight: 700 }}>
                {localIp || '127.0.0.1'}
              </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 12 }}>
              {lang === 'it' 
                ? 'I dispositivi mobili devono essere collegati alla stessa rete WiFi di questo computer.' 
                : 'Mobile devices must be connected to the same WiFi network as this computer.'}
            </p>
          </div>

        </div>

        {/* Right Column: QR Code Connection */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="flex items-center gap-sm">
            <QrCode size={20} color="var(--primary)" />
            <h2 style={{ fontFamily: 'Orbitron', fontSize: '1rem', marginBottom: 0 }}>
              {lang === 'it' ? 'Connetti Dispositivo' : 'Connect Device'}
            </h2>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 0 }}>
            {lang === 'it'
              ? 'Scansiona il codice QR per accedere rapidamente dal tuo smartphone o tablet.'
              : 'Scan the QR code to quickly access from your smartphone or tablet.'}
          </p>

          {/* Connection tabs */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', padding: 4, borderRadius: 8, gap: 4 }}>
            <button
              onClick={() => setActiveTab('home')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === 'home' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'home' ? 'var(--background)' : 'var(--text-muted)',
                fontFamily: 'Orbitron',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {lang === 'it' ? 'Sito Home' : 'Home Site'}
            </button>
            <button
              onClick={() => setActiveTab('lobby')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === 'lobby' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'lobby' ? 'var(--background)' : 'var(--text-muted)',
                fontFamily: 'Orbitron',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Lobby Mobile
            </button>
          </div>

          {/* QR Code Container */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            background: 'var(--surface-2)',
            padding: 20,
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <div style={{
              background: '#ffffff',
              padding: 12,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}>
              <QRCodeSVG
                value={currentUrl}
                size={160}
                bgColor="#ffffff"
                fgColor="#0a0a1a"
                level="H"
              />
            </div>

            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-3)', padding: '6px 10px', borderRadius: 6 }}>
              <span style={{ flex: 1, fontFamily: 'Orbitron', fontSize: '0.65rem', color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUrl}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={copyUrl} style={{ padding: 4, flexShrink: 0 }}>
                {copied ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
