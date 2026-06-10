import { NavLink } from 'react-router-dom';
import {
  Home, Users, Disc3, MapPin, Trophy, Settings, Wifi, Swords, Wrench
} from 'lucide-react';
import { useSettings } from '../../store';
import { t } from '../../types';
import { getRemoteUrl } from '../../services/api';
import { useMemo } from 'react';

const NAV_ITEMS = [
  { to: '/', icon: Home, key: 'home' },
  { to: '/bladers', icon: Users, key: 'bladers' },
  { to: '/beys', icon: Disc3, key: 'beys' },
  { to: '/officina', icon: Wrench, key: 'officina' },
  { to: '/arenas', icon: MapPin, key: 'arenas' },
  { to: '/versus', icon: Swords, key: 'versus' },
  { to: '/tournaments', icon: Trophy, key: 'tournaments' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { lang } = useSettings();
  const tr = t[lang];
  const serverUrl = getRemoteUrl();

  const displayHost = useMemo(() => {
    try {
      const url = new URL(serverUrl);
      return url.host; // e.g. "beyblade.printingarage.it" or "127.0.0.1:7878"
    } catch {
      return '127.0.0.1';
    }
  }, [serverUrl]);

  return (
    <>
    <div
      className={`sidebar-overlay${isOpen ? ' sidebar-overlay--visible' : ''}`}
      onClick={onClose}
    />
    <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`} onClick={e => e.stopPropagation()}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <div className="bey-spin-icon" />
        </div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-title">BEYBLADE X</span>
          <span className="sidebar-logo-sub">Tournament</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={onClose}
          >
            <div className="nav-indicator" />
            <span className="nav-item-icon"><Icon size={18} /></span>
            <span className="nav-item-label">{tr[key]}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer with IP */}
      <div className="sidebar-footer">
        <div
          className="nav-item"
          style={{ cursor: 'default', fontSize: '0.78rem' }}
        >
          <span className="nav-item-icon"><Wifi size={16} color="var(--success)" /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Orbitron' }}>Server</span>
            <span style={{ color: 'var(--success)', fontFamily: 'Orbitron', fontSize: '0.7rem', wordBreak: 'break-all' }}>{displayHost}</span>
          </div>
        </div>
        <NavLink to="/settings" className="nav-item" style={{ marginTop: 4 }} onClick={onClose}>
          <div className="nav-indicator" />
          <span className="nav-item-icon"><Settings size={18} /></span>
          <span className="nav-item-label">{tr.settings}</span>
        </NavLink>
      </div>
    </aside>
    </>
  );
}
