import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Upload, X, Search } from 'lucide-react';
import { useBladers, useSettings, useToast } from '../store';
import { t, Blader } from '../types';
import { BEYS } from '../data/beys';
import Modal from '../components/common/Modal';

const AVATAR_COLORS = [
  '#6C63FF', '#00d4ff', '#ff4444', '#ffd700', '#00ff88',
  '#ff5500', '#7c3aed', '#ff3366', '#00ccaa', '#ff8800',
];

export default function Bladers() {
  const { bladers, customBeys, fetchBladers, fetchCustomBeys, createBlader, updateBlader, deleteBlader } = useBladers();
  const { lang } = useSettings();
  const { addToast } = useToast();
  const tr = t[lang];

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Blader | null>(null);
  const [form, setForm] = useState<{name: string, color: string, image: string, beys: string[], password: string}>({ name: '', color: AVATAR_COLORS[0], image: '', beys: [], password: '' });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { 
    fetchBladers(); 
    fetchCustomBeys();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', color: AVATAR_COLORS[0], image: '', beys: [], password: 'changeme' });
    setShowModal(true);
  };

  const openEdit = (b: Blader) => {
    setEditing(b);
    setForm({ name: b.name, color: b.avatar_color, image: b.avatar_image || '', beys: b.beys || [], password: b.password || 'changeme' });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    try {
      if (editing) {
        await updateBlader(editing.id, form.name.trim(), form.color, form.image || undefined, form.beys, form.password);
        addToast(lang === 'it' ? 'Blader aggiornato!' : 'Blader updated!');
      } else {
        await createBlader(form.name.trim(), form.color, form.image || undefined, form.password || 'changeme');
        addToast(lang === 'it' ? 'Blader creato!' : 'Blader created!');
      }
      setShowModal(false);
    } catch {
      addToast(lang === 'it' ? 'Errore durante il salvataggio' : 'Error saving', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBlader(id);
      setDeleting(null);
      addToast(lang === 'it' ? 'Blader eliminato' : 'Blader deleted');
    } catch {
      addToast('Error', 'error');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, image: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const filteredBladers = bladers.filter((b) =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-inner animate-fade-in">
      <div className="flex items-center justify-between mb-lg" style={{ marginBottom: 8 }}>
        <div>
          <h1 className="page-title">{tr.bladers}</h1>
          <p className="page-subtitle">{lang === 'it' ? `${bladers.length} blader registrati` : `${bladers.length} registered bladers`}</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} id="btn-new-blader">
          <Plus size={16} /> {tr.new_blader}
        </button>
      </div>

      {bladers.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">🌀</div>
          <div className="empty-state-title">{tr.no_bladers}</div>
          <p className="empty-state-text">
            {lang === 'it' ? 'Aggiungi il primo blader per iniziare!' : 'Add the first blader to get started!'}
          </p>
          <button className="btn btn-primary" onClick={openCreate} id="btn-empty-add">
            <Plus size={16} /> {tr.new_blader}
          </button>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              placeholder={lang === 'it' ? 'Cerca blader...' : 'Search bladers...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 38 }}
              id="search-bladers-input"
            />
          </div>

          <div className="grid-auto">
            {filteredBladers.map((b) => (
              <BladerCard
                key={b.id}
                blader={b}
                lang={lang}
                customBeys={customBeys}
                onEdit={() => openEdit(b)}
                onDelete={() => setDeleting(b.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <Modal
          title={editing ? tr.edit : tr.new_blader}
          onClose={() => setShowModal(false)}
        >
          <div className="form-group">
            <label className="form-label">{tr.name}</label>
            <input
              className="form-input"
              placeholder={lang === 'it' ? 'Es. Valt Aoi' : 'e.g. Valt Aoi'}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
              id="blader-name-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">{lang === 'it' ? 'Password Accesso' : 'Login Password'}</label>
            <input
              className="form-input"
              type="password"
              placeholder="e.g. changeme"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              id="blader-password-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">{lang === 'it' ? 'Colore Avatar' : 'Avatar Color'}</label>
            <div className="color-swatches">
              {AVATAR_COLORS.map((c) => (
                <div
                  key={c}
                  className={`color-swatch${form.color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                />
              ))}
            </div>
          </div>

          {/* Avatar preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div
              className="avatar avatar-xl"
              style={{ background: form.color, color: 'white', fontSize: '1.4rem', fontFamily: 'Orbitron', fontWeight: 700 }}
            >
              {form.image
                ? <img src={form.image} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : (form.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?')}
            </div>
            <div>
              <label className="btn btn-ghost btn-sm" htmlFor="avatar-upload" style={{ cursor: 'pointer' }}>
                <Upload size={14} /> {lang === 'it' ? 'Carica Foto' : 'Upload Photo'}
              </label>
              <input id="avatar-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
              {form.image && (
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setForm((f) => ({ ...f, image: '' }))}>
                  <X size={14} /> {lang === 'it' ? 'Rimuovi' : 'Remove'}
                </button>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{lang === 'it' ? 'Deck (Max 3 Beys)' : 'Deck (Max 3 Beys)'}</label>
            <div className="flex gap-sm flex-wrap">
              {form.beys.map((b, i) => {
                const beyName = BEYS.find(bey => bey.id === b || bey.name === b)?.name || customBeys.find(cb => cb.id === b || cb.name === b)?.name || b;
                return (
                  <div key={i} className="badge badge-primary flex items-center gap-xs">
                    {beyName}
                    <button onClick={() => setForm(f => ({ ...f, beys: f.beys.filter((_, idx) => idx !== i) }))}>
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
            {form.beys.length < 3 && (
              <select className="form-select mt-sm" onChange={(e) => {
                if (e.target.value) {
                  setForm(f => ({ ...f, beys: [...f.beys, e.target.value] }));
                  e.target.value = '';
                }
              }}>
                <option value="">{lang === 'it' ? '+ Aggiungi Bey' : '+ Add Bey'}</option>
                <optgroup label={lang === 'it' ? 'Ufficiali' : 'Official'}>
                  {BEYS.filter(b => !form.beys.includes(b.id)).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </optgroup>
                {customBeys.length > 0 && (
                  <optgroup label={lang === 'it' ? 'Personalizzati' : 'Custom'}>
                    {customBeys.filter(cb => !form.beys.includes(cb.id)).map(cb => (
                      <option key={cb.id} value={cb.id}>{cb.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>

          <div className="flex gap-sm" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)} id="btn-cancel-blader">{tr.cancel}</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.name.trim()} id="btn-save-blader">{tr.save}</button>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleting && (
        <Modal title={lang === 'it' ? 'Conferma Eliminazione' : 'Confirm Delete'} onClose={() => setDeleting(null)}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
            {lang === 'it' ? 'Vuoi davvero eliminare questo blader?' : 'Are you sure you want to delete this blader?'}
          </p>
          <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setDeleting(null)} id="btn-cancel-delete">{tr.cancel}</button>
            <button className="btn btn-danger" onClick={() => handleDelete(deleting!)} id="btn-confirm-delete">{tr.delete}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BladerCard({ blader, lang, customBeys, onEdit, onDelete }: {
  blader: Blader; lang: string; customBeys: any[];
  onEdit: () => void; onDelete: () => void;
}) {
  const winRate = blader.wins + blader.losses > 0
    ? Math.round((blader.wins / (blader.wins + blader.losses)) * 100)
    : 0;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="flex items-center gap-md">
        <div
          className="avatar avatar-lg"
          style={{ background: blader.avatar_color, color: 'white', fontFamily: 'Orbitron', fontWeight: 700 }}
        >
          {blader.avatar_image
            ? <img src={blader.avatar_image} alt={blader.name} />
            : blader.avatar_initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', fontWeight: 700 }}>{blader.name}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {lang === 'it' ? 'Blader' : 'Blader'}
          </div>
        </div>
        <div className="flex gap-xs">
          <button className="btn btn-ghost btn-sm" onClick={onEdit} title="Edit" id={`edit-blader-${blader.id}`} style={{ padding: 6 }}>
            <Edit2 size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onDelete} title="Delete" id={`del-blader-${blader.id}`} style={{ padding: 6, color: 'var(--danger)' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid-3" style={{ gap: 8, textAlign: 'center' }}>
        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 4px' }}>
          <div style={{ fontFamily: 'Orbitron', fontWeight: 700, color: 'var(--success)', fontSize: '1.1rem' }}>{blader.wins}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{lang === 'it' ? 'Vinte' : 'Wins'}</div>
        </div>
        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 4px' }}>
          <div style={{ fontFamily: 'Orbitron', fontWeight: 700, color: 'var(--danger)', fontSize: '1.1rem' }}>{blader.losses}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{lang === 'it' ? 'Perse' : 'Lost'}</div>
        </div>
        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 4px' }}>
          <div style={{ fontFamily: 'Orbitron', fontWeight: 700, color: 'var(--accent)', fontSize: '1.1rem' }}>{blader.points_total}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pts</div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: 8, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Orbitron', textTransform: 'uppercase' }}>Deck</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(blader.beys && blader.beys.length > 0) ? blader.beys.map(bid => {
            const b = BEYS.find(bey => bey.id === bid || bey.name === bid);
            const cb = customBeys.find(bey => bey.id === bid || bey.name === bid);
            const name = b ? b.name : (cb ? cb.name : bid);
            return (
              <span key={bid} className="badge badge-muted" style={{ fontSize: '0.65rem' }}>
                {name}
              </span>
            );
          }) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>{lang === 'it' ? 'Nessun bey assegnato' : 'No beys assigned'}</span>
          )}
        </div>
      </div>

      <div>
        <div className="flex justify-between" style={{ marginBottom: 4, fontSize: '0.75rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>{lang === 'it' ? 'Tasso vittoria' : 'Win rate'}</span>
          <span style={{ fontFamily: 'Orbitron', color: 'var(--primary)' }}>{winRate}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${winRate}%` }} />
        </div>
      </div>
    </div>
  );
}
