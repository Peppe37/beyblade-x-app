import { useEffect, useState, useMemo } from 'react';
import { Search, Wrench, CheckSquare, Square, User, LogOut, Disc3 } from 'lucide-react';
import { useSettings, useBladers, useParts } from '../store';
import { Part } from '../types';
import { api } from '../services/api';

const TYPE_ORDER = ['blade', 'ratchet', 'bit', 'assist_blade', 'lock_chip', 'over_blade'];
const TYPE_LABELS: Record<string, string> = {
  blade: 'Blade', ratchet: 'Ratchet', bit: 'Bit',
  assist_blade: 'Assist Blade', lock_chip: 'Lock Chip', over_blade: 'Over Blade',
};

export default function Officina() {
  const { lang, currentBladerId, setCurrentBlader } = useSettings();
  const { bladers, fetchBladers } = useBladers();
  const { parts, ownedPartIds, loading, fetchParts, fetchOwnedParts, toggleOwnedPart } = useParts();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showOnlyOwned, setShowOnlyOwned] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  const currentBlader = bladers.find(b => b.id === currentBladerId) || null;

  useEffect(() => {
    fetchBladers();
    fetchParts();
  }, []);

  useEffect(() => {
    if (currentBladerId) fetchOwnedParts(currentBladerId);
  }, [currentBladerId]);

  const handleLogin = async () => {
    setLoginError('');
    try {
      const result = await api.loginBlader(loginName.trim(), loginPass);
      setCurrentBlader(result.id);
      setLoginName('');
      setLoginPass('');
    } catch {
      setLoginError(lang === 'it' ? 'Nome o password errati' : 'Wrong name or password');
    }
  };

  const filtered = useMemo(() => {
    return parts.filter(p => {
      if (typeFilter !== 'all' && p.part_type !== typeFilter) return false;
      if (showOnlyOwned && !ownedPartIds.has(p.id)) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.serial.toLowerCase().includes(q) || p.series.toLowerCase().includes(q);
      }
      return true;
    });
  }, [parts, typeFilter, showOnlyOwned, search, ownedPartIds]);

  const grouped = useMemo(() => {
    const map: Record<string, Part[]> = {};
    filtered.forEach(p => {
      if (!map[p.part_type]) map[p.part_type] = [];
      map[p.part_type].push(p);
    });
    return map;
  }, [filtered]);

  if (!currentBladerId) {
    return (
      <div className="page-inner animate-fade-in">
        <div className="flex items-center gap-sm mb-xl">
          <Wrench size={24} color="var(--accent)" />
          <h1 className="page-title" style={{ margin: 0 }}>{lang === 'it' ? 'Officina' : 'Workshop'}</h1>
        </div>
        <div className="card" style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center', padding: 32 }}>
          <User size={40} color="var(--primary)" style={{ marginBottom: 16 }} />
          <h2 style={{ fontFamily: 'Orbitron', fontSize: '1rem', marginBottom: 8 }}>
            {lang === 'it' ? 'Seleziona il tuo profilo' : 'Select your profile'}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 24 }}>
            {lang === 'it' ? 'Accedi per gestire la tua collezione di pezzi.' : 'Log in to manage your parts collection.'}
          </p>
          <div className="form-group">
            <label className="form-label">{lang === 'it' ? 'Nome Blader' : 'Blader Name'}</label>
            <input
              className="form-input"
              value={loginName}
              onChange={e => setLoginName(e.target.value)}
              placeholder={lang === 'it' ? 'Il tuo nome...' : 'Your name...'}
              list="dl-bladers"
            />
            <datalist id="dl-bladers">
              {bladers.map(b => <option key={b.id} value={b.name} />)}
            </datalist>
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={loginPass}
              onChange={e => setLoginPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
            />
          </div>
          {loginError && (
            <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: 12 }}>{loginError}</p>
          )}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleLogin}>
            {lang === 'it' ? 'Accedi' : 'Log In'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-inner animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-xl" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="flex items-center gap-sm">
          <Wrench size={24} color="var(--accent)" />
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>{lang === 'it' ? 'Officina' : 'Workshop'}</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              {lang === 'it' ? `Raccolta di ${currentBlader?.name}` : `${currentBlader?.name}'s collection`}
              {' — '}{ownedPartIds.size} {lang === 'it' ? 'pezzi' : 'parts'}
            </p>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setCurrentBlader(null)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LogOut size={14} /> {currentBlader?.name}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            placeholder={lang === 'it' ? 'Cerca...' : 'Search...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32, fontSize: '0.85rem' }}
          />
        </div>
        <select
          className="form-input"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ width: 'auto', fontSize: '0.85rem' }}
        >
          <option value="all">{lang === 'it' ? 'Tutti i tipi' : 'All types'}</option>
          {TYPE_ORDER.map(k => <option key={k} value={k}>{TYPE_LABELS[k]}</option>)}
        </select>
        <button
          className={`btn btn-sm ${showOnlyOwned ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowOnlyOwned(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Disc3 size={14} />
          {lang === 'it' ? 'Solo i miei' : 'Mine only'}
        </button>
      </div>

      {loading ? (
        <div className="empty-state card"><p>{lang === 'it' ? 'Caricamento...' : 'Loading...'}</p></div>
      ) : parts.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">🔧</div>
          <div className="empty-state-title">{lang === 'it' ? 'Nessun pezzo nel database' : 'No parts in database'}</div>
          <p className="empty-state-desc">{lang === 'it' ? 'Aggiungi i pezzi dalla pagina admin.' : 'Add parts from the admin page.'}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">{lang === 'it' ? 'Nessun risultato' : 'No results'}</div>
        </div>
      ) : (
        TYPE_ORDER.filter(t => grouped[t]?.length > 0).map(type => (
          <div key={type} style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              {TYPE_LABELS[type]} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({grouped[type].length})</span>
            </h2>
            <div className="grid-auto">
              {grouped[type].map(part => (
                <PartCard
                  key={part.id}
                  part={part}
                  owned={ownedPartIds.has(part.id)}
                  onToggle={() => toggleOwnedPart(currentBladerId!, part.id)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function PartCard({ part, owned, onToggle }: { part: Part; owned: boolean; onToggle: () => void }) {
  const ratchetLabel = part.part_type === 'ratchet' && part.protrusions && part.height
    ? `${part.protrusions}-${part.height}`
    : part.name;

  return (
    <div
      className="card"
      style={{
        borderColor: owned ? 'rgba(0,255,136,0.4)' : undefined,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
        position: 'relative',
      }}
      onClick={onToggle}
    >
      {part.color && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          width: 14, height: 14, borderRadius: '50%',
          background: part.color, border: '1px solid rgba(255,255,255,0.2)',
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ marginTop: 2, color: owned ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }}>
          {owned ? <CheckSquare size={18} /> : <Square size={18} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: '0.8rem', fontWeight: 700, color: owned ? 'var(--success)' : 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ratchetLabel}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {part.serial && <span style={{ color: 'var(--primary)' }}>{part.serial}</span>}
            {part.series && <span>{part.series}</span>}
            {part.brand && <span>{part.brand}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
