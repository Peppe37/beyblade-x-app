import { useLocation } from 'react-router-dom';
import { Globe, Menu } from 'lucide-react';
import { useSettings } from '../../store';
import { t } from '../../types';

const PAGE_TITLES: Record<string, string> = {
  '/': 'home',
  '/bladers': 'bladers',
  '/beys': 'beys',
  '/arenas': 'arenas',
  '/tournaments': 'tournaments',
  '/settings': 'settings',
};

interface HeaderProps {
  onToggleSidebar: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { lang, setLang } = useSettings();
  const location = useLocation();
  const tr = t[lang];

  const path = '/' + location.pathname.split('/')[1];
  const titleKey = PAGE_TITLES[path] || 'home';
  const title = tr[titleKey] || titleKey;

  const toggleLang = () => setLang(lang === 'it' ? 'en' : 'it');

  return (
    <header className="header">
      <button
        className="hamburger-btn"
        onClick={onToggleSidebar}
        aria-label="Toggle menu"
      >
        <Menu size={22} />
      </button>
      <div className="header-title">{title}</div>
      <div className="header-right">
        <button
          onClick={toggleLang}
          className="btn btn-ghost btn-sm"
          title="Toggle language"
          id="lang-toggle"
        >
          <Globe size={14} />
          {lang.toUpperCase()}
        </button>
      </div>
    </header>
  );
}
