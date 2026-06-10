import { useState, useEffect } from 'react';
import { ARENAS } from '../data/arenas';
import { useSettings, useArenas } from '../store';
import { Zap, Users, CheckCircle, Plus, Trash2 } from 'lucide-react';
import Modal from '../components/common/Modal';

export default function Arenas() {
  const { lang } = useSettings();
  const { customArenas, fetchCustomArenas, createCustomArena, deleteCustomArena } = useArenas();
  const [selected, setSelected] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    maxPlayers: 2,
    hasXtremeLine: true,
    tags: '',
    color: '#00d4ff',
  });

  useEffect(() => {
    fetchCustomArenas();
  }, [fetchCustomArenas]);

  const allArenas = [...ARENAS, ...customArenas];

  const handleCreateArena = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const tagsArray = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      await createCustomArena(
        form.name.trim(),
        form.description.trim() || (lang === 'it' ? 'Arena custom creata dall\'utente.' : 'User created custom arena.'),
        form.maxPlayers,
        form.hasXtremeLine,
        tagsArray,
        form.color
      );
      setShowModal(false);
      setForm({
        name: '',
        description: '',
        maxPlayers: 2,
        hasXtremeLine: true,
        tags: '',
        color: '#00d4ff',
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="page-inner animate-fade-in">
      <div className="flex justify-between items-center" style={{ marginBottom: 24, gap: 16 }}>
        <div>
          <h1 className="page-title">{lang === 'it' ? 'Arene Beyblade X' : 'Beyblade X Arenas'}</h1>
          <p className="page-subtitle">
            {lang === 'it'
              ? 'Le arene ufficiali e personalizzate per i tornei Beyblade X'
              : 'Official and custom arenas for Beyblade X tournaments'}
          </p>
        </div>
        <button
          className="btn flex items-center gap-xs"
          style={{ width: 'auto', padding: '10px 16px', fontSize: '0.85rem' }}
          onClick={() => setShowModal(true)}
          id="btn-create-arena"
        >
          <Plus size={16} />
          {lang === 'it' ? 'Nuova Arena' : 'New Arena'}
        </button>
      </div>

      <div className="grid-2" style={{ gap: 24 }}>
        {allArenas.map((arena) => {
          const isCustom = !ARENAS.some(a => a.id === arena.id);
          return (
            <ArenaCard
              key={arena.id}
              arena={arena}
              lang={lang}
              isSelected={selected === arena.id}
              isCustom={isCustom}
              onDelete={() => {
                if (confirm(lang === 'it' ? `Sei sicuro di voler eliminare l'arena "${arena.name}"?` : `Are you sure you want to delete arena "${arena.name}"?`)) {
                  deleteCustomArena(arena.id);
                  if (selected === arena.id) setSelected(null);
                }
              }}
              onClick={() => setSelected(selected === arena.id ? null : arena.id)}
            />
          );
        })}
      </div>

      {/* X-Treme info card */}
      <div className="card" style={{ marginTop: 24, borderColor: 'rgba(0,212,255,0.3)', background: 'rgba(0,212,255,0.04)' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <Zap size={24} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h3 style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', color: 'var(--primary)', marginBottom: 8 }}>
              {lang === 'it' ? 'Come funziona il sistema X-Treme' : 'How the X-Treme System Works'}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.7 }}>
              {lang === 'it'
                ? 'Le rotaie X-Treme Line accelerano le Bey tipo Attacco, attivando il sistema X-Dash per attacchi ad alta velocità. La zona centrale (Xtreme Zone) e le Over Zone laterali determinano i tipi di finish e i punti assegnati.'
                : 'The X-Treme Line rails accelerate Attack-type Beys, activating the X-Dash system for high-speed attacks. The central zone (Xtreme Zone) and the side Over Zones determine finish types and points awarded.'}
            </p>
          </div>
        </div>
      </div>

      {/* Create Custom Arena Modal */}
      {showModal && (
        <Modal
          title={lang === 'it' ? 'Crea Nuova Arena Custom' : 'Create New Custom Arena'}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleCreateArena} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">{lang === 'it' ? 'Nome Arena' : 'Arena Name'}</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="e.g. Hyper Stadium"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                id="custom-arena-name"
              />
            </div>

            <div className="form-group">
              <label className="form-label">{lang === 'it' ? 'Descrizione' : 'Description'}</label>
              <textarea
                className="form-input"
                style={{ minHeight: 80, resize: 'vertical' }}
                placeholder={lang === 'it' ? 'Descrivi l\'arena...' : 'Describe the arena...'}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                id="custom-arena-desc"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">{lang === 'it' ? 'Max Giocatori' : 'Max Players'}</label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  required
                  value={form.maxPlayers}
                  onChange={(e) => setForm((f) => ({ ...f, maxPlayers: parseInt(e.target.value) || 2 }))}
                  id="custom-arena-maxplayers"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{lang === 'it' ? 'Colore Neon' : 'Neon Color'}</label>
                <input
                  type="color"
                  className="form-input"
                  style={{ height: 44, padding: 4, cursor: 'pointer' }}
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  id="custom-arena-color"
                />
              </div>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
              <input
                type="checkbox"
                checked={form.hasXtremeLine}
                onChange={(e) => setForm((f) => ({ ...f, hasXtremeLine: e.target.checked }))}
                id="custom-arena-xtremeline"
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <label className="form-label" htmlFor="custom-arena-xtremeline" style={{ margin: 0, cursor: 'pointer', userSelect: 'none' }}>
                {lang === 'it' ? 'Ha linea Xtreme (Xtreme Line)' : 'Has Xtreme Line'}
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">
                {lang === 'it' ? 'Tag (separati da virgola)' : 'Tags (comma separated)'}
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Speciale, Wide, 1v1"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                id="custom-arena-tags"
              />
            </div>

            <div className="flex gap-sm justify-end" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setShowModal(false)}>
                {lang === 'it' ? 'Annulla' : 'Cancel'}
              </button>
              <button type="submit" className="btn" style={{ width: 'auto' }}>
                {lang === 'it' ? 'Salva Arena' : 'Save Arena'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function ArenaCard({
  arena,
  lang,
  isSelected,
  isCustom,
  onDelete,
  onClick,
}: {
  arena: typeof ARENAS[0];
  lang: string;
  isSelected: boolean;
  isCustom: boolean;
  onDelete: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className="card card-interactive"
      style={{
        cursor: 'pointer',
        borderColor: isSelected ? arena.color : `${arena.color}22`,
        boxShadow: isSelected ? `0 0 30px ${arena.color}30` : undefined,
        transition: 'all 0.3s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onClick={onClick}
      id={`arena-${arena.id}`}
    >
      {/* Background stadium visualization */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 180, height: 180,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${arena.color}18 0%, transparent 70%)`,
        transform: 'translate(40px, -40px)',
        pointerEvents: 'none',
      }} />

      {/* Stadium SVG illustration */}
      <div style={{
        position: 'absolute', top: 12, right: 16,
        opacity: 0.15,
      }}>
        <ArenaSvg color={arena.color} size={80} />
      </div>

      <div style={{ position: 'relative' }}>
        <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: arena.color,
            boxShadow: `0 0 8px ${arena.color}`,
          }} />
          <h2 style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', fontWeight: 700, color: arena.color }}>
            {arena.name}
          </h2>
          {isSelected && <CheckCircle size={16} color={arena.color} />}
          {isCustom && (
            <button
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--danger)',
                cursor: 'pointer',
                marginLeft: 'auto',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                zIndex: 10,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              id={`delete-arena-${arena.id}`}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 16, paddingRight: isCustom ? 24 : 0 }}>
          {arena.description}
        </p>

        <div className="flex items-center gap-md flex-wrap">
          <div className="flex items-center gap-xs" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <Users size={14} />
            {lang === 'it' ? `${arena.maxPlayers} giocatori max` : `${arena.maxPlayers} players max`}
          </div>
          {arena.hasXtremeLine && (
            <div className="flex items-center gap-xs badge badge-primary" style={{ fontSize: '0.7rem' }}>
              <Zap size={10} /> X-Line
            </div>
          )}
        </div>

        <div className="flex gap-xs flex-wrap" style={{ marginTop: 12 }}>
          {arena.tags.map((tag) => (
            <span key={tag} className="badge badge-muted">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArenaSvg({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {/* Outer bowl */}
      <ellipse cx="50" cy="50" rx="48" ry="48" stroke={color} strokeWidth="3" />
      {/* Inner bowl */}
      <ellipse cx="50" cy="50" rx="35" ry="35" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
      {/* Xtreme line rails */}
      <path d="M10 50 Q25 30 50 30 Q75 30 90 50" stroke={color} strokeWidth="2" fill="none" />
      <path d="M10 50 Q25 70 50 70 Q75 70 90 50" stroke={color} strokeWidth="2" fill="none" />
      {/* Over zones */}
      <ellipse cx="10" cy="50" rx="8" ry="12" fill={color} fillOpacity="0.3" />
      <ellipse cx="90" cy="50" rx="8" ry="12" fill={color} fillOpacity="0.3" />
      {/* Xtreme zone center */}
      <circle cx="50" cy="50" r="10" fill={color} fillOpacity="0.4" />
      <circle cx="50" cy="50" r="5" fill={color} fillOpacity="0.8" />
    </svg>
  );
}
