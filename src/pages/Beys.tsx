import { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useSettings, useBladers } from '../store';
import { BeyType, t } from '../types';
import CreateCustomBeyModal from '../components/beys/CreateCustomBeyModal';

const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attack', label: 'Attack' },
  { key: 'defense', label: 'Defense' },
  { key: 'stamina', label: 'Stamina' },
  { key: 'balance', label: 'Balance' },
];

const TYPE_ICONS: Record<BeyType, string> = {
  attack: '⚔️',
  defense: '🛡️',
  stamina: '♻️',
  balance: '⚖️',
};

export default function Beys() {
  const { lang } = useSettings();
  const tr = t[lang];
  const { customBeys, fetchCustomBeys, deleteCustomBey } = useBladers();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchCustomBeys();
  }, []);

  const allBeys = useMemo(() => {
    return customBeys.map(cb => ({
      id: cb.id,
      name: cb.name,
      fullName: `${cb.blade} ${cb.ratchet}${cb.bit}`,
      blade: cb.blade,
      ratchet: cb.ratchet,
      bit: cb.bit,
      type: (cb.type_class || 'balance') as BeyType,
      color: cb.color || '#00d4ff',
      description: cb.stats ? `${cb.type_class}` : '',
      isCustom: true,
      stats: cb.stats ? (() => { try { return JSON.parse(cb.stats); } catch { return null; } })() : null,
    }));
  }, [customBeys]);

  const filtered = allBeys.filter(b => {
    const matchSearch = b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.fullName.toLowerCase().includes(search.toLowerCase());
    const matchType = filter === 'all' || b.type === filter;
    return matchSearch && matchType;
  });

  return (
    <div className="page-inner animate-fade-in">
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 className="page-title">{lang === 'it' ? 'I Miei Beyblade' : 'My Beyblades'}</h1>
          <p className="page-subtitle">
            {customBeys.length} {lang === 'it' ? 'Bey personalizzati' : 'custom Beys'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + {lang === 'it' ? 'Crea Bey' : 'Create Bey'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-md flex-wrap" style={{ marginBottom: 24 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            placeholder={lang === 'it' ? 'Cerca per nome...' : 'Search by name...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div className="flex gap-xs flex-wrap">
          {TYPE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(key)}
            >
              {key !== 'all' && <span>{TYPE_ICONS[key as BeyType]}</span>}
              {key === 'all' ? (lang === 'it' ? 'Tutti' : 'All') : (lang === 'it' ? tr[key] : label)}
            </button>
          ))}
        </div>
      </div>

      {customBeys.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">🌀</div>
          <div className="empty-state-title">{lang === 'it' ? 'Nessun Bey ancora' : 'No Beys yet'}</div>
          <p className="empty-state-desc">{lang === 'it' ? 'Crea il tuo primo Bey personalizzato!' : 'Create your first custom Bey!'}</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ marginTop: 16 }}>
            + {lang === 'it' ? 'Crea Bey' : 'Create Bey'}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">{lang === 'it' ? 'Nessun risultato' : 'No results'}</div>
        </div>
      ) : (
        <div className="grid-auto">
          {filtered.map(bey => (
            <BeyCard key={bey.id} bey={bey} lang={lang} onDelete={() => deleteCustomBey(bey.id)} />
          ))}
        </div>
      )}

      {showModal && <CreateCustomBeyModal onClose={() => { setShowModal(false); fetchCustomBeys(); }} lang={lang} />}
    </div>
  );
}

function BeyCard({ bey, lang, onDelete }: { bey: any; lang: string; onDelete: () => void }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="card card-interactive"
      style={{ cursor: 'pointer', borderColor: `${bey.color}33`, position: 'relative', overflow: 'hidden' }}
      onClick={() => setFlipped(!flipped)}
    >
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 80% 20%, ${bey.color}15 0%, transparent 60%)`, pointerEvents: 'none' }} />

      {!flipped ? (
        <>
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
            <span className="badge badge-gold" style={{ fontSize: '0.6rem' }}>CUSTOM</span>
            <button
              className="btn btn-ghost"
              style={{ padding: 4, minWidth: 24, height: 24, background: 'rgba(255,0,0,0.1)' }}
              onClick={e => { e.stopPropagation(); onDelete(); }}
            >
              🗑️
            </button>
          </div>
          <div className="flex items-center gap-md" style={{ marginBottom: 12 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: `conic-gradient(from 0deg, ${bey.color}, ${bey.color}44, ${bey.color})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'spin-bey 4s linear infinite',
              boxShadow: `0 0 20px ${bey.color}44`,
              flexShrink: 0,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                {TYPE_ICONS[bey.type as BeyType]}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', fontWeight: 700, color: bey.color }}>{bey.name}</div>
              <span className={`badge badge-${bey.type}`} style={{ marginTop: 4 }}>{bey.type}</span>
            </div>
          </div>
          <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            {bey.fullName}
          </div>
          <div style={{ marginTop: 12, fontSize: '0.7rem', color: 'var(--text-faint)', fontFamily: 'Orbitron' }}>
            {lang === 'it' ? 'Clicca per dettagli →' : 'Click for details →'}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', fontWeight: 700, color: bey.color, marginBottom: 16 }}>{bey.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Blade', value: bey.blade },
              { label: 'Ratchet', value: bey.ratchet },
              { label: 'Bit', value: bey.bit },
              { label: 'Type', value: bey.type.charAt(0).toUpperCase() + bey.type.slice(1) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center" style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                <span style={{ fontFamily: 'Orbitron', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
                <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem' }}>{value}</span>
              </div>
            ))}
          </div>
          {bey.stats && (
            <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'space-between', fontSize: '0.65rem', fontFamily: 'Orbitron', color: 'var(--text-muted)' }}>
              <span>ATK: {bey.stats.attack}</span>
              <span>DEF: {bey.stats.defense}</span>
              <span>STA: {bey.stats.stamina}</span>
              <span>SPD: {bey.stats.speed}</span>
            </div>
          )}
          <div style={{ marginTop: 16, fontSize: '0.7rem', color: 'var(--text-faint)', fontFamily: 'Orbitron', textAlign: 'center' }}>
            {lang === 'it' ? '← Clicca per tornare' : '← Click to go back'}
          </div>
        </>
      )}
    </div>
  );
}
